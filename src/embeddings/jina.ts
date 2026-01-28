import type { EmbeddingBackend, EmbeddingConfig } from './types.js';
import { chunkArray } from './types.js';
import { fetchWithRetry } from './retry.js';
import { RateLimiter } from './rate-limiter.js';

/** Default batch size for Jina API requests */
const DEFAULT_BATCH_SIZE = 100;

/**
 * Jina AI embedding backend
 * Uses Jina's API for high-quality embeddings
 * Includes client-side rate limiting to prevent API throttling
 */
export class JinaBackend implements EmbeddingBackend {
  name = 'jina';
  private model: string;
  private apiKey: string;
  private baseUrl = 'https://api.jina.ai/v1/embeddings';
  private dimensions = 1024; // jina-embeddings-v3 default
  private rateLimiter: RateLimiter;
  private batchSize: number;

  constructor(config: EmbeddingConfig) {
    this.model = config.model || 'jina-embeddings-v3';
    if (!config.apiKey) {
      throw new Error(
        'Jina API key is required. Get a free key at https://jina.ai/embeddings/ and set JINA_API_KEY environment variable.'
      );
    }
    this.apiKey = config.apiKey;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;

    // Initialize rate limiter with configurable or default values
    this.rateLimiter = new RateLimiter({
      requestsPerSecond: config.rateLimitRps ?? 5,
      burstCapacity: config.rateLimitBurst ?? 10,
    });
  }

  async initialize(): Promise<void> {
    // Test API key with a small request
    try {
      await this.embed('test');
    } catch (error) {
      throw new Error(`Failed to initialize Jina backend: ${error}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    // Acquire a rate limit token before making the request
    await this.rateLimiter.acquire();

    const response = await fetchWithRetry(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: [text],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jina API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
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
   * Embed a batch of texts in a single API request (no chunking).
   * Used internally by embedBatch.
   */
  private async embedBatchDirect(texts: string[]): Promise<number[][]> {
    // Acquire a rate limit token before making the request
    // Note: batch requests count as one API call
    await this.rateLimiter.acquire();

    const response = await fetchWithRetry(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jina API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}
