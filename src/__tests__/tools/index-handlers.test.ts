import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleIndexCodebase,
  handleGetIndexStatus,
  handleClearIndex,
  parseIndexCodebaseArgs,
} from '../../tools/index-handlers.js';
import type { ToolContext } from '../../tools/types.js';
import type { CodeIndexer, IndexStatus } from '../../search/indexer.js';

describe('index-handlers', () => {
  let mockIndexer: Partial<CodeIndexer>;
  let context: ToolContext;

  beforeEach(() => {
    mockIndexer = {
      indexCodebase: vi.fn(),
      getStatus: vi.fn(),
      clearIndex: vi.fn(),
    };

    context = {
      indexer: mockIndexer as CodeIndexer,
      projectPath: '/test/project',
      toolGuidance: '\n---\nGuidance text',
    };
  });

  describe('parseIndexCodebaseArgs', () => {
    it('should return defaults when no args provided', () => {
      const result = parseIndexCodebaseArgs(undefined);
      expect(result).toEqual({
        patterns: undefined,
        excludePatterns: undefined,
        forceReindex: false,
        autoRepair: false,
      });
    });

    it('should parse valid patterns array', () => {
      const result = parseIndexCodebaseArgs({ patterns: ['**/*.ts', '**/*.js'] });
      expect(result.patterns).toEqual(['**/*.ts', '**/*.js']);
    });

    it('should ignore invalid patterns', () => {
      const result = parseIndexCodebaseArgs({ patterns: 'not-an-array' });
      expect(result.patterns).toBeUndefined();
    });

    it('should parse forceReindex boolean', () => {
      const result = parseIndexCodebaseArgs({ forceReindex: true });
      expect(result.forceReindex).toBe(true);
    });

    it('should parse autoRepair boolean', () => {
      const result = parseIndexCodebaseArgs({ autoRepair: true });
      expect(result.autoRepair).toBe(true);
    });

    it('should default booleans to false for non-boolean values', () => {
      const result = parseIndexCodebaseArgs({ forceReindex: 'true', autoRepair: 1 });
      expect(result.forceReindex).toBe(false);
      expect(result.autoRepair).toBe(false);
    });
  });

  describe('handleIndexCodebase', () => {
    it('should return full reindex message for non-incremental result', async () => {
      vi.mocked(mockIndexer.indexCodebase!).mockResolvedValue({
        filesIndexed: 10,
        chunksCreated: 50,
        incremental: false,
        repaired: false,
      });

      const result = await handleIndexCodebase({}, context);

      expect(result.content[0].text).toContain('Full reindex');
      expect(result.content[0].text).toContain('10 files');
      expect(result.content[0].text).toContain('50 chunks');
    });

    it('should return incremental message for incremental result', async () => {
      vi.mocked(mockIndexer.indexCodebase!).mockResolvedValue({
        filesIndexed: 2,
        chunksCreated: 10,
        incremental: true,
        repaired: false,
      });

      const result = await handleIndexCodebase({}, context);

      expect(result.content[0].text).toContain('Incremental update');
    });

    it('should return repaired message when corruption was fixed', async () => {
      vi.mocked(mockIndexer.indexCodebase!).mockResolvedValue({
        filesIndexed: 10,
        chunksCreated: 50,
        incremental: false,
        repaired: true,
      });

      const result = await handleIndexCodebase({}, context);

      expect(result.content[0].text).toContain('Repaired');
      expect(result.content[0].text).toContain('corruption detected');
    });

    it('should pass arguments to indexer', async () => {
      vi.mocked(mockIndexer.indexCodebase!).mockResolvedValue({
        filesIndexed: 0,
        chunksCreated: 0,
        incremental: false,
        repaired: false,
      });

      await handleIndexCodebase(
        {
          patterns: ['**/*.ts'],
          excludePatterns: ['**/node_modules/**'],
          forceReindex: true,
          autoRepair: true,
        },
        context
      );

      expect(mockIndexer.indexCodebase).toHaveBeenCalledWith(
        ['**/*.ts'],
        ['**/node_modules/**'],
        true,
        undefined,
        true
      );
    });

    it('should call onProgress callback when provided', async () => {
      vi.mocked(mockIndexer.indexCodebase!).mockImplementation(async (_p, _e, _f, onProgress) => {
        onProgress?.({ phase: 'scanning', current: 0, total: 0, message: 'test' });
        return { filesIndexed: 0, chunksCreated: 0, incremental: false, repaired: false };
      });

      const onProgress = vi.fn();
      await handleIndexCodebase({}, context, onProgress);

      expect(onProgress).toHaveBeenCalledWith({
        phase: 'scanning',
        current: 0,
        total: 0,
        message: 'test',
      });
    });

    it('should append tool guidance to response', async () => {
      vi.mocked(mockIndexer.indexCodebase!).mockResolvedValue({
        filesIndexed: 0,
        chunksCreated: 0,
        incremental: false,
        repaired: false,
      });

      const result = await handleIndexCodebase({}, context);

      expect(result.content[0].text).toContain('Guidance text');
    });
  });

  describe('handleGetIndexStatus', () => {
    it('should return JSON status', async () => {
      const status: IndexStatus = {
        indexed: true,
        fileCount: 10,
        chunkCount: 50,
        lastUpdated: '2024-01-01T00:00:00.000Z',
        indexPath: '/test/.glancey',
      };
      vi.mocked(mockIndexer.getStatus!).mockResolvedValue(status);

      const result = await handleGetIndexStatus(context);

      expect(result.content[0].text).toContain('"indexed": true');
      expect(result.content[0].text).toContain('"fileCount": 10');
    });

    it('should include corruption warning when corrupted', async () => {
      const status: IndexStatus = {
        indexed: true,
        fileCount: 10,
        chunkCount: 50,
        lastUpdated: '2024-01-01T00:00:00.000Z',
        indexPath: '/test/.glancey',
        corrupted: true,
        corruptionReason: 'Checksum mismatch',
      };
      vi.mocked(mockIndexer.getStatus!).mockResolvedValue(status);

      const result = await handleGetIndexStatus(context);

      expect(result.content[0].text).toContain('WARNING: Index corruption detected');
      expect(result.content[0].text).toContain('Checksum mismatch');
      expect(result.content[0].text).toContain('autoRepair: true');
    });

    it('should append tool guidance to response', async () => {
      vi.mocked(mockIndexer.getStatus!).mockResolvedValue({
        indexed: false,
        fileCount: 0,
        chunkCount: 0,
        lastUpdated: null,
        indexPath: '/test/.glancey',
      });

      const result = await handleGetIndexStatus(context);

      expect(result.content[0].text).toContain('Guidance text');
    });
  });

  describe('handleClearIndex', () => {
    it('should call clearIndex on indexer', async () => {
      vi.mocked(mockIndexer.clearIndex!).mockResolvedValue(undefined);

      await handleClearIndex(context);

      expect(mockIndexer.clearIndex).toHaveBeenCalled();
    });

    it('should return success message', async () => {
      vi.mocked(mockIndexer.clearIndex!).mockResolvedValue(undefined);

      const result = await handleClearIndex(context);

      expect(result.content[0].text).toContain('Index cleared');
    });

    it('should append tool guidance to response', async () => {
      vi.mocked(mockIndexer.clearIndex!).mockResolvedValue(undefined);

      const result = await handleClearIndex(context);

      expect(result.content[0].text).toContain('Guidance text');
    });
  });
});
