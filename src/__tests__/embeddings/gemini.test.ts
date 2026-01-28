import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiBackend } from '../../embeddings/gemini.js';
import {
  createGeminiEmbeddingResponse,
  createGeminiBatchEmbeddingResponse,
  createErrorFetch,
} from '../mocks/fetch.mock.js';

describe('GeminiBackend', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should throw if API key is not provided', () => {
      expect(() => new GeminiBackend({ backend: 'gemini' })).toThrow('Gemini API key is required');
    });

    it('should accept API key in config', () => {
      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key' });
      expect(backend.name).toBe('gemini');
    });

    it('should use default model gemini-embedding-001', () => {
      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key' });
      expect(backend.getModel()).toBe('gemini-embedding-001');
    });

    it('should return 768 dimensions by default', () => {
      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key' });
      expect(backend.getDimensions()).toBe(768);
    });

    it('should accept custom model', () => {
      const backend = new GeminiBackend({
        backend: 'gemini',
        apiKey: 'test-key',
        model: 'custom-model',
      });
      expect(backend.getModel()).toBe('custom-model');
    });
  });

  describe('initialize', () => {
    it('should test API key by calling embed', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createGeminiEmbeddingResponse([0.1, 0.2]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key' });
      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-goog-api-key': 'test-key',
          }),
        })
      );
    });

    it('should throw on initialization failure', async () => {
      const mockFetch = createErrorFetch(401, 'Unauthorized');
      vi.stubGlobal('fetch', mockFetch);

      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'invalid-key' });
      await expect(backend.initialize()).rejects.toThrow('Failed to initialize Gemini backend');
    });
  });

  describe('embed', () => {
    it('should send correct request format', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createGeminiEmbeddingResponse([0.1, 0.2, 0.3]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key' });
      await backend.embed('test text');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': 'test-key',
          },
          body: JSON.stringify({
            model: 'models/gemini-embedding-001',
            content: {
              parts: [{ text: 'test text' }],
            },
            outputDimensionality: 768,
          }),
        })
      );
    });

    it('should return embedding from response', async () => {
      const embedding = [0.1, 0.2, 0.3];
      const mockFetch = vi.fn().mockResolvedValue(createGeminiEmbeddingResponse(embedding));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key' });
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

      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key' });
      await expect(backend.embed('test')).rejects.toThrow('Gemini API error: 400 - Bad request');
    });
  });

  describe('embedBatch', () => {
    it('should use batchEmbedContents endpoint', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createGeminiBatchEmbeddingResponse([[0.1], [0.2], [0.3]]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key' });
      await backend.embedBatch(['text1', 'text2', 'text3']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents',
        expect.objectContaining({
          body: JSON.stringify({
            requests: [
              {
                model: 'models/gemini-embedding-001',
                content: { parts: [{ text: 'text1' }] },
                outputDimensionality: 768,
              },
              {
                model: 'models/gemini-embedding-001',
                content: { parts: [{ text: 'text2' }] },
                outputDimensionality: 768,
              },
              {
                model: 'models/gemini-embedding-001',
                content: { parts: [{ text: 'text3' }] },
                outputDimensionality: 768,
              },
            ],
          }),
        })
      );
    });

    it('should return embeddings in order', async () => {
      const embeddings = [[0.1], [0.2], [0.3]];
      const mockFetch = vi.fn().mockResolvedValue(createGeminiBatchEmbeddingResponse(embeddings));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key' });
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

      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key' });
      await expect(backend.embedBatch(['text'])).rejects.toThrow(
        'Gemini API error: 400 - Bad request'
      );
    });

    it('should chunk large batches and make multiple requests', async () => {
      const mockFetch = vi
        .fn()
        .mockImplementation(() => createGeminiBatchEmbeddingResponse([[0.1], [0.2]]));
      vi.stubGlobal('fetch', mockFetch);

      // Create backend with batch size of 2
      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key', batchSize: 2 });
      const result = await backend.embedBatch(['text1', 'text2', 'text3', 'text4', 'text5']);

      // Should make 3 requests: [text1, text2], [text3, text4], [text5]
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // Should return all 5 embeddings (though mock returns 2 per call, so we get 6)
      expect(result).toHaveLength(6);
    });

    it('should not chunk when batch is smaller than batch size', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createGeminiBatchEmbeddingResponse([[0.1], [0.2], [0.3]]));
      vi.stubGlobal('fetch', mockFetch);

      // Create backend with batch size of 100 (larger than input)
      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key', batchSize: 100 });
      await backend.embedBatch(['text1', 'text2', 'text3']);

      // Should make only 1 request
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDimensions', () => {
    it('should return 768 for default configuration', () => {
      const backend = new GeminiBackend({ backend: 'gemini', apiKey: 'test-key' });
      expect(backend.getDimensions()).toBe(768);
    });
  });
});
