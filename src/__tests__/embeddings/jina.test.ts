import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JinaBackend, DEFAULT_JINA_API_KEY } from '../../embeddings/jina.js';
import { createJinaEmbeddingResponse, createErrorFetch } from '../mocks/fetch.mock.js';

describe('JinaBackend', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should use default community API key when none provided', () => {
      const backend = new JinaBackend({ backend: 'jina' });
      expect(backend.name).toBe('jina');
      expect(backend.isUsingDefaultKey()).toBe(true);
    });

    it('should accept custom API key in config', () => {
      const backend = new JinaBackend({ backend: 'jina', apiKey: 'custom-key' });
      expect(backend.name).toBe('jina');
      expect(backend.isUsingDefaultKey()).toBe(false);
    });

    it('should use default model jina-embeddings-v3', () => {
      const backend = new JinaBackend({ backend: 'jina', apiKey: 'test-key' });
      expect(backend.getDimensions()).toBe(1024);
    });

    it('should accept custom model', () => {
      const backend = new JinaBackend({
        backend: 'jina',
        apiKey: 'test-key',
        model: 'custom-model',
      });
      expect(backend.name).toBe('jina');
    });

    it('should export the default API key constant', () => {
      expect(DEFAULT_JINA_API_KEY).toBeDefined();
      expect(typeof DEFAULT_JINA_API_KEY).toBe('string');
    });
  });

  describe('initialize', () => {
    it('should test API key by calling embed', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createJinaEmbeddingResponse([[0.1, 0.2]]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new JinaBackend({ backend: 'jina', apiKey: 'test-key' });
      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.jina.ai/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });

    it('should throw on initialization failure', async () => {
      const mockFetch = createErrorFetch(401, 'Unauthorized');
      vi.stubGlobal('fetch', mockFetch);

      const backend = new JinaBackend({ backend: 'jina', apiKey: 'invalid-key' });
      await expect(backend.initialize()).rejects.toThrow('Failed to initialize Jina backend');
    });
  });

  describe('embed', () => {
    it('should send correct request format', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createJinaEmbeddingResponse([[0.1, 0.2, 0.3]]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new JinaBackend({ backend: 'jina', apiKey: 'test-key' });
      await backend.embed('test text');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.jina.ai/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
          body: JSON.stringify({
            model: 'jina-embeddings-v3',
            input: ['test text'],
          }),
        })
      );
    });

    it('should return embedding from response', async () => {
      const embedding = [0.1, 0.2, 0.3];
      const mockFetch = vi.fn().mockResolvedValue(createJinaEmbeddingResponse([embedding]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new JinaBackend({ backend: 'jina', apiKey: 'test-key' });
      const result = await backend.embed('test text');

      expect(result).toEqual(embedding);
    });

    it('should throw on API error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });
      vi.stubGlobal('fetch', mockFetch);

      const backend = new JinaBackend({ backend: 'jina', apiKey: 'test-key' });
      await expect(backend.embed('test')).rejects.toThrow('Jina API error: 400 - Bad request');
    });
  });

  describe('embedBatch', () => {
    it('should send all texts in single request', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createJinaEmbeddingResponse([[0.1], [0.2], [0.3]]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new JinaBackend({ backend: 'jina', apiKey: 'test-key' });
      await backend.embedBatch(['text1', 'text2', 'text3']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            model: 'jina-embeddings-v3',
            input: ['text1', 'text2', 'text3'],
          }),
        })
      );
    });

    it('should return embeddings in order', async () => {
      const embeddings = [[0.1], [0.2], [0.3]];
      const mockFetch = vi.fn().mockResolvedValue(createJinaEmbeddingResponse(embeddings));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new JinaBackend({ backend: 'jina', apiKey: 'test-key' });
      const result = await backend.embedBatch(['text1', 'text2', 'text3']);

      expect(result).toEqual(embeddings);
    });

    it('should throw on API error', async () => {
      // Use 400 (non-retryable) instead of 500 (retryable)
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });
      vi.stubGlobal('fetch', mockFetch);

      const backend = new JinaBackend({ backend: 'jina', apiKey: 'test-key' });
      await expect(backend.embedBatch(['text'])).rejects.toThrow(
        'Jina API error: 400 - Bad request'
      );
    });

    it('should chunk large batches and make multiple requests', async () => {
      const mockFetch = vi
        .fn()
        .mockImplementation(() => createJinaEmbeddingResponse([[0.1], [0.2]]));
      vi.stubGlobal('fetch', mockFetch);

      // Create backend with batch size of 2
      const backend = new JinaBackend({ backend: 'jina', apiKey: 'test-key', batchSize: 2 });
      const result = await backend.embedBatch(['text1', 'text2', 'text3', 'text4', 'text5']);

      // Should make 3 requests: [text1, text2], [text3, text4], [text5]
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // Should return all 5 embeddings (though mock returns 2 per call, so we get 6)
      expect(result).toHaveLength(6);
    });

    it('should not chunk when batch is smaller than batch size', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createJinaEmbeddingResponse([[0.1], [0.2], [0.3]]));
      vi.stubGlobal('fetch', mockFetch);

      // Create backend with batch size of 100 (larger than input)
      const backend = new JinaBackend({ backend: 'jina', apiKey: 'test-key', batchSize: 100 });
      await backend.embedBatch(['text1', 'text2', 'text3']);

      // Should make only 1 request
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDimensions', () => {
    it('should return 1024 for default model', () => {
      const backend = new JinaBackend({ backend: 'jina', apiKey: 'test-key' });
      expect(backend.getDimensions()).toBe(1024);
    });
  });
});
