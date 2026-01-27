import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaBackend, DEFAULT_OLLAMA_MODEL } from '../../embeddings/ollama.js';
import {
  createOllamaBatchEmbeddingResponse,
  createSuccessFetch,
  createErrorFetch,
} from '../mocks/fetch.mock.js';

/** Helper to create a mock /api/tags response with the default model available */
function createTagsResponseWithDefaultModel() {
  return { models: [{ name: DEFAULT_OLLAMA_MODEL }] };
}

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

    it('should use default model qwen3-embedding:0.6b with 1024 dimensions', () => {
      const backend = new OllamaBackend({ backend: 'ollama' });
      expect(backend.getModel()).toBe(DEFAULT_OLLAMA_MODEL);
      expect(backend.getDimensions()).toBe(1024);
    });

    it('should accept custom model', () => {
      const backend = new OllamaBackend({
        backend: 'ollama',
        model: 'custom-model',
      });
      expect(backend.name).toBe('ollama');
    });

    it('should use correct dimensions for known models', () => {
      const nomicBackend = new OllamaBackend({ backend: 'ollama', model: 'nomic-embed-text' });
      expect(nomicBackend.getDimensions()).toBe(768);

      const minilmBackend = new OllamaBackend({ backend: 'ollama', model: 'all-minilm' });
      expect(minilmBackend.getDimensions()).toBe(384);

      const mxbaiBackend = new OllamaBackend({ backend: 'ollama', model: 'mxbai-embed-large' });
      expect(mxbaiBackend.getDimensions()).toBe(1024);
    });

    it('should default to 1024 dimensions for unknown models', () => {
      const backend = new OllamaBackend({ backend: 'ollama', model: 'unknown-model' });
      expect(backend.getDimensions()).toBe(1024);
    });
  });

  describe('initialize', () => {
    it('should test connection by calling /api/tags', async () => {
      const mockFetch = createSuccessFetch(createTagsResponseWithDefaultModel());
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.anything());
    });

    it('should use custom baseUrl for initialization', async () => {
      const mockFetch = createSuccessFetch(createTagsResponseWithDefaultModel());
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({
        backend: 'ollama',
        baseUrl: 'http://custom:1234',
      });
      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledWith('http://custom:1234/api/tags', expect.anything());
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

    it('should throw helpful error when model is not available', async () => {
      const mockFetch = createSuccessFetch({ models: [{ name: 'other-model' }] });
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      await expect(backend.initialize()).rejects.toThrow(
        `Model '${DEFAULT_OLLAMA_MODEL}' not found in Ollama`
      );
    });

    it('should succeed when model is available', async () => {
      const mockFetch = createSuccessFetch(createTagsResponseWithDefaultModel());
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      await expect(backend.initialize()).resolves.toBeUndefined();
    });
  });

  describe('embed', () => {
    it('should use batch API with single text', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createOllamaBatchEmbeddingResponse([[0.1, 0.2, 0.3]]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      await backend.embed('test text');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embed',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: DEFAULT_OLLAMA_MODEL,
            input: ['test text'],
          }),
        })
      );
    });

    it('should return embedding from response', async () => {
      const embedding = [0.1, 0.2, 0.3];
      const mockFetch = vi.fn().mockResolvedValue(createOllamaBatchEmbeddingResponse([embedding]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      const result = await backend.embed('test text');

      expect(result).toEqual(embedding);
    });

    it('should use custom model in request', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createOllamaBatchEmbeddingResponse([[0.1]]));
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
    it('should use batch API to embed all texts in one request', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createOllamaBatchEmbeddingResponse([[0.1], [0.2], [0.3]]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      const result = await backend.embedBatch(['text1', 'text2', 'text3']);

      // Should make only 1 batch request
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embed',
        expect.objectContaining({
          body: JSON.stringify({
            model: DEFAULT_OLLAMA_MODEL,
            input: ['text1', 'text2', 'text3'],
          }),
        })
      );
      expect(result).toEqual([[0.1], [0.2], [0.3]]);
    });

    it('should preserve order of embeddings', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createOllamaBatchEmbeddingResponse([[0], [0.1], [0.2]]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OllamaBackend({ backend: 'ollama' });
      const result = await backend.embedBatch(['text1', 'text2', 'text3']);

      expect(result).toEqual([[0], [0.1], [0.2]]);
    });

    it('should process in chunks based on batchSize', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(createOllamaBatchEmbeddingResponse([[0.1], [0.2]]))
        .mockResolvedValueOnce(createOllamaBatchEmbeddingResponse([[0.3], [0.4]]))
        .mockResolvedValueOnce(createOllamaBatchEmbeddingResponse([[0.5]]));
      vi.stubGlobal('fetch', mockFetch);

      // Create backend with batch size of 2
      const backend = new OllamaBackend({ backend: 'ollama', batchSize: 2 });
      const result = await backend.embedBatch(['t1', 't2', 't3', 't4', 't5']);

      // Should make 3 batch requests (2+2+1)
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // Should return 5 embeddings
      expect(result).toHaveLength(5);
      expect(result).toEqual([[0.1], [0.2], [0.3], [0.4], [0.5]]);
    });

    it('should use default batch size of 100', async () => {
      const embeddings = Array.from({ length: 150 }, (_, i) => [i * 0.01]);
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(createOllamaBatchEmbeddingResponse(embeddings.slice(0, 100)))
        .mockResolvedValueOnce(createOllamaBatchEmbeddingResponse(embeddings.slice(100)));
      vi.stubGlobal('fetch', mockFetch);

      // Create backend without custom batchSize (should use default 100)
      const backend = new OllamaBackend({ backend: 'ollama' });
      const texts = Array.from({ length: 150 }, (_, i) => `text${i}`);
      const result = await backend.embedBatch(texts);

      // Should make 2 batch requests (100 + 50)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(150);
    });
  });

  describe('getDimensions', () => {
    it('should return 1024 for default qwen3-embedding model', () => {
      const backend = new OllamaBackend({ backend: 'ollama' });
      expect(backend.getDimensions()).toBe(1024);
    });
  });

  describe('getModel', () => {
    it('should return the configured model', () => {
      const backend = new OllamaBackend({ backend: 'ollama' });
      expect(backend.getModel()).toBe(DEFAULT_OLLAMA_MODEL);

      const customBackend = new OllamaBackend({ backend: 'ollama', model: 'custom-model' });
      expect(customBackend.getModel()).toBe('custom-model');
    });
  });
});
