import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_OLLAMA_MODEL } from '../../embeddings/ollama.js';

/** Helper to create a mock /api/tags response with the default model available */
function createTagsResponseWithDefaultModel() {
  return { models: [{ name: DEFAULT_OLLAMA_MODEL }] };
}

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
    it('should use Jina by default (has built-in community key)', async () => {
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

    it('should prefer custom Jina key over default when JINA_API_KEY is set', async () => {
      process.env.JINA_API_KEY = 'custom-jina-key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ embedding: [0.1] }] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend();

      expect(backend.name).toBe('jina');
      // Check that custom key was used in request
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer custom-jina-key',
          }),
        })
      );
    });

    it('should fallback to Ollama when Jina fails', async () => {
      const mockFetch = vi
        .fn()
        // Jina fails (called during initialize embed test)
        .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' })
        // Ollama succeeds (with default model available)
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => createTagsResponseWithDefaultModel(),
        });
      vi.stubGlobal('fetch', mockFetch);

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
        return { ok: true, status: 200, json: async () => createTagsResponseWithDefaultModel() };
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
        return { ok: true, status: 200, json: async () => createTagsResponseWithDefaultModel() };
      });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend({ baseUrl: 'http://config-ollama:11434' });

      expect(backend.name).toBe('ollama');
    });
  });
});
