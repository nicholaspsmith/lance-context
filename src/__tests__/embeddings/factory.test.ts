import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSuccessFetch } from '../mocks/fetch.mock.js';
import { DEFAULT_OLLAMA_MODEL } from '../../embeddings/ollama.js';

/** Helper to create a mock /api/tags response with the default model available */
function createTagsResponseWithDefaultModel() {
  return { models: [{ name: DEFAULT_OLLAMA_MODEL }] };
}

/** Helper to create a mock Gemini embedding response */
function createGeminiEmbeddingResponse() {
  return { embedding: { values: [0.1, 0.2] } };
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
    delete process.env.GEMINI_API_KEY;
    delete process.env.OLLAMA_URL;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe('priority order', () => {
    it('should prefer Gemini when GEMINI_API_KEY is set', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => createGeminiEmbeddingResponse(),
      });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const { backend } = await createEmbeddingBackend();

      expect(backend.name).toBe('gemini');
    });

    it('should fallback to Ollama when Gemini fails', async () => {
      process.env.GEMINI_API_KEY = 'invalid-gemini-key';

      const mockFetch = vi
        .fn()
        // Gemini fails
        .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' })
        // Ollama succeeds (with default model available)
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => createTagsResponseWithDefaultModel(),
        });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const { backend } = await createEmbeddingBackend();

      expect(backend.name).toBe('ollama');
    });

    it('should use Ollama when no API keys are set', async () => {
      vi.stubGlobal('fetch', createSuccessFetch(createTagsResponseWithDefaultModel()));

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const { backend } = await createEmbeddingBackend();

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
    it('should pass apiKey to Gemini backend from config', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => createGeminiEmbeddingResponse(),
      });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const { backend } = await createEmbeddingBackend({ apiKey: 'config-gemini-key' });

      expect(backend.name).toBe('gemini');
    });

    it('should use OLLAMA_URL from environment', async () => {
      process.env.OLLAMA_URL = 'http://remote-ollama:11434';

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        expect(url).toContain('remote-ollama');
        return { ok: true, status: 200, json: async () => createTagsResponseWithDefaultModel() };
      });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const { backend } = await createEmbeddingBackend();

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
      const { backend } = await createEmbeddingBackend({ baseUrl: 'http://config-ollama:11434' });

      expect(backend.name).toBe('ollama');
    });
  });

  describe('explicit backend with fallback', () => {
    it('should fallback to Ollama when explicitly configured Gemini fails', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      const mockFetch = vi
        .fn()
        // Gemini initialization fails with an error
        .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Invalid API key' })
        // Ollama succeeds
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => createTagsResponseWithDefaultModel(),
        });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const { backend, fallback } = await createEmbeddingBackend({ backend: 'gemini' });

      expect(backend.name).toBe('ollama');
      expect(fallback).toBeDefined();
      expect(fallback?.occurred).toBe(true);
      expect(fallback?.originalBackend).toBe('gemini');
      expect(fallback?.fallbackBackend).toBe('ollama');
      expect(fallback?.reason).toContain('401');
    });

    it('should throw when explicitly configured Gemini fails and Ollama also fails', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      await expect(createEmbeddingBackend({ backend: 'gemini' })).rejects.toThrow(
        'Configured gemini backend failed'
      );
    });

    it('should not have fallback info when explicitly configured backend succeeds', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => createGeminiEmbeddingResponse(),
      });
      vi.stubGlobal('fetch', mockFetch);

      const createEmbeddingBackend = await getCreateEmbeddingBackend();
      const { backend, fallback } = await createEmbeddingBackend({ backend: 'gemini' });

      expect(backend.name).toBe('gemini');
      expect(fallback).toBeUndefined();
    });
  });
});
