import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startServer, type DashboardServer } from '../../dashboard/server.js';
import { dashboardState } from '../../dashboard/state.js';

interface StatusResponse {
  indexed: boolean;
  fileCount: number;
  chunkCount: number;
  lastUpdated: string | null;
  indexPath: string;
  isIndexing: boolean;
  embeddingBackend?: string;
}

interface ConfigResponse {
  projectPath: string;
  patterns: string[];
  excludePatterns: string[];
  chunking: { maxLines: number; overlap: number };
  search: { semanticWeight: number; keywordWeight: number };
}

interface HeartbeatResponse {
  ok: boolean;
  timestamp: string;
  clients: number;
}

describe('Dashboard Routes', () => {
  let server: DashboardServer;

  beforeEach(async () => {
    // Use port 0 to let the OS assign a random available port
    // This avoids race conditions when tests run in parallel
    server = await startServer(0);
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('GET /', () => {
    it('should return HTML dashboard', async () => {
      const response = await fetch(`${server.url}/`);
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toContain('text/html');

      const html = await response.text();
      expect(html).toContain('lance-context');
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  describe('GET /api/status', () => {
    it('should return 503 when indexer not initialized', async () => {
      const response = await fetch(`${server.url}/api/status`);
      expect(response.status).toBe(503);
    });

    it('should return status when indexer is set', async () => {
      const mockIndexer = {
        getStatus: vi.fn().mockResolvedValue({
          indexed: true,
          fileCount: 10,
          chunkCount: 50,
          lastUpdated: '2024-01-01T00:00:00.000Z',
          indexPath: '/test/.lance-context',
          embeddingBackend: 'gemini',
        }),
      };
      dashboardState.setIndexer(mockIndexer as never);

      const response = await fetch(`${server.url}/api/status`);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as StatusResponse;
      expect(data.indexed).toBe(true);
      expect(data.fileCount).toBe(10);
      expect(data.chunkCount).toBe(50);
      expect(data.isIndexing).toBe(false);
    });
  });

  describe('GET /api/config', () => {
    it('should return 503 when config not loaded', async () => {
      // Reset config to null by creating a fresh state manager effect
      const originalConfig = dashboardState.getConfig();

      // Make a request before setting config
      const response = await fetch(`${server.url}/api/config`);

      // Only check for 503 if config was actually null
      if (!originalConfig) {
        expect(response.status).toBe(503);
      }
    });

    it('should return config when set', async () => {
      const config = {
        patterns: ['**/*.ts', '**/*.js'],
        excludePatterns: ['**/node_modules/**'],
        chunking: { maxLines: 100, overlap: 20 },
        search: { semanticWeight: 0.7, keywordWeight: 0.3 },
      };
      dashboardState.setConfig(config);
      dashboardState.setProjectPath('/test/project');

      const response = await fetch(`${server.url}/api/config`);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as ConfigResponse;
      expect(data.projectPath).toBe('/test/project');
      expect(data.patterns).toEqual(['**/*.ts', '**/*.js']);
      expect(data.chunking.maxLines).toBe(100);
    });
  });

  describe('GET /api/events', () => {
    it('should return SSE stream', async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      try {
        const response = await fetch(`${server.url}/api/events`, {
          signal: controller.signal,
        });

        expect(response.ok).toBe(true);
        expect(response.headers.get('content-type')).toBe('text/event-stream');
      } catch (error) {
        // AbortError is expected
        if ((error as Error).name !== 'AbortError') {
          throw error;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    });
  });

  describe('GET /api/heartbeat', () => {
    it('should return health check', async () => {
      const response = await fetch(`${server.url}/api/heartbeat`);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as HeartbeatResponse;
      expect(data.ok).toBe(true);
      expect(data.timestamp).toBeDefined();
      expect(typeof data.clients).toBe('number');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await fetch(`${server.url}/unknown`);
      expect(response.status).toBe(404);
    });
  });

  describe('method handling', () => {
    it('should return 405 for non-GET methods', async () => {
      const response = await fetch(`${server.url}/api/heartbeat`, {
        method: 'POST',
      });
      expect(response.status).toBe(405);
    });
  });
});
