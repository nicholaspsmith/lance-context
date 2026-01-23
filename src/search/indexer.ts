import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { EmbeddingBackend } from '../embeddings/index.js';
import { ASTChunker } from './ast-chunker.js';
import {
  loadConfig,
  getDefaultPatterns,
  getDefaultExcludePatterns,
  getChunkingConfig,
  getSearchConfig,
  type LanceContextConfig,
} from '../config.js';

/**
 * Represents a chunk of code that has been indexed.
 * Each chunk contains a portion of a source file with its location metadata.
 */
export interface CodeChunk {
  /** Unique identifier for this chunk (format: filepath:startLine-endLine) */
  id: string;
  /** Relative path to the source file from the project root */
  filepath: string;
  /** The actual source code content of this chunk */
  content: string;
  /** Starting line number in the source file (1-indexed) */
  startLine: number;
  /** Ending line number in the source file (1-indexed) */
  endLine: number;
  /** Programming language of the source code */
  language: string;
  /** Vector embedding for semantic search (populated during indexing) */
  embedding?: number[];
}

/**
 * Status information about the code index.
 */
export interface IndexStatus {
  /** Whether the codebase has been indexed */
  indexed: boolean;
  /** Number of files that have been indexed */
  fileCount: number;
  /** Total number of code chunks in the index */
  chunkCount: number;
  /** ISO timestamp of the last index update, or null if never indexed */
  lastUpdated: string | null;
  /** Path to the LanceDB index directory */
  indexPath: string;
  /** Name of the embedding backend used */
  embeddingBackend?: string;
  /** Model identifier used for embeddings */
  embeddingModel?: string;
}

interface IndexMetadata {
  lastUpdated: string;
  fileCount: number;
  chunkCount: number;
  embeddingBackend: string;
  embeddingModel?: string;
  embeddingDimensions: number;
  version: string;
}

// Note: FileMetadata is used for LanceDB schema and is implicitly typed
// interface FileMetadata {
//   filepath: string;
//   mtime: number;
// }

interface FileChanges {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
}

/**
 * Progress information during indexing operations.
 * Used to report status to callers via the progress callback.
 */
export interface IndexProgress {
  /** Current phase of the indexing process */
  phase: 'scanning' | 'chunking' | 'embedding' | 'storing' | 'complete';
  /** Current progress count within the phase */
  current: number;
  /** Total items to process in the current phase */
  total: number;
  /** Human-readable status message */
  message: string;
}

/**
 * Callback function for receiving indexing progress updates.
 */
export type ProgressCallback = (progress: IndexProgress) => void;

/**
 * Sanitize a file path for use in LanceDB filter expressions.
 * Prevents SQL injection by only allowing safe path characters.
 */
function sanitizePathForFilter(filepath: string): string {
  // Only allow safe file path characters: alphanumeric, /, ., -, _, space
  // This is more restrictive than escaping and prevents injection attacks
  if (!/^[\w\s./-]+$/.test(filepath)) {
    // If path contains unusual characters, escape single quotes and backslashes
    return filepath.replace(/\\/g, '\\\\').replace(/'/g, "''");
  }
  return filepath.replace(/'/g, "''");
}

/**
 * Code indexer that uses LanceDB for vector storage and semantic search.
 *
 * Provides functionality to:
 * - Index a codebase by chunking files and generating embeddings
 * - Perform hybrid semantic + keyword search
 * - Support incremental indexing (only re-index changed files)
 *
 * @example
 * ```typescript
 * const backend = await createEmbeddingBackend();
 * const indexer = new CodeIndexer('/path/to/project', backend);
 * await indexer.initialize();
 *
 * // Index the codebase
 * await indexer.indexCodebase();
 *
 * // Search for code
 * const results = await indexer.search('authentication middleware');
 * ```
 */
/** Maximum number of query embeddings to cache */
const QUERY_CACHE_MAX_SIZE = 100;

export class CodeIndexer {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private metadataTable: lancedb.Table | null = null;
  private embeddingBackend: EmbeddingBackend;
  private indexPath: string;
  private projectPath: string;
  private config: LanceContextConfig | null = null;
  /** LRU cache for query embeddings to avoid recomputing identical queries */
  private queryEmbeddingCache: Map<string, number[]> = new Map();

  constructor(projectPath: string, embeddingBackend: EmbeddingBackend) {
    this.projectPath = projectPath;
    this.embeddingBackend = embeddingBackend;
    this.indexPath = path.join(projectPath, '.lance-context');
  }

  async initialize(): Promise<void> {
    this.db = await lancedb.connect(this.indexPath);
    this.config = await loadConfig(this.projectPath);
    console.error(`[lance-context] Loaded config with ${this.config.patterns?.length} patterns`);
  }

  private get metadataPath(): string {
    return path.join(this.indexPath, 'index-metadata.json');
  }

  /**
   * Save index metadata to disk
   */
  private async saveIndexMetadata(fileCount: number, chunkCount: number): Promise<void> {
    const metadata: IndexMetadata = {
      lastUpdated: new Date().toISOString(),
      fileCount,
      chunkCount,
      embeddingBackend: this.embeddingBackend.name,
      embeddingDimensions: this.embeddingBackend.getDimensions(),
      version: '1.0.0',
    };

    await fs.writeFile(this.metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Load index metadata from disk
   */
  private async loadIndexMetadata(): Promise<IndexMetadata | null> {
    try {
      const content = await fs.readFile(this.metadataPath, 'utf-8');
      return JSON.parse(content) as IndexMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Get the modification time of a file
   */
  private async getFileMtime(filepath: string): Promise<number> {
    const stats = await fs.stat(filepath);
    return stats.mtimeMs;
  }

  /**
   * Get stored metadata for all indexed files
   */
  private async getStoredMetadata(): Promise<Map<string, number>> {
    const tableNames = await this.db!.tableNames();
    if (!tableNames.includes('file_metadata')) {
      return new Map();
    }

    this.metadataTable = await this.db!.openTable('file_metadata');
    const rows = await this.metadataTable.query().toArray();
    const metadata = new Map<string, number>();
    for (const row of rows) {
      metadata.set(row.filepath, row.mtime);
    }
    return metadata;
  }

  /**
   * Detect which files have been added, modified, or deleted
   */
  private async detectFileChanges(currentFiles: string[]): Promise<FileChanges> {
    const storedMetadata = await this.getStoredMetadata();
    const changes: FileChanges = {
      added: [],
      modified: [],
      deleted: [],
      unchanged: [],
    };

    const currentFilesSet = new Set<string>();

    for (const filepath of currentFiles) {
      const relativePath = path.relative(this.projectPath, filepath);
      currentFilesSet.add(relativePath);
      const currentMtime = await this.getFileMtime(filepath);
      const storedMtime = storedMetadata.get(relativePath);

      if (storedMtime === undefined) {
        changes.added.push(filepath);
      } else if (currentMtime > storedMtime) {
        changes.modified.push(filepath);
      } else {
        changes.unchanged.push(filepath);
      }
    }

    // Find deleted files
    for (const [relativePath] of storedMetadata) {
      if (!currentFilesSet.has(relativePath)) {
        changes.deleted.push(relativePath);
      }
    }

    return changes;
  }

  /**
   * Save metadata for indexed files
   */
  private async saveFileMetadata(files: string[]): Promise<void> {
    const metadata: Array<{ filepath: string; mtime: number }> = [];
    for (const filepath of files) {
      const relativePath = path.relative(this.projectPath, filepath);
      const mtime = await this.getFileMtime(filepath);
      metadata.push({ filepath: relativePath, mtime });
    }

    // Drop and recreate metadata table
    const tableNames = await this.db!.tableNames();
    if (tableNames.includes('file_metadata')) {
      await this.db!.dropTable('file_metadata');
    }

    if (metadata.length > 0) {
      this.metadataTable = await this.db!.createTable(
        'file_metadata',
        metadata as Record<string, unknown>[]
      );
    }
  }

  async getStatus(): Promise<IndexStatus> {
    const tableNames = await this.db?.tableNames();
    const hasTable = tableNames?.includes('code_chunks') ?? false;

    if (!hasTable) {
      return {
        indexed: false,
        fileCount: 0,
        chunkCount: 0,
        lastUpdated: null,
        indexPath: this.indexPath,
        embeddingBackend: this.embeddingBackend.name,
      };
    }

    this.table = await this.db!.openTable('code_chunks');
    const count = await this.table.countRows();

    // Load persisted metadata
    const metadata = await this.loadIndexMetadata();

    return {
      indexed: true,
      fileCount: metadata?.fileCount ?? 0,
      chunkCount: count,
      lastUpdated: metadata?.lastUpdated ?? null,
      indexPath: this.indexPath,
      embeddingBackend: metadata?.embeddingBackend ?? this.embeddingBackend.name,
    };
  }

  async indexCodebase(
    patterns?: string[],
    excludePatterns?: string[],
    forceReindex: boolean = false,
    onProgress?: ProgressCallback
  ): Promise<{ filesIndexed: number; chunksCreated: number; incremental: boolean }> {
    const { glob } = await import('glob');

    const report = (progress: IndexProgress) => {
      console.error(`[lance-context] ${progress.message}`);
      onProgress?.(progress);
    };

    // Use provided patterns or fall back to config/defaults
    const effectivePatterns = patterns || this.config?.patterns || getDefaultPatterns();
    const effectiveExcludePatterns =
      excludePatterns || this.config?.excludePatterns || getDefaultExcludePatterns();

    report({ phase: 'scanning', current: 0, total: 0, message: 'Scanning for files...' });

    // Find all matching files
    const files: string[] = [];
    for (const pattern of effectivePatterns) {
      const matches = await glob(pattern, {
        cwd: this.projectPath,
        ignore: effectiveExcludePatterns,
        absolute: true,
      });
      files.push(...matches);
    }

    report({
      phase: 'scanning',
      current: files.length,
      total: files.length,
      message: `Found ${files.length} files to index`,
    });

    // Check if we can do incremental indexing
    const tableNames = await this.db!.tableNames();
    const hasExistingIndex = tableNames.includes('code_chunks');

    // Check for embedding dimension mismatch
    let dimensionMismatch = false;
    if (hasExistingIndex && !forceReindex) {
      const metadata = await this.loadIndexMetadata();
      const currentDimensions = this.embeddingBackend.getDimensions();
      if (metadata?.embeddingDimensions && metadata.embeddingDimensions !== currentDimensions) {
        console.error(
          `[lance-context] Embedding dimension mismatch: index has ${metadata.embeddingDimensions}, ` +
            `current backend (${this.embeddingBackend.name}) uses ${currentDimensions}. Forcing full reindex.`
        );
        dimensionMismatch = true;
      }
    }

    const canDoIncremental = hasExistingIndex && !forceReindex && !dimensionMismatch;

    if (canDoIncremental) {
      return this.indexIncremental(files, onProgress);
    }

    // Full reindex
    return this.indexFull(files, onProgress);
  }

  /**
   * Perform a full reindex of all files
   */
  private async indexFull(
    files: string[],
    onProgress?: ProgressCallback
  ): Promise<{ filesIndexed: number; chunksCreated: number; incremental: boolean }> {
    const report = (progress: IndexProgress) => {
      console.error(`[lance-context] ${progress.message}`);
      onProgress?.(progress);
    };

    // Process files into chunks
    report({ phase: 'chunking', current: 0, total: files.length, message: 'Chunking files...' });

    const allChunks: CodeChunk[] = [];
    for (let i = 0; i < files.length; i++) {
      const chunks = await this.chunkFile(files[i]);
      allChunks.push(...chunks);
      if ((i + 1) % 50 === 0 || i === files.length - 1) {
        report({
          phase: 'chunking',
          current: i + 1,
          total: files.length,
          message: `Chunked ${i + 1}/${files.length} files (${allChunks.length} chunks)`,
        });
      }
    }

    report({
      phase: 'chunking',
      current: files.length,
      total: files.length,
      message: `Created ${allChunks.length} chunks`,
    });

    // Generate embeddings in batches
    await this.embedChunks(allChunks, onProgress);

    // Store in LanceDB
    const data = allChunks.map((chunk) => ({
      id: chunk.id,
      filepath: chunk.filepath,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      language: chunk.language,
      vector: chunk.embedding,
    }));

    // Drop existing table if exists
    const tableNames = await this.db!.tableNames();
    if (tableNames.includes('code_chunks')) {
      await this.db!.dropTable('code_chunks');
    }

    this.table = await this.db!.createTable('code_chunks', data);

    // Save file metadata for future incremental indexing
    await this.saveFileMetadata(files);

    // Save index metadata
    await this.saveIndexMetadata(files.length, allChunks.length);

    return {
      filesIndexed: files.length,
      chunksCreated: allChunks.length,
      incremental: false,
    };
  }

  /**
   * Perform incremental indexing - only process changed files
   */
  private async indexIncremental(
    files: string[],
    onProgress?: ProgressCallback
  ): Promise<{ filesIndexed: number; chunksCreated: number; incremental: boolean }> {
    const report = (progress: IndexProgress) => {
      console.error(`[lance-context] ${progress.message}`);
      onProgress?.(progress);
    };

    const changes = await this.detectFileChanges(files);

    const filesToProcess = [...changes.added, ...changes.modified];
    const hasChanges = filesToProcess.length > 0 || changes.deleted.length > 0;

    if (!hasChanges) {
      report({
        phase: 'complete',
        current: 0,
        total: 0,
        message: 'No changes detected, index is up to date',
      });
      this.table = await this.db!.openTable('code_chunks');
      const count = await this.table.countRows();
      return {
        filesIndexed: 0,
        chunksCreated: count,
        incremental: true,
      };
    }

    report({
      phase: 'scanning',
      current: 0,
      total: filesToProcess.length,
      message: `Incremental update: ${changes.added.length} added, ${changes.modified.length} modified, ${changes.deleted.length} deleted`,
    });

    // Open the existing table
    this.table = await this.db!.openTable('code_chunks');

    // Delete chunks from modified and deleted files
    const filesToRemove = [
      ...changes.modified.map((f) => path.relative(this.projectPath, f)),
      ...changes.deleted,
    ];
    if (filesToRemove.length > 0) {
      for (const relativePath of filesToRemove) {
        const sanitizedPath = sanitizePathForFilter(relativePath);
        await this.table.delete(`filepath = '${sanitizedPath}'`);
      }
      report({
        phase: 'chunking',
        current: 0,
        total: filesToProcess.length,
        message: `Removed chunks from ${filesToRemove.length} files`,
      });
    }

    // Process new and modified files
    if (filesToProcess.length > 0) {
      const newChunks: CodeChunk[] = [];
      for (let i = 0; i < filesToProcess.length; i++) {
        const chunks = await this.chunkFile(filesToProcess[i]);
        newChunks.push(...chunks);
      }

      report({
        phase: 'chunking',
        current: filesToProcess.length,
        total: filesToProcess.length,
        message: `Created ${newChunks.length} new chunks`,
      });

      // Generate embeddings
      await this.embedChunks(newChunks, onProgress);

      // Add new chunks to the table
      const data = newChunks.map((chunk) => ({
        id: chunk.id,
        filepath: chunk.filepath,
        content: chunk.content,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        language: chunk.language,
        vector: chunk.embedding,
      }));

      if (data.length > 0) {
        await this.table.add(data);
      }
    }

    // Update file metadata
    const allCurrentFiles = [...changes.unchanged, ...changes.added, ...changes.modified];
    await this.saveFileMetadata(allCurrentFiles);

    const totalChunks = await this.table.countRows();

    // Save index metadata
    await this.saveIndexMetadata(allCurrentFiles.length, totalChunks);

    return {
      filesIndexed: filesToProcess.length,
      chunksCreated: totalChunks,
      incremental: true,
    };
  }

  /**
   * Generate embeddings for chunks in batches
   */
  private async embedChunks(chunks: CodeChunk[], onProgress?: ProgressCallback): Promise<void> {
    const report = (progress: IndexProgress) => {
      console.error(`[lance-context] ${progress.message}`);
      onProgress?.(progress);
    };

    const batchSize = 32;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.content);
      const embeddings = await this.embeddingBackend.embedBatch(texts);
      batch.forEach((chunk, idx) => {
        chunk.embedding = embeddings[idx];
      });
      report({
        phase: 'embedding',
        current: i + batch.length,
        total: chunks.length,
        message: `Embedded ${i + batch.length}/${chunks.length} chunks`,
      });
    }
  }

  private async chunkFile(filepath: string): Promise<CodeChunk[]> {
    const ext = path.extname(filepath).slice(1);
    const language = this.getLanguage(ext);
    const relativePath = path.relative(this.projectPath, filepath);

    // Try AST-aware chunking for supported languages
    if (ASTChunker.canParse(filepath)) {
      try {
        return await this.chunkFileWithAST(filepath, relativePath, language);
      } catch {
        // Fall back to line-based chunking if AST parsing fails
        console.error(
          `[lance-context] AST parsing failed for ${relativePath}, falling back to line-based chunking`
        );
      }
    }

    // Line-based chunking for unsupported languages or as fallback
    return this.chunkFileByLines(filepath, relativePath, language);
  }

  /**
   * Chunk a file using AST-aware parsing
   */
  private async chunkFileWithAST(
    filepath: string,
    relativePath: string,
    language: string
  ): Promise<CodeChunk[]> {
    const astChunker = new ASTChunker();
    const astChunks = await astChunker.chunkFile(filepath);

    return astChunks.map((chunk) => ({
      id: `${relativePath}:${chunk.startLine}-${chunk.endLine}${chunk.name ? `:${chunk.name}` : ''}`,
      filepath: relativePath,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      language,
    }));
  }

  /**
   * Chunk a file using line-based splitting (fallback)
   */
  private async chunkFileByLines(
    filepath: string,
    relativePath: string,
    language: string
  ): Promise<CodeChunk[]> {
    const content = await fs.readFile(filepath, 'utf-8');
    const lines = content.split('\n');
    const chunkingConfig = getChunkingConfig(this.config!);
    const chunkSize = chunkingConfig.maxLines;
    const chunkOverlap = chunkingConfig.overlap;

    const chunks: CodeChunk[] = [];
    for (let i = 0; i < lines.length; i += chunkSize - chunkOverlap) {
      const chunkLines = lines.slice(i, i + chunkSize);
      const chunkContent = chunkLines.join('\n');

      if (chunkContent.trim().length === 0) continue;

      chunks.push({
        id: `${relativePath}:${i + 1}-${i + chunkLines.length}`,
        filepath: relativePath,
        content: chunkContent,
        startLine: i + 1,
        endLine: i + chunkLines.length,
        language,
      });
    }

    return chunks;
  }

  private getLanguage(ext: string): string {
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      rb: 'ruby',
      php: 'php',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      swift: 'swift',
      kt: 'kotlin',
      md: 'markdown',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
    };
    return langMap[ext] || ext;
  }

  /**
   * Get query embedding from cache or compute it.
   * Uses LRU eviction when cache is full.
   */
  private async getQueryEmbedding(query: string): Promise<number[]> {
    // Check cache first
    const cached = this.queryEmbeddingCache.get(query);
    if (cached) {
      // Move to end for LRU (delete and re-insert)
      this.queryEmbeddingCache.delete(query);
      this.queryEmbeddingCache.set(query, cached);
      return cached;
    }

    // Compute embedding
    const embedding = await this.embeddingBackend.embed(query);

    // Evict oldest entry if cache is full (first entry in Map)
    if (this.queryEmbeddingCache.size >= QUERY_CACHE_MAX_SIZE) {
      const oldestKey = this.queryEmbeddingCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.queryEmbeddingCache.delete(oldestKey);
      }
    }

    // Store in cache
    this.queryEmbeddingCache.set(query, embedding);
    return embedding;
  }

  async search(query: string, limit: number = 10): Promise<CodeChunk[]> {
    if (!this.table) {
      const status = await this.getStatus();
      if (!status.indexed) {
        throw new Error('Codebase not indexed. Run index_codebase first.');
      }
    }

    const queryEmbedding = await this.getQueryEmbedding(query);
    const searchConfig = getSearchConfig(this.config!);

    // Fetch more results than needed for re-ranking
    const fetchLimit = Math.min(limit * 3, 50);
    const results = await this.table!.search(queryEmbedding).limit(fetchLimit).toArray();

    // Hybrid scoring: combine semantic similarity with keyword matching
    const scoredResults = results.map((r, index) => {
      // Semantic score: inverse of rank (higher is better)
      const semanticScore = 1 - index / fetchLimit;

      // Keyword score: based on query term matches
      const keywordScore = this.calculateKeywordScore(query, r.content, r.filepath);

      // Combined score using configurable weights
      const combinedScore =
        searchConfig.semanticWeight * semanticScore + searchConfig.keywordWeight * keywordScore;

      return { result: r, score: combinedScore };
    });

    // Sort by combined score and take top results
    scoredResults.sort((a, b) => b.score - a.score);

    return scoredResults.slice(0, limit).map((sr) => ({
      id: sr.result.id,
      filepath: sr.result.filepath,
      content: sr.result.content,
      startLine: sr.result.startLine,
      endLine: sr.result.endLine,
      language: sr.result.language,
    }));
  }

  /**
   * Calculate keyword match score for hybrid search
   */
  private calculateKeywordScore(query: string, content: string, filepath: string): number {
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    if (queryTerms.length === 0) return 0;

    const contentLower = content.toLowerCase();
    const filepathLower = filepath.toLowerCase();

    let matchCount = 0;
    let exactMatchBonus = 0;

    for (const term of queryTerms) {
      // Check content matches
      if (contentLower.includes(term)) {
        matchCount++;

        // Bonus for exact word match (not just substring)
        const wordBoundaryRegex = new RegExp(`\\b${term}\\b`, 'i');
        if (wordBoundaryRegex.test(content)) {
          exactMatchBonus += 0.5;
        }
      }

      // Bonus for filename/path match
      if (filepathLower.includes(term)) {
        matchCount += 0.5;
      }
    }

    // Normalize score to 0-1 range
    const baseScore = matchCount / queryTerms.length;
    const bonusScore = Math.min(exactMatchBonus / queryTerms.length, 0.5);

    return Math.min(baseScore + bonusScore, 1);
  }

  async clearIndex(): Promise<void> {
    const tableNames = await this.db!.tableNames();
    if (tableNames.includes('code_chunks')) {
      await this.db!.dropTable('code_chunks');
    }
    this.table = null;
    // Clear query embedding cache to prevent stale embeddings
    this.queryEmbeddingCache.clear();
  }
}
