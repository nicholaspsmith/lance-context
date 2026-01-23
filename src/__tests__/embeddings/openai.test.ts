import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIBackend } from '../../embeddings/openai.js';
import { createOpenAIEmbeddingResponse, createErrorFetch, createSuccessFetch } from '../mocks/fetch.mock.js';

describe('OpenAIBackend', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should use default model text-embedding-3-small', () => {
      const backend = new OpenAIBackend({ apiKey: 'test-key' });
      expect(backend.getDimensions()).toBe(1536);
    });

    it('should support text-embedding-3-large model', () => {
      const backend = new OpenAIBackend({
        apiKey: 'test-key',
        model: 'text-embedding-3-large',
      });
      expect(backend.getDimensions()).toBe(3072);
    });

    it('should support text-embedding-ada-002 model', () => {
      const backend = new OpenAIBackend({
        apiKey: 'test-key',
        model: 'text-embedding-ada-002',
      });
      expect(backend.getDimensions()).toBe(1536);
    });

    it('should default to 1536 dimensions for unknown models', () => {
      const backend = new OpenAIBackend({
        apiKey: 'test-key',
        model: 'unknown-model',
      });
      expect(backend.getDimensions()).toBe(1536);
    });

    it('should use custom baseUrl', () => {
      const backend = new OpenAIBackend({
        apiKey: 'test-key',
        baseUrl: 'https://custom.openai.com/v1',
      });
      expect(backend.name).toBe('openai');
    });
  });

  describe('initialize', () => {
    it('should validate API key by calling /models endpoint', async () => {
      const mockFetch = createSuccessFetch({ data: [] });
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OpenAIBackend({ apiKey: 'test-key' });
      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });

    it('should throw on API error', async () => {
      const mockFetch = createErrorFetch(401, 'Unauthorized');
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OpenAIBackend({ apiKey: 'invalid-key' });
      await expect(backend.initialize()).rejects.toThrow('OpenAI API error: 401');
    });

    it('should use custom baseUrl for initialization', async () => {
      const mockFetch = createSuccessFetch({ data: [] });
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OpenAIBackend({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com/v1',
      });
      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.com/v1/models',
        expect.anything()
      );
    });
  });

  describe('embed', () => {
    it('should embed single text using embedBatch', async () => {
      const embedding = [0.1, 0.2, 0.3];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createOpenAIEmbeddingResponse([embedding])));

      const backend = new OpenAIBackend({ apiKey: 'test-key' });
      const result = await backend.embed('test text');

      expect(result).toEqual(embedding);
    });
  });

  describe('embedBatch', () => {
    it('should send correct request format', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createOpenAIEmbeddingResponse([[0.1], [0.2]])
      );
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OpenAIBackend({ apiKey: 'test-key' });
      await backend.embedBatch(['text1', 'text2']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: ['text1', 'text2'],
          }),
        })
      );
    });

    it('should parse response and return embeddings in correct order', async () => {
      // Response with shuffled indices
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { embedding: [0.2], index: 1 },
            { embedding: [0.1], index: 0 },
          ],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OpenAIBackend({ apiKey: 'test-key' });
      const result = await backend.embedBatch(['text1', 'text2']);

      // Should be sorted by index
      expect(result).toEqual([[0.1], [0.2]]);
    });

    it('should use specified model in request', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createOpenAIEmbeddingResponse([[0.1]]));
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OpenAIBackend({
        apiKey: 'test-key',
        model: 'text-embedding-3-large',
      });
      await backend.embedBatch(['text']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('text-embedding-3-large'),
        })
      );
    });

    it('should throw on API error with error message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid input',
      });
      vi.stubGlobal('fetch', mockFetch);

      const backend = new OpenAIBackend({ apiKey: 'test-key' });
      await expect(backend.embedBatch(['text'])).rejects.toThrow('OpenAI embedding error: 400 Invalid input');
    });
  });

  describe('getDimensions', () => {
    it('should return correct dimensions for each model', () => {
      const models = [
        { model: 'text-embedding-3-small', expected: 1536 },
        { model: 'text-embedding-3-large', expected: 3072 },
        { model: 'text-embedding-ada-002', expected: 1536 },
      ];

      for (const { model, expected } of models) {
        const backend = new OpenAIBackend({ apiKey: 'test-key', model });
        expect(backend.getDimensions()).toBe(expected);
      }
    });
  });
});
