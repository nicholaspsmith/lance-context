import type { EmbeddingBackend, EmbeddingConfig } from './types.js';
import { chunkArray } from './types.js';
import { fetchWithRetry } from './retry.js';
import { RateLimiter } from './rate-limiter.js';

/** Default batch size for Gemini API requests (max 100 per batch request) */
const DEFAULT_BATCH_SIZE = 100;

/** Default model for Gemini embeddings */
const DEFAULT_GEMINI_MODEL = 'gemini-embedding-001';

/** Default dimensions - using 768 to match other backends for compatibility */
const DEFAULT_DIMENSIONS = 768;

/**
 * Google Gemini embedding backend
 * Uses Google's Generative AI API for embeddings
 * Free tier: 1500 RPM, no credit card required
 * Get API key at: https://aistudio.google.com/app/apikey
 */
export class GeminiBackend implements EmbeddingBackend {
  name = 'gemini';
  private model: string;
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private dimensions: number;
  private rateLimiter: RateLimiter;
  private batchSize: number;

  constructor(config: EmbeddingConfig) {
    this.model = config.model || DEFAULT_GEMINI_MODEL;
    if (!config.apiKey) {
      throw new Error(
        'Gemini API key is required. Get a free key at https://aistudio.google.com/app/apikey and set GEMINI_API_KEY environment variable.'
      );
    }
    this.apiKey = config.apiKey;
    this.dimensions = DEFAULT_DIMENSIONS;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;

    // Initialize rate limiter - Gemini free tier is 1500 RPM = 25 RPS
    this.rateLimiter = new RateLimiter({
      requestsPerSecond: config.rateLimitRps ?? 20,
      burstCapacity: config.rateLimitBurst ?? 30,
    });
  }

  async initialize(): Promise<void> {
    // Test API key with a small request
    try {
      await this.embed('test');
    } catch (error) {
      throw new Error(`Failed to initialize Gemini backend: ${error}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    // Acquire a rate limit token before making the request
    await this.rateLimiter.acquire();

    const url = `${this.baseUrl}/models/${this.model}:embedContent`;
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        model: `models/${this.model}`,
        content: {
          parts: [{ text }],
        },
        outputDimensionality: this.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      embedding: { values: number[] };
    };
    return data.embedding.values;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // For small batches, process directly
    if (texts.length <= this.batchSize) {
      return this.embedBatchDirect(texts);
    }

    // For large batches, chunk and process sequentially
    const chunks = chunkArray(texts, this.batchSize);
    const results: number[][] = [];

    for (const chunk of chunks) {
      const chunkResults = await this.embedBatchDirect(chunk);
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Embed a batch of texts using Gemini's batchEmbedContents endpoint.
   * Used internally by embedBatch.
   */
  private async embedBatchDirect(texts: string[]): Promise<number[][]> {
    // Acquire a rate limit token before making the request
    await this.rateLimiter.acquire();

    const url = `${this.baseUrl}/models/${this.model}:batchEmbedContents`;
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${this.model}`,
          content: {
            parts: [{ text }],
          },
          outputDimensionality: this.dimensions,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      embeddings: Array<{ values: number[] }>;
    };
    return data.embeddings.map((e) => e.values);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}
