import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { EmbeddingBackend } from '../embeddings/index.js';
import { ASTChunker } from './ast-chunker.js';
import { loadConfig, getDefaultPatterns, getDefaultExcludePatterns, type LanceContextConfig } from '../config.js';

export interface CodeChunk {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
  embedding?: number[];
}

export interface IndexStatus {
  indexed: boolean;
  fileCount: number;
  chunkCount: number;
  lastUpdated: string | null;
  indexPath: string;
}

interface FileMetadata {
  filePath: string;
  mtime: number;
}

interface FileChanges {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
}

export interface IndexProgress {
  phase: 'scanning' | 'chunking' | 'embedding' | 'storing' | 'complete';
  current: number;
  total: number;
  message: string;
}

export type ProgressCallback = (progress: IndexProgress) => void;

const CHUNK_SIZE = 100; // lines per chunk
const CHUNK_OVERLAP = 20; // overlap between chunks

/**
 * Code indexer using LanceDB for vector storage
 */
export class CodeIndexer {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private metadataTable: lancedb.Table | null = null;
  private embeddingBackend: EmbeddingBackend;
  private indexPath: string;
  private projectPath: string;
  private config: LanceContextConfig | null = null;

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

  /**
   * Get the modification time of a file
   */
  private async getFileMtime(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
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
      metadata.set(row.filePath, row.mtime);
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

    for (const filePath of currentFiles) {
      const relativePath = path.relative(this.projectPath, filePath);
      currentFilesSet.add(relativePath);
      const currentMtime = await this.getFileMtime(filePath);
      const storedMtime = storedMetadata.get(relativePath);

      if (storedMtime === undefined) {
        changes.added.push(filePath);
      } else if (currentMtime > storedMtime) {
        changes.modified.push(filePath);
      } else {
        changes.unchanged.push(filePath);
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
    const metadata: Array<{ filePath: string; mtime: number }> = [];
    for (const filePath of files) {
      const relativePath = path.relative(this.projectPath, filePath);
      const mtime = await this.getFileMtime(filePath);
      metadata.push({ filePath: relativePath, mtime });
    }

    // Drop and recreate metadata table
    const tableNames = await this.db!.tableNames();
    if (tableNames.includes('file_metadata')) {
      await this.db!.dropTable('file_metadata');
    }

    if (metadata.length > 0) {
      this.metadataTable = await this.db!.createTable('file_metadata', metadata as Record<string, unknown>[]);
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
      };
    }

    this.table = await this.db!.openTable('code_chunks');
    const count = await this.table.countRows();

    return {
      indexed: true,
      fileCount: 0, // Would need to query distinct files
      chunkCount: count,
      lastUpdated: new Date().toISOString(),
      indexPath: this.indexPath,
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
    const effectiveExcludePatterns = excludePatterns || this.config?.excludePatterns || getDefaultExcludePatterns();

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

    report({ phase: 'scanning', current: files.length, total: files.length, message: `Found ${files.length} files to index` });

    // Check if we can do incremental indexing
    const tableNames = await this.db!.tableNames();
    const hasExistingIndex = tableNames.includes('code_chunks');
    const canDoIncremental = hasExistingIndex && !forceReindex;

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
        report({ phase: 'chunking', current: i + 1, total: files.length, message: `Chunked ${i + 1}/${files.length} files (${allChunks.length} chunks)` });
      }
    }

    report({ phase: 'chunking', current: files.length, total: files.length, message: `Created ${allChunks.length} chunks` });

    // Generate embeddings in batches
    await this.embedChunks(allChunks, onProgress);

    // Store in LanceDB
    const data = allChunks.map((chunk) => ({
      id: chunk.id,
      filePath: chunk.filePath,
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
      report({ phase: 'complete', current: 0, total: 0, message: 'No changes detected, index is up to date' });
      this.table = await this.db!.openTable('code_chunks');
      const count = await this.table.countRows();
      return {
        filesIndexed: 0,
        chunksCreated: count,
        incremental: true,
      };
    }

    report({ phase: 'scanning', current: 0, total: filesToProcess.length, message: `Incremental update: ${changes.added.length} added, ${changes.modified.length} modified, ${changes.deleted.length} deleted` });

    // Open the existing table
    this.table = await this.db!.openTable('code_chunks');

    // Delete chunks from modified and deleted files
    const filesToRemove = [...changes.modified.map(f => path.relative(this.projectPath, f)), ...changes.deleted];
    if (filesToRemove.length > 0) {
      for (const relativePath of filesToRemove) {
        await this.table.delete(`filePath = '${relativePath.replace(/'/g, "''")}'`);
      }
      report({ phase: 'chunking', current: 0, total: filesToProcess.length, message: `Removed chunks from ${filesToRemove.length} files` });
    }

    // Process new and modified files
    if (filesToProcess.length > 0) {
      const newChunks: CodeChunk[] = [];
      for (let i = 0; i < filesToProcess.length; i++) {
        const chunks = await this.chunkFile(filesToProcess[i]);
        newChunks.push(...chunks);
      }

      report({ phase: 'chunking', current: filesToProcess.length, total: filesToProcess.length, message: `Created ${newChunks.length} new chunks` });

      // Generate embeddings
      await this.embedChunks(newChunks, onProgress);

      // Add new chunks to the table
      const data = newChunks.map((chunk) => ({
        id: chunk.id,
        filePath: chunk.filePath,
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
      report({ phase: 'embedding', current: i + batch.length, total: chunks.length, message: `Embedded ${i + batch.length}/${chunks.length} chunks` });
    }
  }

  private async chunkFile(filePath: string): Promise<CodeChunk[]> {
    const ext = path.extname(filePath).slice(1);
    const language = this.getLanguage(ext);
    const relativePath = path.relative(this.projectPath, filePath);

    // Try AST-aware chunking for supported languages
    if (ASTChunker.canParse(filePath)) {
      try {
        return await this.chunkFileWithAST(filePath, relativePath, language);
      } catch (error) {
        // Fall back to line-based chunking if AST parsing fails
        console.error(`[lance-context] AST parsing failed for ${relativePath}, falling back to line-based chunking`);
      }
    }

    // Line-based chunking for unsupported languages or as fallback
    return this.chunkFileByLines(filePath, relativePath, language);
  }

  /**
   * Chunk a file using AST-aware parsing
   */
  private async chunkFileWithAST(
    filePath: string,
    relativePath: string,
    language: string
  ): Promise<CodeChunk[]> {
    const astChunker = new ASTChunker();
    const astChunks = await astChunker.chunkFile(filePath);

    return astChunks.map((chunk) => ({
      id: `${relativePath}:${chunk.startLine}-${chunk.endLine}${chunk.name ? `:${chunk.name}` : ''}`,
      filePath: relativePath,
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
    filePath: string,
    relativePath: string,
    language: string
  ): Promise<CodeChunk[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    const chunks: CodeChunk[] = [];
    for (let i = 0; i < lines.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      const chunkLines = lines.slice(i, i + CHUNK_SIZE);
      const chunkContent = chunkLines.join('\n');

      if (chunkContent.trim().length === 0) continue;

      chunks.push({
        id: `${relativePath}:${i + 1}-${i + chunkLines.length}`,
        filePath: relativePath,
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

  async search(query: string, limit: number = 10): Promise<CodeChunk[]> {
    if (!this.table) {
      const status = await this.getStatus();
      if (!status.indexed) {
        throw new Error('Codebase not indexed. Run index_codebase first.');
      }
    }

    const queryEmbedding = await this.embeddingBackend.embed(query);

    // Fetch more results than needed for re-ranking
    const fetchLimit = Math.min(limit * 3, 50);
    const results = await this.table!.search(queryEmbedding).limit(fetchLimit).toArray();

    // Hybrid scoring: combine semantic similarity with keyword matching
    const scoredResults = results.map((r, index) => {
      // Semantic score: inverse of rank (higher is better)
      const semanticScore = 1 - index / fetchLimit;

      // Keyword score: based on query term matches
      const keywordScore = this.calculateKeywordScore(query, r.content, r.filePath);

      // Combined score (weighted: 70% semantic, 30% keyword)
      const combinedScore = 0.7 * semanticScore + 0.3 * keywordScore;

      return { result: r, score: combinedScore };
    });

    // Sort by combined score and take top results
    scoredResults.sort((a, b) => b.score - a.score);

    return scoredResults.slice(0, limit).map((sr) => ({
      id: sr.result.id,
      filePath: sr.result.filePath,
      content: sr.result.content,
      startLine: sr.result.startLine,
      endLine: sr.result.endLine,
      language: sr.result.language,
    }));
  }

  /**
   * Calculate keyword match score for hybrid search
   */
  private calculateKeywordScore(query: string, content: string, filePath: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    if (queryTerms.length === 0) return 0;

    const contentLower = content.toLowerCase();
    const filePathLower = filePath.toLowerCase();

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
      if (filePathLower.includes(term)) {
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
  }
}
