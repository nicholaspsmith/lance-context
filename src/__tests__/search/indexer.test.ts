import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodeIndexer } from '../../search/indexer.js';
import { createMockEmbeddingBackend } from '../mocks/embedding-backend.mock.js';
import { createMockConnection, createMockTable } from '../mocks/lancedb.mock.js';

// Mock the lancedb module
vi.mock('@lancedb/lancedb', () => ({
  connect: vi.fn(),
}));

// Mock fs/promises for file operations
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
}));

// Mock config
vi.mock('../../config.js', async (_importOriginal) => {
  return {
    loadConfig: vi
      .fn()
      .mockResolvedValue({ patterns: ['**/*.ts'], excludePatterns: ['**/node_modules/**'] }),
    getDefaultPatterns: vi.fn().mockReturnValue(['**/*.ts', '**/*.js']),
    getDefaultExcludePatterns: vi.fn().mockReturnValue(['**/node_modules/**']),
    getChunkingConfig: vi.fn().mockReturnValue({ maxLines: 100, overlap: 20 }),
    getSearchConfig: vi.fn().mockReturnValue({ semanticWeight: 0.7, keywordWeight: 0.3 }),
  };
});

describe('CodeIndexer', () => {
  let mockBackend: ReturnType<typeof createMockEmbeddingBackend>;
  let mockConnection: ReturnType<typeof createMockConnection>;
  let lancedb: typeof import('@lancedb/lancedb');
  let fsPromises: typeof import('fs/promises');
  let configModule: typeof import('../../config.js');

  beforeEach(async () => {
    mockBackend = createMockEmbeddingBackend();
    mockConnection = createMockConnection();

    lancedb = await import('@lancedb/lancedb');
    fsPromises = await import('fs/promises');
    configModule = await import('../../config.js');

    vi.mocked(lancedb.connect).mockResolvedValue(mockConnection as any);
    // Re-establish the config mock after resetAllMocks
    vi.mocked(configModule.loadConfig).mockResolvedValue({
      patterns: ['**/*.ts'],
      excludePatterns: ['**/node_modules/**'],
      chunking: { maxLines: 100, overlap: 20 },
      search: { semanticWeight: 0.7, keywordWeight: 0.3 },
    });
    vi.mocked(configModule.getDefaultPatterns).mockReturnValue(['**/*.ts', '**/*.js']);
    vi.mocked(configModule.getDefaultExcludePatterns).mockReturnValue(['**/node_modules/**']);
    vi.mocked(configModule.getChunkingConfig).mockReturnValue({ maxLines: 100, overlap: 20 });
    vi.mocked(configModule.getSearchConfig).mockReturnValue({
      semanticWeight: 0.7,
      keywordWeight: 0.3,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should set correct index path', () => {
      const indexer = new CodeIndexer('/project', mockBackend);
      // Access private property for testing
      expect((indexer as any).projectPath).toBe('/project');
    });
  });

  describe('initialize', () => {
    it('should connect to LanceDB', async () => {
      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      expect(lancedb.connect).toHaveBeenCalledWith('/project/.lance-context');
    });
  });

  describe('getStatus', () => {
    it('should return indexed:false when no table exists', async () => {
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const status = await indexer.getStatus();

      expect(status.indexed).toBe(false);
      expect(status.fileCount).toBe(0);
      expect(status.chunkCount).toBe(0);
      expect(status.lastUpdated).toBeNull();
    });

    it('should return correct counts when indexed', async () => {
      const mockTable = createMockTable([
        {
          id: '1',
          filepath: 'test.ts',
          content: 'code',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          id: '2',
          filepath: 'test.ts',
          content: 'more',
          startLine: 11,
          endLine: 20,
          language: 'typescript',
        },
      ]);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);

      // Mock metadata file
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify({
          lastUpdated: '2024-01-01T00:00:00Z',
          fileCount: 5,
          chunkCount: 10,
          embeddingBackend: 'mock',
          embeddingDimensions: 1536,
        })
      );

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const status = await indexer.getStatus();

      expect(status.indexed).toBe(true);
      expect(status.fileCount).toBe(5);
      expect(status.chunkCount).toBe(2); // From table.countRows
      expect(status.lastUpdated).toBe('2024-01-01T00:00:00Z');
      expect(status.embeddingBackend).toBe('mock');
    });

    it('should handle missing metadata gracefully', async () => {
      const mockTable = createMockTable([
        {
          id: '1',
          filepath: 'test.ts',
          content: 'code',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
      ]);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);

      // Metadata file doesn't exist
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const status = await indexer.getStatus();

      expect(status.indexed).toBe(true);
      expect(status.fileCount).toBe(0);
      expect(status.lastUpdated).toBeNull();
    });
  });

  describe('search', () => {
    it('should throw when not indexed', async () => {
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      await expect(indexer.search('query')).rejects.toThrow('Codebase not indexed');
    });

    it('should embed query via backend', async () => {
      const mockTable = createMockTable([
        {
          id: '1',
          filepath: 'test.ts',
          content: 'function test',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
      ]);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      await indexer.search('find function');

      expect(mockBackend.embed).toHaveBeenCalledWith('find function');
    });

    it('should respect limit parameter', async () => {
      const chunks = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: `${i}`,
          filepath: `test${i}.ts`,
          content: `content ${i}`,
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        }));
      const mockTable = createMockTable(chunks);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const results = await indexer.search('query', 3);

      expect(results.length).toBe(3);
    });

    it('should return results with correct structure', async () => {
      const mockTable = createMockTable([
        {
          id: 'test.ts:1-10',
          filepath: 'test.ts',
          content: 'function hello() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
      ]);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const results = await indexer.search('hello');

      expect(results[0]).toEqual({
        id: 'test.ts:1-10',
        filepath: 'test.ts',
        content: 'function hello() {}',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });
    });
  });

  describe('query embedding cache', () => {
    it('should cache query embeddings and not recompute for identical queries', async () => {
      const mockTable = createMockTable([
        {
          id: 'test.ts:1-10',
          filepath: 'test.ts',
          content: 'function test() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
      ]);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // First search - should call embed
      await indexer.search('test query');
      expect(mockBackend.embed).toHaveBeenCalledTimes(1);

      // Second search with same query - should use cache
      await indexer.search('test query');
      expect(mockBackend.embed).toHaveBeenCalledTimes(1); // Still 1, not 2

      // Different query - should call embed again
      await indexer.search('different query');
      expect(mockBackend.embed).toHaveBeenCalledTimes(2);
    });

    it('should clear cache when index is cleared', async () => {
      const mockTable = createMockTable([
        {
          id: 'test.ts:1-10',
          filepath: 'test.ts',
          content: 'function test() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
      ]);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // First search - populates cache
      await indexer.search('cached query');
      expect(mockBackend.embed).toHaveBeenCalledTimes(1);

      // Clear index - should clear cache
      await indexer.clearIndex();

      // Re-setup the mock table for next search
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);

      // Same query after clear - should recompute
      await indexer.search('cached query');
      expect(mockBackend.embed).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearIndex', () => {
    it('should drop table when it exists', async () => {
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      await indexer.clearIndex();

      expect(mockConnection.dropTable).toHaveBeenCalledWith('code_chunks');
    });

    it('should handle non-existent table gracefully', async () => {
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // Should not throw
      await expect(indexer.clearIndex()).resolves.toBeUndefined();
      expect(mockConnection.dropTable).not.toHaveBeenCalled();
    });
  });

  describe('indexCodebase', () => {
    beforeEach(() => {
      // Mock glob
      vi.doMock('glob', () => ({
        glob: vi.fn().mockResolvedValue([]),
      }));

      // Mock file stats
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: Date.now() } as any);
      vi.mocked(fsPromises.writeFile).mockResolvedValue();
    });

    it('should use provided patterns over config', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob as any).mockResolvedValue([]);
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      await indexer.indexCodebase(['**/*.py'], ['**/venv/**']);

      expect(glob).toHaveBeenCalledWith(
        '**/*.py',
        expect.objectContaining({
          ignore: ['**/venv/**'],
        })
      );
    });

    it('should detect incremental vs full indexing', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob as any).mockResolvedValue(['/project/test.ts']);
      vi.mocked(fsPromises.readFile).mockImplementation(async (path: any) => {
        if (path.includes('index-metadata')) {
          return JSON.stringify({
            lastUpdated: '2024-01-01',
            fileCount: 1,
            chunkCount: 1,
            embeddingBackend: 'mock',
            embeddingDimensions: 1536,
          });
        }
        return 'const x = 1;';
      });

      // Has existing index
      mockConnection.tableNames.mockResolvedValue(['code_chunks', 'file_metadata']);

      const mockTable = createMockTable([]);
      const mockMetadataTable = createMockTable([]);
      mockMetadataTable.query = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ filepath: 'test.ts', mtime: Date.now() }]),
      });

      mockConnection.openTable.mockImplementation(async (name: string) => {
        if (name === 'file_metadata') return mockMetadataTable as any;
        return mockTable as any;
      });

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const result = await indexer.indexCodebase();

      expect(result.incremental).toBe(true);
    });

    it('should handle force reindex flag', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob as any).mockResolvedValue(['/project/test.ts']);
      vi.mocked(fsPromises.readFile).mockResolvedValue('const x = 1;');

      // Has existing index
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const result = await indexer.indexCodebase(undefined, undefined, true);

      expect(result.incremental).toBe(false);
      expect(mockConnection.dropTable).toHaveBeenCalledWith('code_chunks');
    });

    it('should report progress via callback', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob as any).mockResolvedValue(['/project/test.ts']);
      vi.mocked(fsPromises.readFile).mockResolvedValue('const x = 1;');
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const progressUpdates: any[] = [];
      await indexer.indexCodebase(undefined, undefined, false, (progress) => {
        progressUpdates.push(progress);
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates.some((p) => p.phase === 'scanning')).toBe(true);
      expect(progressUpdates.some((p) => p.phase === 'chunking')).toBe(true);
      expect(progressUpdates.some((p) => p.phase === 'embedding')).toBe(true);
    });
  });

  describe('hybrid scoring', () => {
    it('should apply 70/30 semantic/keyword split', async () => {
      // This tests the calculateKeywordScore indirectly through search
      const mockTable = createMockTable([
        {
          id: '1',
          filepath: 'auth.ts',
          content: 'function authenticate() {}',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
        },
        {
          id: '2',
          filepath: 'other.ts',
          content: 'function other() {}',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
        },
      ]);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const results = await indexer.search('authenticate auth');

      // auth.ts should rank higher due to keyword match in both content and filepath
      expect(results[0].filepath).toBe('auth.ts');
    });
  });
});
