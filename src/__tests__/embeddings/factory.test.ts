import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSuccessFetch } from '../mocks/fetch.mock.js';

// We need to dynamically import createEmbeddingBackend after setting env vars
async function getCreateEmbeddingBackend() {
  // Reset module cache to pick up new env vars
  vi.resetModules();
  const module = await import('../../embeddings/index.js');
  return module.createEmbeddingBackend;
}

describe('createEmbeddingBackend', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.JINA_API_KEY;
    delete process.env.OLLAMA_URL;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe('priority order', () => {
    it('should prefer Jina when JINA_API_KEY is set', async () => {
      process.env.JINA_API_KEY = 'test-jina-key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ embedding: [0.1] }] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend();

      expect(backend.name).toBe('jina');
    });

    it('should fallback to Ollama when Jina fails', async () => {
      process.env.JINA_API_KEY = 'invalid-key';

      const mockFetch = vi
        .fn()
        // Jina fails (called during initialize embed test)
        .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' })
        // Ollama succeeds
        .mockResolvedValue({ ok: true, status: 200, json: async () => ({ models: [] }) });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend();

      expect(backend.name).toBe('ollama');
    });

    it('should use Ollama when no API keys are set', async () => {
      vi.stubGlobal('fetch', createSuccessFetch({ models: [] }));

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend();

      expect(backend.name).toBe('ollama');
    });
  });

  describe('error when all backends fail', () => {
    it('should throw when no backend is available', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      await expect(createEmbeddingBackend()).rejects.toThrow('No embedding backend available');
    });
  });

  describe('config options', () => {
    it('should pass apiKey to Jina backend from config', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ embedding: [0.1] }] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend({ apiKey: 'config-jina-key' });

      expect(backend.name).toBe('jina');
    });

    it('should use OLLAMA_URL from environment', async () => {
      process.env.OLLAMA_URL = 'http://remote-ollama:11434';

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        expect(url).toContain('remote-ollama');
        return { ok: true, status: 200, json: async () => ({ models: [] }) };
      });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend();

      expect(backend.name).toBe('ollama');
    });

    it('should prefer baseUrl from config over environment', async () => {
      process.env.OLLAMA_URL = 'http://env-ollama:11434';

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        expect(url).toContain('config-ollama');
        return { ok: true, status: 200, json: async () => ({ models: [] }) };
      });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend({ baseUrl: 'http://config-ollama:11434' });

      expect(backend.name).toBe('ollama');
    });
  });
});
