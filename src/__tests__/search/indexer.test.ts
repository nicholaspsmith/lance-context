import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodeIndexer, type IndexProgress } from '../../search/indexer.js';
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
  mkdir: vi.fn(),
  unlink: vi.fn(),
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
    getIndexingConfig: vi.fn().mockReturnValue({ batchSize: 32, batchDelayMs: 0 }),
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
      autoReindex: false, // Disable for tests to avoid reindexing during search
    });
    vi.mocked(configModule.getIndexingConfig).mockReturnValue({ batchSize: 32, batchDelayMs: 0 });
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

      expect(lancedb.connect).toHaveBeenCalledWith('/project/.glancey');
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

      expect(results[0]).toMatchObject({
        id: 'test.ts:1-10',
        filepath: 'test.ts',
        content: 'function hello() {}',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });
    });

    it('should include symbol context when available', async () => {
      const mockTable = createMockTable([
        {
          id: 'test.ts:1-10:hello',
          filepath: 'test.ts',
          content: 'function hello() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          symbolType: 'function',
          symbolName: 'hello',
        },
      ]);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const results = await indexer.search('hello');

      expect(results[0]).toMatchObject({
        id: 'test.ts:1-10:hello',
        filepath: 'test.ts',
        symbolType: 'function',
        symbolName: 'hello',
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

  describe('search filtering', () => {
    it('should filter results by pathPattern glob', async () => {
      const mockTable = createMockTable([
        {
          id: 'src/utils.ts:1-10',
          filepath: 'src/utils.ts',
          content: 'export function utility() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          id: 'test/utils.test.ts:1-10',
          filepath: 'test/utils.test.ts',
          content: 'describe("utility", () => {})',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          id: 'src/index.ts:1-10',
          filepath: 'src/index.ts',
          content: 'import { utility } from "./utils"',
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

      // Filter to only src directory
      const results = await indexer.search({
        query: 'utility',
        pathPattern: 'src/**',
      });

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.filepath)).toEqual(['src/utils.ts', 'src/index.ts']);
    });

    it('should filter results by negation pathPattern', async () => {
      const mockTable = createMockTable([
        {
          id: 'src/utils.ts:1-10',
          filepath: 'src/utils.ts',
          content: 'export function utility() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          id: 'test/utils.test.ts:1-10',
          filepath: 'test/utils.test.ts',
          content: 'describe("utility", () => {})',
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

      // Exclude test files
      const results = await indexer.search({
        query: 'utility',
        pathPattern: '!test/**',
      });

      expect(results).toHaveLength(1);
      expect(results[0].filepath).toBe('src/utils.ts');
    });

    it('should filter results by languages array', async () => {
      const mockTable = createMockTable([
        {
          id: 'app.ts:1-10',
          filepath: 'app.ts',
          content: 'const app = express()',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          id: 'app.js:1-10',
          filepath: 'app.js',
          content: 'const app = require("express")()',
          startLine: 1,
          endLine: 10,
          language: 'javascript',
        },
        {
          id: 'styles.css:1-10',
          filepath: 'styles.css',
          content: '.app { display: flex; }',
          startLine: 1,
          endLine: 10,
          language: 'css',
        },
      ]);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // Filter to only TypeScript files
      const results = await indexer.search({
        query: 'app',
        languages: ['typescript'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].language).toBe('typescript');
    });

    it('should filter by multiple languages', async () => {
      const mockTable = createMockTable([
        {
          id: 'app.ts:1-10',
          filepath: 'app.ts',
          content: 'const app = express()',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          id: 'app.js:1-10',
          filepath: 'app.js',
          content: 'const app = require("express")()',
          startLine: 1,
          endLine: 10,
          language: 'javascript',
        },
        {
          id: 'styles.css:1-10',
          filepath: 'styles.css',
          content: '.app { display: flex; }',
          startLine: 1,
          endLine: 10,
          language: 'css',
        },
      ]);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // Filter to TypeScript and JavaScript
      const results = await indexer.search({
        query: 'app',
        languages: ['typescript', 'javascript'],
      });

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.language).sort()).toEqual(['javascript', 'typescript']);
    });

    it('should combine pathPattern and languages filters', async () => {
      const mockTable = createMockTable([
        {
          id: 'src/app.ts:1-10',
          filepath: 'src/app.ts',
          content: 'const app = express()',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          id: 'src/app.js:1-10',
          filepath: 'src/app.js',
          content: 'const app = require("express")()',
          startLine: 1,
          endLine: 10,
          language: 'javascript',
        },
        {
          id: 'test/app.test.ts:1-10',
          filepath: 'test/app.test.ts',
          content: 'describe("app", () => {})',
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

      // Filter to src directory AND TypeScript only
      const results = await indexer.search({
        query: 'app',
        pathPattern: 'src/**',
        languages: ['typescript'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].filepath).toBe('src/app.ts');
    });

    it('should handle case-insensitive language filtering', async () => {
      const mockTable = createMockTable([
        {
          id: 'app.ts:1-10',
          filepath: 'app.ts',
          content: 'const app = express()',
          startLine: 1,
          endLine: 10,
          language: 'TypeScript',
        },
      ]);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // Use lowercase in filter
      const results = await indexer.search({
        query: 'app',
        languages: ['typescript'],
      });

      expect(results).toHaveLength(1);
    });

    it('should support SearchOptions object syntax', async () => {
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

      // Use SearchOptions object
      const results = await indexer.search({
        query: 'test',
        limit: 5,
      });

      expect(results).toHaveLength(1);
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

  describe('searchSimilar', () => {
    it('should find similar code with code snippet input', async () => {
      const chunks = [
        {
          id: 'file1.ts:1-10',
          filepath: 'file1.ts',
          content: 'function authenticate(user) { return true; }',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          _distance: 0.1,
        },
        {
          id: 'file2.ts:1-10',
          filepath: 'file2.ts',
          content: 'function validate(input) { return false; }',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          _distance: 0.5,
        },
      ];
      const mockTable = createMockTable(chunks);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const results = await indexer.searchSimilar({
        code: 'function login(user) { return true; }',
        limit: 10,
      });

      expect(results.length).toBe(2);
      expect(results[0].filepath).toBe('file1.ts');
      expect(results[0]).toHaveProperty('similarity');
      expect(mockBackend.embed).toHaveBeenCalledWith('function login(user) { return true; }');
    });

    it('should exclude self when excludeSelf is true', async () => {
      const chunks = [
        {
          id: 'file1.ts:1-10',
          filepath: 'file1.ts',
          content: 'function test() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          _distance: 0,
        },
        {
          id: 'file2.ts:1-10',
          filepath: 'file2.ts',
          content: 'function other() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          _distance: 0.3,
        },
      ];
      const mockTable = createMockTable(chunks);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // Should exclude exact content match
      const results = await indexer.searchSimilar({
        code: 'function test() {}',
        excludeSelf: true,
      });

      expect(results.every((r) => r.content.trim() !== 'function test() {}')).toBe(true);
    });

    it('should throw error when neither code nor filepath is provided', async () => {
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      await expect(indexer.searchSimilar({})).rejects.toThrow(
        'Either code or filepath must be provided'
      );
    });

    it('should respect threshold parameter', async () => {
      const chunks = [
        {
          id: 'file1.ts:1-10',
          filepath: 'file1.ts',
          content: 'high similarity',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          _distance: 0.1,
        },
        {
          id: 'file2.ts:1-10',
          filepath: 'file2.ts',
          content: 'low similarity',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          _distance: 0.9,
        },
      ];
      const mockTable = createMockTable(chunks);
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      mockConnection.openTable.mockResolvedValue(mockTable as any);
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // With high threshold, should filter out low similarity results
      const results = await indexer.searchSimilar({
        code: 'test code',
        threshold: 0.5,
      });

      // Only high similarity result should pass
      expect(results.length).toBe(1);
      expect(results[0].filepath).toBe('file1.ts');
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

      const progressUpdates: IndexProgress[] = [];
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

  describe('corruption detection', () => {
    it('should detect missing metadata as corruption', async () => {
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

      expect(status.corrupted).toBe(true);
      expect(status.corruptionReason).toContain('Missing index metadata');
    });

    it('should detect chunk count mismatch as corruption', async () => {
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

      // Metadata says 5 chunks but table only has 1
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify({
          lastUpdated: '2024-01-01T00:00:00Z',
          fileCount: 1,
          chunkCount: 5,
          embeddingBackend: 'mock',
          embeddingDimensions: 1536,
          checksum: 'abc123',
        })
      );

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const status = await indexer.getStatus();

      expect(status.corrupted).toBe(true);
      expect(status.corruptionReason).toContain('Chunk count mismatch');
    });

    it('should report healthy index when metadata matches', async () => {
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
      const mockMetadataTable = createMockTable([{ filepath: 'test.ts', mtime: Date.now() }]);

      mockConnection.tableNames.mockResolvedValue(['code_chunks', 'file_metadata']);
      mockConnection.openTable.mockImplementation(async (name: string) => {
        if (name === 'file_metadata') return mockMetadataTable as any;
        return mockTable as any;
      });

      // Metadata matches actual state
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify({
          lastUpdated: '2024-01-01T00:00:00Z',
          fileCount: 1,
          chunkCount: 1,
          embeddingBackend: 'mock',
          embeddingDimensions: 1536,
          checksum: '4694592dbdda93c1',
        })
      );

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const status = await indexer.getStatus();

      expect(status.corrupted).toBe(false);
      expect(status.corruptionReason).toBeUndefined();
    });

    it('should report no corruption when index is empty', async () => {
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const status = await indexer.getStatus();

      expect(status.indexed).toBe(false);
      // Empty index has no corruption field (undefined, not false)
      expect(status.corrupted).toBeUndefined();
    });
  });

  describe('checkpoint-based indexing', () => {
    it('should save checkpoint after chunking phase', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob as any).mockResolvedValue(['/project/test.ts']);
      vi.mocked(fsPromises.readFile).mockResolvedValue('const x = 1;');
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: Date.now() } as any);
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      await indexer.indexCodebase();

      // Should have written checkpoint at least once
      const writeFileCalls = vi.mocked(fsPromises.writeFile).mock.calls;
      const checkpointWrites = writeFileCalls.filter(
        (call) => call[0] === '/project/.glancey/checkpoint.json'
      );
      expect(checkpointWrites.length).toBeGreaterThan(0);

      // First checkpoint should be after chunking phase
      const firstCheckpoint = JSON.parse(checkpointWrites[0][1] as string);
      expect(firstCheckpoint.phase).toBe('chunking');
      expect(firstCheckpoint.embeddingBackend).toBe('mock');
    });

    it('should clear checkpoint after successful indexing', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob as any).mockResolvedValue(['/project/test.ts']);
      vi.mocked(fsPromises.readFile).mockResolvedValue('const x = 1;');
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: Date.now() } as any);
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      await indexer.indexCodebase();

      // Should have tried to unlink the checkpoint file
      expect(fsPromises.unlink).toHaveBeenCalledWith('/project/.glancey/checkpoint.json');
    });

    it('should resume from checkpoint with embedded chunks', async () => {
      // Use a fixed mtime for checkpoint freshness validation
      const checkpointMtime = Date.now() - 1000; // 1 second ago

      // Create a checkpoint file with embedded chunks
      const checkpoint = {
        phase: 'embedding',
        startedAt: '2024-01-01T00:00:00Z',
        files: ['/project/test.ts'],
        processedFiles: [],
        embeddedChunks: [
          {
            id: 'test.ts:1-10',
            filepath: 'test.ts',
            content: 'const x = 1;',
            startLine: 1,
            endLine: 10,
            language: 'typescript',
            embedding: [0.1, 0.2, 0.3],
          },
        ],
        embeddingBackend: 'mock',
        embeddingModel: 'mock-model',
        fileMtimes: { 'test.ts': checkpointMtime },
      };

      let checkpointCleared = false;
      vi.mocked(fsPromises.readFile).mockImplementation(async (path) => {
        if (path === '/project/.glancey/checkpoint.json') {
          if (checkpointCleared) {
            throw new Error('ENOENT');
          }
          return JSON.stringify(checkpoint);
        }
        return 'const x = 1;';
      });
      // Return same mtime as checkpoint to indicate file hasn't changed
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: checkpointMtime } as any);
      vi.mocked(fsPromises.unlink).mockImplementation(async (path) => {
        if (path === '/project/.glancey/checkpoint.json') {
          checkpointCleared = true;
        }
      });
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const result = await indexer.indexCodebase();

      // Should have resumed and completed without re-embedding
      expect(result.filesIndexed).toBe(1);
      expect(result.chunksCreated).toBe(1);

      // Should not have called embedBatch since chunks were already embedded
      expect(mockBackend.embedBatch).not.toHaveBeenCalled();
    });

    it('should discard checkpoint when embedding backend changes', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob as any).mockResolvedValue(['/project/test.ts']);

      // Checkpoint was created with different backend
      const checkpoint = {
        phase: 'chunking',
        startedAt: '2024-01-01T00:00:00Z',
        files: ['/project/test.ts'],
        processedFiles: [],
        pendingChunks: [
          {
            id: 'test.ts:1-10',
            filepath: 'test.ts',
            content: 'const x = 1;',
            startLine: 1,
            endLine: 10,
            language: 'typescript',
          },
        ],
        embeddingBackend: 'different-backend',
        embeddingModel: 'different-model',
      };

      let checkpointCleared = false;
      vi.mocked(fsPromises.readFile).mockImplementation(async (path) => {
        if (path === '/project/.glancey/checkpoint.json') {
          if (checkpointCleared) {
            throw new Error('ENOENT');
          }
          return JSON.stringify(checkpoint);
        }
        return 'const x = 1;';
      });
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: Date.now() } as any);
      vi.mocked(fsPromises.unlink).mockImplementation(async (path) => {
        if (path === '/project/.glancey/checkpoint.json') {
          checkpointCleared = true;
        }
      });
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      await indexer.indexCodebase();

      // Should have cleared the incompatible checkpoint
      expect(fsPromises.unlink).toHaveBeenCalledWith('/project/.glancey/checkpoint.json');

      // Should have re-embedded since backend changed
      expect(mockBackend.embedBatch).toHaveBeenCalled();
    });

    it('should clear checkpoint when clearIndex is called', async () => {
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      await indexer.clearIndex();

      // Should have tried to unlink the checkpoint file
      expect(fsPromises.unlink).toHaveBeenCalledWith('/project/.glancey/checkpoint.json');
    });

    it('should handle invalid checkpoint gracefully', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob as any).mockResolvedValue(['/project/test.ts']);

      // Invalid checkpoint (missing required fields)
      let checkpointCleared = false;
      vi.mocked(fsPromises.readFile).mockImplementation(async (path) => {
        if (path === '/project/.glancey/checkpoint.json') {
          if (checkpointCleared) {
            throw new Error('ENOENT');
          }
          return JSON.stringify({ phase: 'chunking' }); // Missing files and processedFiles
        }
        return 'const x = 1;';
      });
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: Date.now() } as any);
      vi.mocked(fsPromises.unlink).mockImplementation(async (path) => {
        if (path === '/project/.glancey/checkpoint.json') {
          checkpointCleared = true;
        }
      });
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // Should not throw and should do full indexing
      const result = await indexer.indexCodebase();
      expect(result.filesIndexed).toBe(1);
    });
  });

  describe('incremental indexing race conditions', () => {
    it('should handle file deletion detected via metadata', async () => {
      const { glob } = await import('glob');
      // Only return test.ts, simulating deleted.ts was already removed before glob
      vi.mocked(glob as any).mockResolvedValue(['/project/test.ts']);

      vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('checkpoint.json')) {
          throw new Error('ENOENT');
        }
        if (pathStr.includes('metadata.json')) {
          return JSON.stringify({
            lastUpdated: new Date().toISOString(),
            fileCount: 2,
            chunkCount: 2,
            embeddingBackend: 'mock',
            embeddingModel: 'mock-model',
            embeddingDimensions: 1536,
            version: '1.0.0',
          });
        }
        return 'const x = 1;';
      });

      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: Date.now() } as any);

      // Include file_metadata table to enable incremental detection
      mockConnection.tableNames.mockResolvedValue(['code_chunks', 'file_metadata']);
      const mockTable = createMockTable();
      // Mock metadata table with two files - one was deleted
      const mockMetadataTable = createMockTable();
      mockMetadataTable.query.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { filepath: 'test.ts', mtime: Date.now() - 1000 },
          { filepath: 'deleted.ts', mtime: Date.now() - 1000 },
        ]),
      } as any);
      mockConnection.openTable.mockImplementation(async (name: string) => {
        if (name === 'file_metadata') {
          return mockMetadataTable as any;
        }
        return mockTable as any;
      });

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // Should handle gracefully - detect deleted.ts as deleted since it's in metadata but not in glob
      const result = await indexer.indexCodebase();
      expect(result.incremental).toBe(true);
      // The deleted file should be removed from the index
      expect(mockTable.delete).toHaveBeenCalled();
    });

    it('should handle file modified during change detection', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob as any).mockResolvedValue(['/project/test.ts']);

      // File mtime changes between calls to stat
      let statCallCount = 0;
      const initialMtime = Date.now() - 5000;
      const modifiedMtime = Date.now();

      vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('checkpoint.json')) {
          throw new Error('ENOENT');
        }
        if (pathStr.includes('metadata.json')) {
          return JSON.stringify({
            lastUpdated: new Date().toISOString(),
            fileCount: 1,
            chunkCount: 1,
            embeddingBackend: 'mock',
            embeddingModel: 'mock-model',
            embeddingDimensions: 1536, // Match mock backend dimensions
            version: '1.0.0',
          });
        }
        if (pathStr.includes('files.json')) {
          return JSON.stringify({
            'test.ts': initialMtime,
          });
        }
        return 'const x = 1;';
      });

      vi.mocked(fsPromises.stat).mockImplementation(async () => {
        statCallCount++;
        // First call during change detection returns old mtime
        // Second call (if any) returns new mtime simulating modification
        return { mtimeMs: statCallCount === 1 ? initialMtime : modifiedMtime } as any;
      });

      mockConnection.tableNames.mockResolvedValue(['code_chunks']);
      const mockTable = createMockTable();
      mockConnection.openTable.mockResolvedValue(mockTable as any);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // Should complete without error - the file appears unchanged based on first stat
      const result = await indexer.indexCodebase();
      expect(result.incremental).toBe(true);
    });

    it('should handle concurrent indexCodebase calls gracefully', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob as any).mockResolvedValue(['/project/test.ts']);
      vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('checkpoint.json')) {
          throw new Error('ENOENT');
        }
        return 'const x = 1;';
      });
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: Date.now() } as any);
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // Start two concurrent indexing operations
      const promise1 = indexer.indexCodebase();
      const promise2 = indexer.indexCodebase();

      // Both should complete without throwing
      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should report success (though the actual behavior depends on implementation)
      expect(result1.filesIndexed).toBeGreaterThanOrEqual(0);
      expect(result2.filesIndexed).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty file list during indexing', async () => {
      const { glob } = await import('glob');
      // All files were deleted or none match
      vi.mocked(glob as any).mockResolvedValue([]);

      vi.mocked(fsPromises.readFile).mockImplementation(async (filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('checkpoint.json')) {
          throw new Error('ENOENT');
        }
        return '';
      });
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: Date.now() } as any);

      // No existing index
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      // Should handle gracefully - create empty index
      const result = await indexer.indexCodebase();
      expect(result.filesIndexed).toBe(0);
      expect(result.chunksCreated).toBe(0);
    });
  });

  describe('checkIfStale', () => {
    it('should return stale=true when index does not exist', async () => {
      mockConnection.tableNames.mockResolvedValue([]);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const result = await indexer.checkIfStale();

      expect(result.stale).toBe(true);
      expect(result.reason).toBe('Index does not exist');
    });

    it('should return stale=true when file_metadata table is missing', async () => {
      mockConnection.tableNames.mockResolvedValue(['code_chunks']);

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const result = await indexer.checkIfStale();

      expect(result.stale).toBe(true);
      expect(result.reason).toBe('No file metadata stored');
    });

    it('should return stale=false when no files have changed', async () => {
      const { glob } = await import('glob');
      const testFilePath = '/project/test.ts';
      const storedMtime = 1000;

      vi.mocked(glob as any).mockResolvedValue([testFilePath]);
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: storedMtime } as any);

      // Mock metadata table with matching mtime - needs query().toArray() chain
      const mockMetadataTable = {
        query: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([{ filepath: 'test.ts', mtime: storedMtime }]),
        }),
      };
      mockConnection.tableNames.mockResolvedValue(['code_chunks', 'file_metadata']);
      mockConnection.openTable.mockImplementation(async (tableName: string) => {
        if (tableName === 'file_metadata') {
          return mockMetadataTable as any;
        }
        return createMockTable([]) as any;
      });

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const result = await indexer.checkIfStale();

      expect(result.stale).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('should return stale=true with reason when files are modified', async () => {
      const { glob } = await import('glob');
      const testFilePath = '/project/test.ts';
      const storedMtime = 1000;
      const newMtime = 2000; // Newer than stored

      vi.mocked(glob as any).mockResolvedValue([testFilePath]);
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: newMtime } as any);

      // Mock metadata table with older mtime - needs query().toArray() chain
      const mockMetadataTable = {
        query: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([{ filepath: 'test.ts', mtime: storedMtime }]),
        }),
      };
      mockConnection.tableNames.mockResolvedValue(['code_chunks', 'file_metadata']);
      mockConnection.openTable.mockImplementation(async (tableName: string) => {
        if (tableName === 'file_metadata') {
          return mockMetadataTable as any;
        }
        return createMockTable([]) as any;
      });

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const result = await indexer.checkIfStale();

      expect(result.stale).toBe(true);
      expect(result.reason).toContain('modified');
    });

    it('should return stale=true with reason when new files are added', async () => {
      const { glob } = await import('glob');

      vi.mocked(glob as any).mockResolvedValue(['/project/existing.ts', '/project/new.ts']);
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: 1000 } as any);

      // Mock metadata table with only one file - needs query().toArray() chain
      const mockMetadataTable = {
        query: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([{ filepath: 'existing.ts', mtime: 1000 }]),
        }),
      };
      mockConnection.tableNames.mockResolvedValue(['code_chunks', 'file_metadata']);
      mockConnection.openTable.mockImplementation(async (tableName: string) => {
        if (tableName === 'file_metadata') {
          return mockMetadataTable as any;
        }
        return createMockTable([]) as any;
      });

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const result = await indexer.checkIfStale();

      expect(result.stale).toBe(true);
      expect(result.reason).toContain('new file');
    });

    it('should return stale=true with reason when files are deleted', async () => {
      const { glob } = await import('glob');

      vi.mocked(glob as any).mockResolvedValue(['/project/remaining.ts']);
      vi.mocked(fsPromises.stat).mockResolvedValue({ mtimeMs: 1000 } as any);

      // Mock metadata table with two files (one deleted) - needs query().toArray() chain
      const mockMetadataTable = {
        query: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { filepath: 'remaining.ts', mtime: 1000 },
            { filepath: 'deleted.ts', mtime: 1000 },
          ]),
        }),
      };
      mockConnection.tableNames.mockResolvedValue(['code_chunks', 'file_metadata']);
      mockConnection.openTable.mockImplementation(async (tableName: string) => {
        if (tableName === 'file_metadata') {
          return mockMetadataTable as any;
        }
        return createMockTable([]) as any;
      });

      const indexer = new CodeIndexer('/project', mockBackend);
      await indexer.initialize();

      const result = await indexer.checkIfStale();

      expect(result.stale).toBe(true);
      expect(result.reason).toContain('deleted');
    });
  });
});
