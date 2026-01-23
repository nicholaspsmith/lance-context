import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSuccessFetch, createOllamaEmbeddingResponse } from '../mocks/fetch.mock.js';

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
    delete process.env.OPENAI_API_KEY;
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
    it('should prefer OpenAI when OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      vi.stubGlobal('fetch', createSuccessFetch({ data: [] }));

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend();

      expect(backend.name).toBe('openai');
    });

    it('should fallback to Jina when OpenAI fails and JINA_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'invalid-key';
      process.env.JINA_API_KEY = 'test-jina-key';

      const mockFetch = vi.fn()
        // OpenAI fails
        .mockResolvedValueOnce({ ok: false, status: 401 })
        // Jina succeeds (called during initialize)
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ data: [{ embedding: [0.1] }] }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend();

      expect(backend.name).toBe('jina');
    });

    it('should fallback to Ollama when OpenAI and Jina fail', async () => {
      process.env.OPENAI_API_KEY = 'invalid-key';
      process.env.JINA_API_KEY = 'invalid-key';

      const mockFetch = vi.fn()
        // OpenAI fails
        .mockResolvedValueOnce({ ok: false, status: 401 })
        // Jina fails (called during initialize embed test)
        .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' })
        // Ollama succeeds
        .mockResolvedValue({ ok: true, status: 200, json: async () => ({ models: [] }) });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend();

      expect(backend.name).toBe('ollama');
    });

    it('should use Jina when only JINA_API_KEY is set', async () => {
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

    it('should use Ollama when no API keys are set', async () => {
      vi.stubGlobal('fetch', createSuccessFetch({ models: [] }));

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend();

      expect(backend.name).toBe('ollama');
    });
  });

  describe('fallback on initialization failure', () => {
    it('should try next backend when current fails to initialize', async () => {
      process.env.OPENAI_API_KEY = 'test-key';

      // Use 401 (non-retryable) instead of 500 (retryable) to avoid retry delays
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('openai')) {
          return { ok: false, status: 401, statusText: 'Unauthorized' };
        }
        // Ollama succeeds
        return { ok: true, status: 200, json: async () => ({ models: [] }) };
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
      await expect(createEmbeddingBackend()).rejects.toThrow(
        'No embedding backend available'
      );
    });
  });

  describe('config options', () => {
    it('should pass model to backend', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      vi.stubGlobal('fetch', createSuccessFetch({ data: [] }));

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const backend = await createEmbeddingBackend({ model: 'text-embedding-3-large' });

      expect(backend.getDimensions()).toBe(3072);
    });

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
