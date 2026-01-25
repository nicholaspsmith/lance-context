import * as lancedb from '@lancedb/lancedb';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { EmbeddingBackend } from '../embeddings/index.js';
import { ASTChunker } from './ast-chunker.js';
import { TreeSitterChunker } from './tree-sitter-chunker.js';
import {
  loadConfig,
  getDefaultPatterns,
  getDefaultExcludePatterns,
  getChunkingConfig,
  getSearchConfig,
  type LanceContextConfig,
} from '../config.js';
import { TTLCache } from '../utils/cache.js';
import { minimatch } from 'minimatch';
import { mapInBatches } from '../utils/concurrency.js';
import {
  kMeansClustering,
  calculateSilhouetteScore,
  type ConceptCluster,
  type ClusteringResult,
  type ClusteringOptions,
  type ChunkForClustering,
} from './clustering.js';

/** Default concurrency for parallel file processing */
const FILE_PROCESSING_CONCURRENCY = 10;

/**
 * Compute a checksum for index integrity validation.
 * Based on sorted file list and chunk count.
 */
function computeIndexChecksum(files: string[], chunkCount: number): string {
  const sortedFiles = [...files].sort();
  const data = JSON.stringify({ files: sortedFiles, chunkCount });
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

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
  /** Type of code symbol (function, class, method, etc.) - from AST chunking */
  symbolType?:
    | 'function'
    | 'class'
    | 'method'
    | 'interface'
    | 'type'
    | 'variable'
    | 'import'
    | 'other';
  /** Name of the code symbol (e.g., 'UserService', 'MyClass.constructor') - from AST chunking */
  symbolName?: string;
}

/**
 * Statistics about chunking method usage during indexing.
 * Tracks how many files used AST-aware vs line-based chunking.
 */
export interface ChunkingStats {
  /** Number of files chunked with AST parsing (TypeScript/JavaScript) */
  astChunked: number;
  /** Number of files chunked with tree-sitter parsing (Python, Go, etc.) */
  treeSitterChunked: number;
  /** Number of files that fell back to line-based chunking */
  lineBasedChunked: number;
  /** Files where AST parsing failed and fell back to line-based */
  astFallbacks: string[];
  /** Files where tree-sitter parsing failed and fell back to line-based */
  treeSitterFallbacks: string[];
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
  /** Whether index corruption was detected */
  corrupted?: boolean;
  /** Description of detected corruption */
  corruptionReason?: string;
  /** Whether the current embedding backend differs from the indexed backend */
  backendMismatch?: boolean;
  /** Description of the backend mismatch */
  backendMismatchReason?: string;
  /** Whether the index is currently being rebuilt due to backend change */
  isIndexing?: boolean;
  /** Statistics about chunking methods used during indexing */
  chunkingStats?: ChunkingStats;
}

interface IndexMetadata {
  lastUpdated: string;
  fileCount: number;
  chunkCount: number;
  embeddingBackend: string;
  embeddingModel?: string;
  embeddingDimensions: number;
  version: string;
  /** Checksum of indexed files (sorted file list hash) for corruption detection */
  checksum?: string;
  /** Statistics about chunking methods used */
  chunkingStats?: ChunkingStats;
}

/**
 * Checkpoint for resuming interrupted indexing operations.
 * Saved after each phase completes to allow recovery from crashes or interruptions.
 */
interface IndexCheckpoint {
  /** Current phase of indexing when checkpoint was saved */
  phase: 'chunking' | 'embedding' | 'storing' | 'complete';
  /** ISO timestamp when indexing started */
  startedAt: string;
  /** All files to be indexed */
  files: string[];
  /** Files that have been fully processed (chunked + embedded + stored) */
  processedFiles: string[];
  /** Chunks ready for embedding (only present during chunking phase) */
  pendingChunks?: CodeChunk[];
  /** Chunks with embeddings ready for storage (only present during embedding phase) */
  embeddedChunks?: CodeChunk[];
  /** Embedding backend name (for detecting backend changes) */
  embeddingBackend: string;
  /** Embedding model (for detecting model changes) */
  embeddingModel?: string;
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
 * Options for searching similar code.
 */
export interface SearchSimilarOptions {
  /** File path to find similar code for (relative to project root) */
  filepath?: string;
  /** Starting line number (1-indexed, requires filepath) */
  startLine?: number;
  /** Ending line number (1-indexed, requires filepath) */
  endLine?: number;
  /** Code snippet to find similar code for (alternative to filepath) */
  code?: string;
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Minimum similarity score threshold 0-1 (default: 0) */
  threshold?: number;
  /** Exclude the source chunk from results (default: true) */
  excludeSelf?: boolean;
}

/**
 * Result from similar code search, includes similarity score.
 */
export interface SimilarCodeResult extends CodeChunk {
  /** Similarity score from 0 to 1 (1 = identical) */
  similarity: number;
}

/**
 * Options for searching code.
 */
export interface SearchOptions {
  /** Natural language query to search for */
  query: string;
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Glob pattern to filter results by file path (e.g., "src/\**", "!test/\**") */
  pathPattern?: string;
  /** Filter results to specific languages (e.g., ["typescript", "javascript"]) */
  languages?: string[];
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
 * Summary of the codebase structure and concept areas
 */
export interface CodebaseSummary {
  /** Total number of files indexed */
  totalFiles: number;
  /** Total number of code chunks */
  totalChunks: number;
  /** Languages detected in the codebase */
  languages: { language: string; fileCount: number; chunkCount: number }[];
  /** Discovered concept clusters */
  concepts: ConceptCluster[];
  /** Quality score for the clustering (silhouette score, -1 to 1) */
  clusteringQuality: number;
  /** Timestamp when summary was generated */
  generatedAt: string;
}

/**
 * Sanitize a string for use in LanceDB filter expressions.
 * Prevents SQL injection by escaping quotes and backslashes.
 * Used for filepaths and chunk IDs in WHERE clauses.
 */
function sanitizeForFilter(value: string): string {
  // Safe characters: alphanumeric, /, ., -, _, space, : (for chunk IDs like "path:1-10")
  // This is more restrictive than escaping and prevents injection attacks
  if (!/^[\w\s./:_-]+$/.test(value)) {
    // If value contains unusual characters, escape single quotes and backslashes
    return value.replace(/\\/g, '\\\\').replace(/'/g, "''");
  }
  return value.replace(/'/g, "''");
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
export class CodeIndexer {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private metadataTable: lancedb.Table | null = null;
  private embeddingBackend: EmbeddingBackend;
  private indexPath: string;
  private projectPath: string;
  private config: LanceContextConfig | null = null;
  /** LRU cache for query embeddings with TTL to avoid recomputing identical queries */
  private queryEmbeddingCache = new TTLCache<number[]>({ maxSize: 100, ttlMs: 60 * 60 * 1000 });
  /** Tracks chunking method usage during current indexing operation */
  private currentChunkingStats: ChunkingStats = this.createEmptyChunkingStats();

  /** Create empty chunking stats */
  private createEmptyChunkingStats(): ChunkingStats {
    return {
      astChunked: 0,
      treeSitterChunked: 0,
      lineBasedChunked: 0,
      astFallbacks: [],
      treeSitterFallbacks: [],
    };
  }

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

  private get checkpointPath(): string {
    return path.join(this.indexPath, 'checkpoint.json');
  }

  /**
   * Save indexing checkpoint to disk for crash recovery.
   */
  private async saveCheckpoint(checkpoint: IndexCheckpoint): Promise<void> {
    await fs.mkdir(this.indexPath, { recursive: true });
    await fs.writeFile(this.checkpointPath, JSON.stringify(checkpoint, null, 2));
  }

  /**
   * Load indexing checkpoint from disk.
   * Returns null if no checkpoint exists or if it's invalid.
   */
  private async loadCheckpoint(): Promise<IndexCheckpoint | null> {
    try {
      const content = await fs.readFile(this.checkpointPath, 'utf-8');
      const checkpoint = JSON.parse(content) as IndexCheckpoint;

      // Validate checkpoint has required fields
      if (
        !checkpoint.phase ||
        !checkpoint.startedAt ||
        !Array.isArray(checkpoint.files) ||
        !Array.isArray(checkpoint.processedFiles)
      ) {
        console.error('[lance-context] Invalid checkpoint file, ignoring');
        await this.clearCheckpoint();
        return null;
      }

      return checkpoint;
    } catch {
      return null;
    }
  }

  /**
   * Clear the indexing checkpoint file.
   */
  private async clearCheckpoint(): Promise<void> {
    try {
      await fs.unlink(this.checkpointPath);
    } catch {
      // Ignore errors if file doesn't exist
    }
  }

  /**
   * Save index metadata to disk
   */
  private async saveIndexMetadata(
    fileCount: number,
    chunkCount: number,
    indexedFiles: string[]
  ): Promise<void> {
    // Convert to relative paths for checksum
    const relativePaths = indexedFiles.map((f) =>
      path.isAbsolute(f) ? path.relative(this.projectPath, f) : f
    );

    const metadata: IndexMetadata = {
      lastUpdated: new Date().toISOString(),
      fileCount,
      chunkCount,
      embeddingBackend: this.embeddingBackend.name,
      embeddingModel: this.embeddingBackend.getModel(),
      embeddingDimensions: this.embeddingBackend.getDimensions(),
      version: '1.0.0',
      checksum: computeIndexChecksum(relativePaths, chunkCount),
      chunkingStats: this.currentChunkingStats,
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
        embeddingModel: this.embeddingBackend.getModel(),
      };
    }

    this.table = await this.db!.openTable('code_chunks');
    const count = await this.table.countRows();

    // Load persisted metadata
    const metadata = await this.loadIndexMetadata();

    // Validate index integrity
    const corruptionCheck = await this.validateIndexIntegrity(metadata, count);

    // Check for backend mismatch
    const backendMismatch = this.checkBackendMismatch(metadata);

    return {
      indexed: true,
      fileCount: metadata?.fileCount ?? 0,
      chunkCount: count,
      lastUpdated: metadata?.lastUpdated ?? null,
      indexPath: this.indexPath,
      embeddingBackend: metadata?.embeddingBackend ?? this.embeddingBackend.name,
      embeddingModel: metadata?.embeddingModel ?? this.embeddingBackend.getModel(),
      corrupted: corruptionCheck.corrupted,
      corruptionReason: corruptionCheck.reason,
      backendMismatch: backendMismatch.mismatch,
      backendMismatchReason: backendMismatch.reason,
      chunkingStats: metadata?.chunkingStats,
    };
  }

  /**
   * Check if the current embedding backend differs from the one used to create the index.
   * Returns mismatch status and reason if mismatched.
   */
  private checkBackendMismatch(metadata: IndexMetadata | null): {
    mismatch: boolean;
    reason?: string;
  } {
    if (!metadata) {
      return { mismatch: false };
    }

    const currentBackend = this.embeddingBackend.name;
    const currentModel = this.embeddingBackend.getModel();
    const currentDimensions = this.embeddingBackend.getDimensions();

    // Check dimension mismatch (critical - will cause search failures)
    if (metadata.embeddingDimensions && metadata.embeddingDimensions !== currentDimensions) {
      return {
        mismatch: true,
        reason:
          `Embedding dimension mismatch: index has ${metadata.embeddingDimensions}-dim vectors, ` +
          `current backend (${currentBackend}) produces ${currentDimensions}-dim vectors. Reindex required.`,
      };
    }

    // Check model mismatch (different models produce incompatible embeddings)
    if (metadata.embeddingModel && metadata.embeddingModel !== currentModel) {
      return {
        mismatch: true,
        reason:
          `Embedding model mismatch: index uses '${metadata.embeddingModel}', ` +
          `current backend uses '${currentModel}'. Reindex required.`,
      };
    }

    // Check backend mismatch (even same dimensions may have different embedding spaces)
    if (metadata.embeddingBackend && metadata.embeddingBackend !== currentBackend) {
      return {
        mismatch: true,
        reason: `Embedding backend changed from '${metadata.embeddingBackend}' to '${currentBackend}'. Reindex required.`,
      };
    }

    return { mismatch: false };
  }

  /**
   * Validate index integrity by checking metadata consistency.
   * Returns corruption status and reason if corrupted.
   */
  private async validateIndexIntegrity(
    metadata: IndexMetadata | null,
    actualChunkCount: number
  ): Promise<{ corrupted: boolean; reason?: string }> {
    // No metadata file - possible incomplete indexing
    if (!metadata) {
      return {
        corrupted: true,
        reason:
          'Missing index metadata file. Index may be incomplete. Run clear_index followed by index_codebase to rebuild.',
      };
    }

    // Check if chunk count matches
    if (metadata.chunkCount !== actualChunkCount) {
      return {
        corrupted: true,
        reason: `Chunk count mismatch: metadata says ${metadata.chunkCount}, index has ${actualChunkCount}. Run clear_index followed by index_codebase to rebuild.`,
      };
    }

    // Validate checksum if present
    if (metadata.checksum) {
      const storedFiles = await this.getStoredMetadata();
      const fileList = Array.from(storedFiles.keys());
      const computedChecksum = computeIndexChecksum(fileList, actualChunkCount);

      if (computedChecksum !== metadata.checksum) {
        return {
          corrupted: true,
          reason: `Checksum mismatch: file metadata does not match index. Run clear_index followed by index_codebase to rebuild.`,
        };
      }
    }

    return { corrupted: false };
  }

  async indexCodebase(
    patterns?: string[],
    excludePatterns?: string[],
    forceReindex: boolean = false,
    onProgress?: ProgressCallback,
    autoRepair: boolean = false
  ): Promise<{
    filesIndexed: number;
    chunksCreated: number;
    incremental: boolean;
    repaired?: boolean;
  }> {
    const { glob } = await import('glob');

    const report = (progress: IndexProgress) => {
      console.error(`[lance-context] ${progress.message}`);
      onProgress?.(progress);
    };

    // Reset chunking stats for this indexing run
    this.currentChunkingStats = this.createEmptyChunkingStats();

    // Check for corruption if autoRepair is enabled
    if (autoRepair) {
      const status = await this.getStatus();
      if (status.corrupted) {
        console.error(`[lance-context] Index corruption detected: ${status.corruptionReason}`);
        console.error('[lance-context] Auto-repair enabled, clearing and rebuilding index...');
        await this.clearIndex();
        // Recursively call with forceReindex but without autoRepair to avoid loops
        const result = await this.indexCodebase(patterns, excludePatterns, true, onProgress, false);
        return { ...result, repaired: true };
      }
    }

    // Check for incomplete checkpoint (resume interrupted indexing)
    if (!forceReindex) {
      const checkpoint = await this.loadCheckpoint();
      if (checkpoint && checkpoint.phase !== 'complete') {
        // Validate checkpoint is compatible with current backend
        const currentBackend = this.embeddingBackend.name;
        const currentModel = this.embeddingBackend.getModel();

        if (
          checkpoint.embeddingBackend !== currentBackend ||
          checkpoint.embeddingModel !== currentModel
        ) {
          console.error(
            `[lance-context] Checkpoint uses different embedding backend/model ` +
              `(${checkpoint.embeddingBackend}/${checkpoint.embeddingModel} vs ${currentBackend}/${currentModel}), ` +
              `discarding checkpoint`
          );
          await this.clearCheckpoint();
        } else {
          console.error(
            `[lance-context] Found incomplete checkpoint from ${checkpoint.startedAt}, resuming...`
          );
          return this.resumeFromCheckpoint(checkpoint, onProgress);
        }
      }
    }

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

    // Check for embedding dimension or model mismatch
    let embeddingMismatch = false;
    if (hasExistingIndex && !forceReindex) {
      const metadata = await this.loadIndexMetadata();
      const currentDimensions = this.embeddingBackend.getDimensions();
      const currentModel = this.embeddingBackend.getModel();

      // Check dimension mismatch
      if (metadata?.embeddingDimensions && metadata.embeddingDimensions !== currentDimensions) {
        console.error(
          `[lance-context] Embedding dimension mismatch: index has ${metadata.embeddingDimensions}, ` +
            `current backend (${this.embeddingBackend.name}) uses ${currentDimensions}. Forcing full reindex.`
        );
        embeddingMismatch = true;
      }

      // Check model mismatch (even if dimensions match, different models produce incompatible embeddings)
      if (metadata?.embeddingModel && metadata.embeddingModel !== currentModel) {
        console.error(
          `[lance-context] Embedding model mismatch: index uses '${metadata.embeddingModel}', ` +
            `current backend uses '${currentModel}'. Forcing full reindex.`
        );
        embeddingMismatch = true;
      }
    }

    const canDoIncremental = hasExistingIndex && !forceReindex && !embeddingMismatch;

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

    const startedAt = new Date().toISOString();

    // Process files into chunks (parallelized for I/O efficiency)
    report({ phase: 'chunking', current: 0, total: files.length, message: 'Chunking files...' });

    const chunkResults = await mapInBatches(
      files,
      async (filepath) => this.chunkFile(filepath),
      FILE_PROCESSING_CONCURRENCY,
      (completed, total) => {
        report({
          phase: 'chunking',
          current: completed,
          total,
          message: `Chunked ${completed}/${total} files`,
        });
      }
    );

    const allChunks = chunkResults.flat();

    report({
      phase: 'chunking',
      current: files.length,
      total: files.length,
      message: `Created ${allChunks.length} chunks`,
    });

    // Save checkpoint after chunking (before expensive embedding phase)
    await this.saveCheckpoint({
      phase: 'chunking',
      startedAt,
      files,
      processedFiles: [],
      pendingChunks: allChunks,
      embeddingBackend: this.embeddingBackend.name,
      embeddingModel: this.embeddingBackend.getModel(),
    });

    // Generate embeddings in batches
    await this.embedChunks(allChunks, onProgress);

    // Save checkpoint after embedding (before storage)
    await this.saveCheckpoint({
      phase: 'embedding',
      startedAt,
      files,
      processedFiles: [],
      embeddedChunks: allChunks,
      embeddingBackend: this.embeddingBackend.name,
      embeddingModel: this.embeddingBackend.getModel(),
    });

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

    // Save index metadata with checksum
    await this.saveIndexMetadata(files.length, allChunks.length, files);

    // Log chunking statistics
    this.logChunkingStats();

    // Clear checkpoint on successful completion
    await this.clearCheckpoint();

    return {
      filesIndexed: files.length,
      chunksCreated: allChunks.length,
      incremental: false,
    };
  }

  /**
   * Log chunking statistics summary, with warnings for fallbacks
   */
  private logChunkingStats(): void {
    const stats = this.currentChunkingStats;
    const totalFallbacks = stats.astFallbacks.length + stats.treeSitterFallbacks.length;
    const totalFiles = stats.astChunked + stats.treeSitterChunked + stats.lineBasedChunked;

    console.error(
      `[lance-context] Chunking: ${stats.astChunked} AST, ${stats.treeSitterChunked} tree-sitter, ${stats.lineBasedChunked} line-based`
    );

    if (totalFallbacks > 0) {
      const fallbackPct = ((totalFallbacks / totalFiles) * 100).toFixed(1);
      console.error(
        `[lance-context] Warning: ${totalFallbacks} files (${fallbackPct}%) fell back to line-based chunking`
      );
      if (stats.astFallbacks.length > 0 && stats.astFallbacks.length <= 5) {
        console.error(`[lance-context]   AST fallbacks: ${stats.astFallbacks.join(', ')}`);
      } else if (stats.astFallbacks.length > 5) {
        console.error(
          `[lance-context]   AST fallbacks: ${stats.astFallbacks.slice(0, 5).join(', ')} (+${stats.astFallbacks.length - 5} more)`
        );
      }
      if (stats.treeSitterFallbacks.length > 0 && stats.treeSitterFallbacks.length <= 5) {
        console.error(
          `[lance-context]   Tree-sitter fallbacks: ${stats.treeSitterFallbacks.join(', ')}`
        );
      } else if (stats.treeSitterFallbacks.length > 5) {
        console.error(
          `[lance-context]   Tree-sitter fallbacks: ${stats.treeSitterFallbacks.slice(0, 5).join(', ')} (+${stats.treeSitterFallbacks.length - 5} more)`
        );
      }
    }
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
        const sanitizedPath = sanitizeForFilter(relativePath);
        await this.table.delete(`filepath = '${sanitizedPath}'`);
      }
      report({
        phase: 'chunking',
        current: 0,
        total: filesToProcess.length,
        message: `Removed chunks from ${filesToRemove.length} files`,
      });
    }

    // Process new and modified files (parallelized for I/O efficiency)
    if (filesToProcess.length > 0) {
      const chunkResults = await mapInBatches(
        filesToProcess,
        async (filepath) => this.chunkFile(filepath),
        FILE_PROCESSING_CONCURRENCY,
        (completed, total) => {
          report({
            phase: 'chunking',
            current: completed,
            total,
            message: `Chunked ${completed}/${total} files`,
          });
        }
      );

      const newChunks = chunkResults.flat();

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

    // Save index metadata with checksum
    await this.saveIndexMetadata(allCurrentFiles.length, totalChunks, allCurrentFiles);

    // Log chunking statistics
    this.logChunkingStats();

    return {
      filesIndexed: filesToProcess.length,
      chunksCreated: totalChunks,
      incremental: true,
    };
  }

  /**
   * Resume indexing from a saved checkpoint.
   * Handles each checkpoint phase appropriately.
   */
  private async resumeFromCheckpoint(
    checkpoint: IndexCheckpoint,
    onProgress?: ProgressCallback
  ): Promise<{ filesIndexed: number; chunksCreated: number; incremental: boolean }> {
    const report = (progress: IndexProgress) => {
      console.error(`[lance-context] ${progress.message}`);
      onProgress?.(progress);
    };

    report({
      phase: checkpoint.phase,
      current: 0,
      total: checkpoint.files.length,
      message: `Resuming from ${checkpoint.phase} phase (started ${checkpoint.startedAt})`,
    });

    let allChunks: CodeChunk[];

    switch (checkpoint.phase) {
      case 'chunking': {
        // Resume from chunking phase - chunks are ready but not embedded
        if (!checkpoint.pendingChunks || checkpoint.pendingChunks.length === 0) {
          console.error('[lance-context] Checkpoint has no pending chunks, restarting full index');
          await this.clearCheckpoint();
          return this.indexFull(checkpoint.files, onProgress);
        }

        allChunks = checkpoint.pendingChunks;
        report({
          phase: 'chunking',
          current: checkpoint.files.length,
          total: checkpoint.files.length,
          message: `Resumed with ${allChunks.length} chunks ready for embedding`,
        });

        // Continue with embedding
        await this.embedChunks(allChunks, onProgress);

        // Save checkpoint after embedding
        await this.saveCheckpoint({
          phase: 'embedding',
          startedAt: checkpoint.startedAt,
          files: checkpoint.files,
          processedFiles: [],
          embeddedChunks: allChunks,
          embeddingBackend: this.embeddingBackend.name,
          embeddingModel: this.embeddingBackend.getModel(),
        });

        break;
      }

      case 'embedding': {
        // Resume from embedding phase - chunks are embedded but not stored
        if (!checkpoint.embeddedChunks || checkpoint.embeddedChunks.length === 0) {
          console.error('[lance-context] Checkpoint has no embedded chunks, restarting full index');
          await this.clearCheckpoint();
          return this.indexFull(checkpoint.files, onProgress);
        }

        allChunks = checkpoint.embeddedChunks;
        report({
          phase: 'embedding',
          current: allChunks.length,
          total: allChunks.length,
          message: `Resumed with ${allChunks.length} embedded chunks ready for storage`,
        });

        break;
      }

      default:
        // Unknown phase, restart full index
        console.error(`[lance-context] Unknown checkpoint phase: ${checkpoint.phase}, restarting`);
        await this.clearCheckpoint();
        return this.indexFull(checkpoint.files, onProgress);
    }

    // Store in LanceDB
    report({
      phase: 'storing',
      current: 0,
      total: allChunks.length,
      message: 'Storing chunks in database...',
    });

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
    await this.saveFileMetadata(checkpoint.files);

    // Save index metadata with checksum
    await this.saveIndexMetadata(checkpoint.files.length, allChunks.length, checkpoint.files);

    // Clear checkpoint on successful completion
    await this.clearCheckpoint();

    report({
      phase: 'complete',
      current: allChunks.length,
      total: allChunks.length,
      message: `Resumed indexing complete: ${checkpoint.files.length} files, ${allChunks.length} chunks`,
    });

    return {
      filesIndexed: checkpoint.files.length,
      chunksCreated: allChunks.length,
      incremental: false,
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

    // Try AST-aware chunking for TypeScript/JavaScript
    if (ASTChunker.canParse(filepath)) {
      try {
        const chunks = await this.chunkFileWithAST(filepath, relativePath, language);
        this.currentChunkingStats.astChunked++;
        return chunks;
      } catch {
        // Fall back to line-based chunking if AST parsing fails
        console.error(
          `[lance-context] AST parsing failed for ${relativePath}, falling back to line-based chunking`
        );
        this.currentChunkingStats.astFallbacks.push(relativePath);
      }
    }

    // Try tree-sitter chunking for other languages (Python, Go, Rust, Java, Kotlin)
    if (TreeSitterChunker.canParse(filepath)) {
      try {
        const chunks = await this.chunkFileWithTreeSitter(filepath, relativePath, language);
        this.currentChunkingStats.treeSitterChunked++;
        return chunks;
      } catch (error) {
        // Fall back to line-based chunking if tree-sitter parsing fails
        console.error(
          `[lance-context] Tree-sitter parsing failed for ${relativePath}, falling back to line-based chunking:`,
          error
        );
        this.currentChunkingStats.treeSitterFallbacks.push(relativePath);
      }
    }

    // Line-based chunking for unsupported languages or as fallback
    this.currentChunkingStats.lineBasedChunked++;
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
      symbolType: chunk.type,
      symbolName: chunk.name,
    }));
  }

  /**
   * Chunk a file using tree-sitter AST parsing (Python, Go, Rust, Java, Kotlin)
   */
  private async chunkFileWithTreeSitter(
    filepath: string,
    relativePath: string,
    language: string
  ): Promise<CodeChunk[]> {
    const treeSitterChunker = new TreeSitterChunker();
    const treeSitterChunks = await treeSitterChunker.chunkFile(filepath);

    return treeSitterChunks.map((chunk) => ({
      id: `${relativePath}:${chunk.startLine}-${chunk.endLine}${chunk.name ? `:${chunk.name}` : ''}`,
      filepath: relativePath,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      language,
      symbolType: chunk.type,
      symbolName: chunk.name,
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
   * Uses TTLCache for LRU eviction and TTL-based expiration.
   */
  private async getQueryEmbedding(query: string): Promise<number[]> {
    // Check cache first
    const cached = this.queryEmbeddingCache.get(query);
    if (cached) {
      return cached;
    }

    // Compute embedding and cache it
    const embedding = await this.embeddingBackend.embed(query);
    this.queryEmbeddingCache.set(query, embedding);
    return embedding;
  }

  /**
   * Check if a filepath matches a glob pattern.
   * Supports negation patterns starting with '!'.
   */
  private matchesPathPattern(filepath: string, pattern: string): boolean {
    // Handle negation pattern
    if (pattern.startsWith('!')) {
      return !minimatch(filepath, pattern.slice(1));
    }
    return minimatch(filepath, pattern);
  }

  /**
   * Search with options object
   */
  async search(options: SearchOptions): Promise<CodeChunk[]>;
  /**
   * Search with query string and optional limit (backward compatible)
   */
  async search(query: string, limit?: number): Promise<CodeChunk[]>;
  async search(queryOrOptions: string | SearchOptions, limit?: number): Promise<CodeChunk[]> {
    // Normalize arguments
    const options: SearchOptions =
      typeof queryOrOptions === 'string'
        ? { query: queryOrOptions, limit: limit ?? 10 }
        : queryOrOptions;

    const { query, limit: resultLimit = 10, pathPattern, languages } = options;

    if (!this.table) {
      const status = await this.getStatus();
      if (!status.indexed) {
        throw new Error('Codebase not indexed. Run index_codebase first.');
      }
    }

    const queryEmbedding = await this.getQueryEmbedding(query);
    const searchConfig = getSearchConfig(this.config!);

    // Fetch more results than needed for re-ranking and filtering
    // If we have filters, fetch even more to account for filtered-out results
    const hasFilters = pathPattern !== undefined || (languages && languages.length > 0);
    const fetchMultiplier = hasFilters ? 5 : 3;
    const fetchLimit = Math.min(resultLimit * fetchMultiplier, hasFilters ? 100 : 50);
    const results = await this.table!.search(queryEmbedding).limit(fetchLimit).toArray();

    // Apply filters
    let filteredResults = results;

    if (pathPattern) {
      filteredResults = filteredResults.filter((r) =>
        this.matchesPathPattern(r.filepath, pathPattern)
      );
    }

    if (languages && languages.length > 0) {
      const normalizedLanguages = languages.map((l) => l.toLowerCase());
      filteredResults = filteredResults.filter((r) =>
        normalizedLanguages.includes(r.language.toLowerCase())
      );
    }

    // Hybrid scoring: combine semantic similarity with keyword matching
    const scoredResults = filteredResults.map((r, index) => {
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

    return scoredResults.slice(0, resultLimit).map((sr) => ({
      id: sr.result.id,
      filepath: sr.result.filepath,
      content: sr.result.content,
      startLine: sr.result.startLine,
      endLine: sr.result.endLine,
      language: sr.result.language,
      symbolType: sr.result.symbolType,
      symbolName: sr.result.symbolName,
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

  /**
   * Find code chunks semantically similar to a given code snippet or file location.
   * This is useful for finding duplicate logic, similar implementations, or related code.
   */
  async searchSimilar(options: SearchSimilarOptions): Promise<SimilarCodeResult[]> {
    const {
      filepath,
      startLine,
      endLine,
      code,
      limit = 10,
      threshold = 0,
      excludeSelf = true,
    } = options;

    // Validate input first - need either code or filepath
    if (!code && !filepath) {
      throw new Error('Either code or filepath must be provided');
    }

    if (!this.table) {
      const status = await this.getStatus();
      if (!status.indexed) {
        throw new Error('Codebase not indexed. Run index_codebase first.');
      }
    }

    // Get the source code to find similar chunks for
    let sourceCode: string;
    let sourceId: string | null = null;

    if (code) {
      sourceCode = code;
    } else {
      // Read from file
      const fullPath = path.join(this.projectPath, filepath!);
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      const lines = fileContent.split('\n');

      const start = startLine ? startLine - 1 : 0;
      const end = endLine ? endLine : lines.length;

      sourceCode = lines.slice(start, end).join('\n');

      // Build source ID for exclusion
      if (startLine && endLine) {
        sourceId = `${filepath}:${startLine}-${endLine}`;
      }
    }

    if (!sourceCode.trim()) {
      throw new Error('Source code is empty');
    }

    // Embed the source code
    const sourceEmbedding = await this.embeddingBackend.embed(sourceCode);

    // Search for similar chunks - fetch extra to account for filtering
    const fetchLimit = Math.min((limit + 5) * 2, 100);
    const results = await this.table!.search(sourceEmbedding).limit(fetchLimit).toArray();

    // LanceDB returns results sorted by distance (ascending)
    // Convert distance to similarity score (1 - normalized_distance)
    const maxDistance = results.length > 0 ? Math.max(...results.map((r) => r._distance || 0)) : 1;

    const scoredResults: SimilarCodeResult[] = [];

    for (const r of results) {
      // Skip self if requested
      if (excludeSelf && sourceId && r.id === sourceId) {
        continue;
      }

      // Also skip if content is identical (for code-based search)
      if (excludeSelf && code && r.content.trim() === code.trim()) {
        continue;
      }

      // Convert distance to similarity (0 = far, 1 = identical)
      const distance = r._distance || 0;
      const similarity = maxDistance > 0 ? 1 - distance / maxDistance : 1;

      // Apply threshold filter
      if (similarity < threshold) {
        continue;
      }

      scoredResults.push({
        id: r.id,
        filepath: r.filepath,
        content: r.content,
        startLine: r.startLine,
        endLine: r.endLine,
        language: r.language,
        similarity,
        symbolType: r.symbolType,
        symbolName: r.symbolName,
      });

      if (scoredResults.length >= limit) {
        break;
      }
    }

    return scoredResults;
  }

  async clearIndex(): Promise<void> {
    const tableNames = await this.db!.tableNames();
    if (tableNames.includes('code_chunks')) {
      await this.db!.dropTable('code_chunks');
    }
    this.table = null;
    // Clear query embedding cache to prevent stale embeddings
    this.queryEmbeddingCache.clear();
    // Clear clustering metadata
    await this.clearClusteringMetadata();
    // Clear any incomplete checkpoint
    await this.clearCheckpoint();
  }

  private get clusteringMetadataPath(): string {
    return path.join(this.indexPath, 'clustering-metadata.json');
  }

  /**
   * Clear clustering metadata file
   */
  private async clearClusteringMetadata(): Promise<void> {
    try {
      await fs.unlink(this.clusteringMetadataPath);
    } catch {
      // Ignore errors if file doesn't exist
    }
  }

  /**
   * Save clustering result to metadata file
   */
  private async saveClusteringMetadata(result: ClusteringResult): Promise<void> {
    await fs.mkdir(this.indexPath, { recursive: true });
    const data = {
      clusterCount: result.clusterCount,
      clusters: result.clusters,
      // Convert Map to object for JSON serialization
      assignments: Object.fromEntries(result.assignments),
      generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(this.clusteringMetadataPath, JSON.stringify(data, null, 2));
  }

  /**
   * Load clustering result from metadata file
   */
  private async loadClusteringMetadata(): Promise<ClusteringResult | null> {
    try {
      const content = await fs.readFile(this.clusteringMetadataPath, 'utf-8');
      const data = JSON.parse(content);
      return {
        clusterCount: data.clusterCount,
        clusters: data.clusters,
        // Convert object back to Map
        assignments: new Map(Object.entries(data.assignments).map(([k, v]) => [k, v as number])),
      };
    } catch {
      return null;
    }
  }

  /**
   * Cluster the indexed codebase into semantic concept areas.
   * Uses k-means clustering on embeddings to discover related code groups.
   */
  async clusterConcepts(options: ClusteringOptions = {}): Promise<ClusteringResult> {
    if (!this.table) {
      const status = await this.getStatus();
      if (!status.indexed) {
        throw new Error('Codebase not indexed. Run index_codebase first.');
      }
      this.table = await this.db!.openTable('code_chunks');
    }

    // Fetch all chunks with embeddings
    const rows = await this.table.query().toArray();

    const chunks: ChunkForClustering[] = rows.map((row) => ({
      id: row.id,
      content: row.content,
      filepath: row.filepath,
      embedding: row.vector,
      symbolName: row.symbolName,
      symbolType: row.symbolType,
    }));

    // Perform clustering
    const result = kMeansClustering(chunks, options);

    // Save to metadata file
    await this.saveClusteringMetadata(result);

    return result;
  }

  /**
   * List all discovered concept clusters.
   * Returns cached clustering result if available, otherwise clusters first.
   */
  async listConcepts(forceRecluster: boolean = false): Promise<ConceptCluster[]> {
    if (!forceRecluster) {
      const cached = await this.loadClusteringMetadata();
      if (cached) {
        return cached.clusters;
      }
    }

    const result = await this.clusterConcepts();
    return result.clusters;
  }

  /**
   * Search for code within a specific concept cluster.
   * Returns chunks that belong to the specified cluster, optionally filtered by query.
   */
  async searchByConcept(
    conceptId: number,
    query?: string,
    limit: number = 10
  ): Promise<CodeChunk[]> {
    const clustering = await this.loadClusteringMetadata();
    if (!clustering) {
      throw new Error('No clustering data available. Run clusterConcepts first.');
    }

    // Get chunk IDs in this cluster
    const chunkIds = new Set<string>();
    for (const [chunkId, clusterId] of clustering.assignments) {
      if (clusterId === conceptId) {
        chunkIds.add(chunkId);
      }
    }

    if (chunkIds.size === 0) {
      return [];
    }

    if (!this.table) {
      this.table = await this.db!.openTable('code_chunks');
    }

    // If query provided, use semantic search and filter to cluster
    if (query) {
      const queryEmbedding = await this.getQueryEmbedding(query);
      const results = await this.table
        .search(queryEmbedding)
        .limit(limit * 3)
        .toArray();

      return results
        .filter((r) => chunkIds.has(r.id))
        .slice(0, limit)
        .map((r) => ({
          id: r.id,
          filepath: r.filepath,
          content: r.content,
          startLine: r.startLine,
          endLine: r.endLine,
          language: r.language,
          symbolType: r.symbolType,
          symbolName: r.symbolName,
        }));
    }

    // Without query, return representative chunks from the cluster
    const cluster = clustering.clusters.find((c) => c.id === conceptId);
    if (!cluster) {
      return [];
    }

    const results: CodeChunk[] = [];
    for (const chunkId of cluster.representativeChunks.slice(0, limit)) {
      // Fetch chunk by ID - LanceDB doesn't have direct ID lookup, so we filter
      const rows = await this.table
        .query()
        .where(`id = '${sanitizeForFilter(chunkId)}'`)
        .limit(1)
        .toArray();
      if (rows.length > 0) {
        const r = rows[0];
        results.push({
          id: r.id,
          filepath: r.filepath,
          content: r.content,
          startLine: r.startLine,
          endLine: r.endLine,
          language: r.language,
          symbolType: r.symbolType,
          symbolName: r.symbolName,
        });
      }
    }

    return results;
  }

  /**
   * Generate a comprehensive summary of the codebase including concept areas.
   */
  async summarizeCodebase(clusteringOptions?: ClusteringOptions): Promise<CodebaseSummary> {
    const status = await this.getStatus();
    if (!status.indexed) {
      throw new Error('Codebase not indexed. Run index_codebase first.');
    }

    if (!this.table) {
      this.table = await this.db!.openTable('code_chunks');
    }

    // Gather language statistics
    const rows = await this.table.query().toArray();
    const languageStats = new Map<string, { fileCount: Set<string>; chunkCount: number }>();

    for (const row of rows) {
      const lang = row.language;
      if (!languageStats.has(lang)) {
        languageStats.set(lang, { fileCount: new Set(), chunkCount: 0 });
      }
      const stats = languageStats.get(lang)!;
      stats.fileCount.add(row.filepath);
      stats.chunkCount++;
    }

    const languages = Array.from(languageStats.entries())
      .map(([language, stats]) => ({
        language,
        fileCount: stats.fileCount.size,
        chunkCount: stats.chunkCount,
      }))
      .sort((a, b) => b.chunkCount - a.chunkCount);

    // Perform clustering
    const chunks: ChunkForClustering[] = rows.map((row) => ({
      id: row.id,
      content: row.content,
      filepath: row.filepath,
      embedding: row.vector,
      symbolName: row.symbolName,
      symbolType: row.symbolType,
    }));

    const clusteringResult = kMeansClustering(chunks, clusteringOptions);
    await this.saveClusteringMetadata(clusteringResult);

    // Calculate clustering quality
    const silhouetteScore = calculateSilhouetteScore(
      chunks,
      clusteringResult.assignments,
      clusteringResult.clusters
    );

    return {
      totalFiles: status.fileCount,
      totalChunks: status.chunkCount,
      languages,
      concepts: clusteringResult.clusters,
      clusteringQuality: silhouetteScore,
      generatedAt: new Date().toISOString(),
    };
  }
}
