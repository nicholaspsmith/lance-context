import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaBackend } from '../../embeddings/ollama.js';
import { createOllamaEmbeddingResponse, createSuccessFetch, createErrorFetch } from '../mocks/fetch.mock.js';

describe('OllamaBackend', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should use default baseUrl localhost:11434', () => {
      const backend = new OllamaBackend({ backend: 'ollama' });
      expect(backend.name).toBe('ollama');
    });

    it('should accept custom baseUrl', () => {
      const backend = new OllamaBackend({
        backend: 'ollama',
        baseUrl: 'http://custom:1234',
      });
      expect(backend.name).toBe('ollama');
    });

    it('should use default model nomic-embed-text', () => {
      const backend = new OllamaBackend({ backend: 'ollama' });
      expect(backend.getDimensions()).toBe(768);
    });

    it('should accept custom model', () => {
      const backend = new OllamaBackend({
        backend: 'ollama',
        model: 'custom-model',
      });
      expect(backend.name).toBe('ollama');
    });
  });

  describe('initialize', () => {
    it('should test connection by calling /api/tags', async () => {
      const mockFetch = createSuccessFetch({ models: [] });
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.anything()
      );
    });

    it('should use custom baseUrl for initialization', async () => {
      const mockFetch = createSuccessFetch({ models: [] });
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({
        backend: 'ollama',
        baseUrl: 'http://custom:1234',
      });
      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://custom:1234/api/tags',
        expect.anything()
      );
    });

    it('should throw on connection failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

      const backend = new OllamaBackend({ backend: 'ollama' });
      await expect(backend.initialize()).rejects.toThrow(
        'Failed to connect to Ollama at http://localhost:11434'
      );
    });

    it('should throw on non-OK response', async () => {
      // Use 404 (non-retryable) instead of 500 (retryable)
      const mockFetch = createErrorFetch(404, 'Not found');
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      await expect(backend.initialize()).rejects.toThrow(
        'Failed to connect to Ollama at http://localhost:11434'
      );
    });
  });

  describe('embed', () => {
    it('should use prompt instead of input', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createOllamaEmbeddingResponse([0.1, 0.2, 0.3]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      await backend.embed('test text');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'nomic-embed-text',
            prompt: 'test text',
          }),
        })
      );
    });

    it('should return embedding from response', async () => {
      const embedding = [0.1, 0.2, 0.3];
      const mockFetch = vi.fn().mockResolvedValue(createOllamaEmbeddingResponse(embedding));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      const result = await backend.embed('test text');

      expect(result).toEqual(embedding);
    });

    it('should use custom model in request', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createOllamaEmbeddingResponse([0.1]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({
        backend: 'ollama',
        model: 'mxbai-embed-large',
      });
      await backend.embed('test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('mxbai-embed-large'),
        })
      );
    });

    it('should throw on API error', async () => {
      // Use 400 (non-retryable) instead of 500 (retryable)
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
      });
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      await expect(backend.embed('test')).rejects.toThrow('Ollama embedding failed: 400');
    });
  });

  describe('embedBatch', () => {
    it('should parallelize calls since Ollama has no native batch', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(createOllamaEmbeddingResponse([0.1]))
        .mockResolvedValueOnce(createOllamaEmbeddingResponse([0.2]))
        .mockResolvedValueOnce(createOllamaEmbeddingResponse([0.3]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      const result = await backend.embedBatch(['text1', 'text2', 'text3']);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual([[0.1], [0.2], [0.3]]);
    });

    it('should preserve order of embeddings', async () => {
      // Simulate different response times by controlling mock order
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
        const body = JSON.parse(options.body);
        const index = ['text1', 'text2', 'text3'].indexOf(body.prompt);
        return createOllamaEmbeddingResponse([index * 0.1]);
      });
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      const result = await backend.embedBatch(['text1', 'text2', 'text3']);

      expect(result).toEqual([[0], [0.1], [0.2]]);
    });
  });

  describe('getDimensions', () => {
    it('should return 768 for default nomic-embed-text model', () => {
      const backend = new OllamaBackend({ backend: 'ollama' });
      expect(backend.getDimensions()).toBe(768);
    });
  });
});
