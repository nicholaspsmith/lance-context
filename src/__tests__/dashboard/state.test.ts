import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardStateManager } from '../../dashboard/state.js';

describe('DashboardStateManager', () => {
  let stateManager: DashboardStateManager;

  beforeEach(() => {
    stateManager = new DashboardStateManager();
  });

  describe('setIndexer', () => {
    it('should set and use the indexer', async () => {
      const mockIndexer = {
        getStatus: vi.fn().mockResolvedValue({
          indexed: true,
          fileCount: 10,
          chunkCount: 50,
          lastUpdated: '2024-01-01T00:00:00.000Z',
          indexPath: '/test/.glancey',
        }),
      };

      stateManager.setIndexer(mockIndexer as never);
      const status = await stateManager.getStatus();

      expect(status).toEqual({
        indexed: true,
        fileCount: 10,
        chunkCount: 50,
        lastUpdated: '2024-01-01T00:00:00.000Z',
        indexPath: '/test/.glancey',
      });
      expect(mockIndexer.getStatus).toHaveBeenCalled();
    });

    it('should return null if no indexer is set', async () => {
      const status = await stateManager.getStatus();
      expect(status).toBeNull();
    });
  });

  describe('setConfig', () => {
    it('should set and retrieve config', () => {
      const config = {
        patterns: ['**/*.ts'],
        excludePatterns: ['**/node_modules/**'],
      };

      stateManager.setConfig(config);
      expect(stateManager.getConfig()).toEqual(config);
    });
  });

  describe('setProjectPath', () => {
    it('should set and retrieve project path', () => {
      stateManager.setProjectPath('/test/project');
      expect(stateManager.getProjectPath()).toBe('/test/project');
    });
  });

  describe('indexing state', () => {
    it('should track indexing state', () => {
      expect(stateManager.isIndexingInProgress()).toBe(false);

      stateManager.onIndexingStart();
      expect(stateManager.isIndexingInProgress()).toBe(true);

      stateManager.onIndexingComplete({ filesIndexed: 5, chunksCreated: 20 });
      expect(stateManager.isIndexingInProgress()).toBe(false);
    });

    it('should track last progress', () => {
      expect(stateManager.getLastProgress()).toBeNull();

      const progress = {
        phase: 'embedding' as const,
        current: 5,
        total: 10,
        message: 'Embedding chunks...',
      };

      stateManager.onProgress(progress);
      expect(stateManager.getLastProgress()).toEqual(progress);
    });

    it('should clear last progress on indexing complete', () => {
      stateManager.onIndexingStart();
      stateManager.onProgress({
        phase: 'embedding',
        current: 5,
        total: 10,
        message: 'Embedding chunks...',
      });

      expect(stateManager.getLastProgress()).not.toBeNull();

      stateManager.onIndexingComplete({ filesIndexed: 5, chunksCreated: 20 });
      expect(stateManager.getLastProgress()).toBeNull();
    });
  });

  describe('events', () => {
    it('should emit indexing:start event', () => {
      const listener = vi.fn();
      stateManager.on('indexing:start', listener);

      stateManager.onIndexingStart();

      expect(listener).toHaveBeenCalled();
    });

    it('should emit progress event', () => {
      const listener = vi.fn();
      stateManager.on('progress', listener);

      const progress = {
        phase: 'chunking' as const,
        current: 3,
        total: 10,
        message: 'Chunking files...',
      };
      stateManager.onProgress(progress);

      expect(listener).toHaveBeenCalledWith(progress);
    });

    it('should emit indexing:complete event', () => {
      const listener = vi.fn();
      stateManager.on('indexing:complete', listener);

      const result = { filesIndexed: 5, chunksCreated: 20 };
      stateManager.onIndexingComplete(result);

      expect(listener).toHaveBeenCalledWith(result);
    });

    it('should emit status:change event', () => {
      const listener = vi.fn();
      stateManager.on('status:change', listener);

      const status = {
        indexed: true,
        fileCount: 10,
        chunkCount: 50,
        lastUpdated: '2024-01-01T00:00:00.000Z',
        indexPath: '/test/.glancey',
      };
      stateManager.onStatusChange(status);

      expect(listener).toHaveBeenCalledWith(status);
    });
  });
});
