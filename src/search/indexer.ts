import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { EmbeddingBackend } from '../embeddings/index.js';
import { ASTChunker } from './ast-chunker.js';

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

  constructor(projectPath: string, embeddingBackend: EmbeddingBackend) {
    this.projectPath = projectPath;
    this.embeddingBackend = embeddingBackend;
    this.indexPath = path.join(projectPath, '.lance-context');
  }

  async initialize(): Promise<void> {
    this.db = await lancedb.connect(this.indexPath);
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
    patterns: string[] = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.go', '**/*.rs'],
    excludePatterns: string[] = ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/build/**'],
    forceReindex: boolean = false
  ): Promise<{ filesIndexed: number; chunksCreated: number; incremental: boolean }> {
    const { glob } = await import('glob');

    // Find all matching files
    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.projectPath,
        ignore: excludePatterns,
        absolute: true,
      });
      files.push(...matches);
    }

    console.error(`[lance-context] Found ${files.length} files to index`);

    // Check if we can do incremental indexing
    const tableNames = await this.db!.tableNames();
    const hasExistingIndex = tableNames.includes('code_chunks');
    const canDoIncremental = hasExistingIndex && !forceReindex;

    if (canDoIncremental) {
      return this.indexIncremental(files);
    }

    // Full reindex
    return this.indexFull(files);
  }

  /**
   * Perform a full reindex of all files
   */
  private async indexFull(
    files: string[]
  ): Promise<{ filesIndexed: number; chunksCreated: number; incremental: boolean }> {
    // Process files into chunks
    const allChunks: CodeChunk[] = [];
    for (const filePath of files) {
      const chunks = await this.chunkFile(filePath);
      allChunks.push(...chunks);
    }

    console.error(`[lance-context] Created ${allChunks.length} chunks`);

    // Generate embeddings in batches
    await this.embedChunks(allChunks);

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
    files: string[]
  ): Promise<{ filesIndexed: number; chunksCreated: number; incremental: boolean }> {
    const changes = await this.detectFileChanges(files);

    const filesToProcess = [...changes.added, ...changes.modified];
    const hasChanges = filesToProcess.length > 0 || changes.deleted.length > 0;

    if (!hasChanges) {
      console.error(`[lance-context] No changes detected, index is up to date`);
      this.table = await this.db!.openTable('code_chunks');
      const count = await this.table.countRows();
      return {
        filesIndexed: 0,
        chunksCreated: count,
        incremental: true,
      };
    }

    console.error(
      `[lance-context] Incremental update: ${changes.added.length} added, ${changes.modified.length} modified, ${changes.deleted.length} deleted`
    );

    // Open the existing table
    this.table = await this.db!.openTable('code_chunks');

    // Delete chunks from modified and deleted files
    const filesToRemove = [...changes.modified.map(f => path.relative(this.projectPath, f)), ...changes.deleted];
    if (filesToRemove.length > 0) {
      for (const relativePath of filesToRemove) {
        await this.table.delete(`filePath = '${relativePath.replace(/'/g, "''")}'`);
      }
      console.error(`[lance-context] Removed chunks from ${filesToRemove.length} files`);
    }

    // Process new and modified files
    if (filesToProcess.length > 0) {
      const newChunks: CodeChunk[] = [];
      for (const filePath of filesToProcess) {
        const chunks = await this.chunkFile(filePath);
        newChunks.push(...chunks);
      }

      console.error(`[lance-context] Created ${newChunks.length} new chunks`);

      // Generate embeddings
      await this.embedChunks(newChunks);

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
  private async embedChunks(chunks: CodeChunk[]): Promise<void> {
    const batchSize = 32;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.content);
      const embeddings = await this.embeddingBackend.embedBatch(texts);
      batch.forEach((chunk, idx) => {
        chunk.embedding = embeddings[idx];
      });
      console.error(`[lance-context] Embedded ${i + batch.length}/${chunks.length} chunks`);
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

    const results = await this.table!.search(queryEmbedding).limit(limit).toArray();

    return results.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      content: r.content,
      startLine: r.startLine,
      endLine: r.endLine,
      language: r.language,
    }));
  }

  async clearIndex(): Promise<void> {
    const tableNames = await this.db!.tableNames();
    if (tableNames.includes('code_chunks')) {
      await this.db!.dropTable('code_chunks');
    }
    this.table = null;
  }
}
