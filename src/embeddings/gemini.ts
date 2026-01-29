import type { EmbeddingBackend, EmbeddingConfig } from './types.js';
import { chunkArray } from './types.js';
import { fetchWithRetry } from './retry.js';
import { RateLimiter } from './rate-limiter.js';
import { broadcastLog, updateSubProgress } from '../dashboard/events.js';

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

    // For large batches, chunk and process sequentially with progress logging
    const chunks = chunkArray(texts, this.batchSize);
    const results: number[][] = [];
    const startTime = Date.now();

    const initMsg = `Gemini: embedding ${texts.length} texts in ${chunks.length} batches (${this.batchSize} texts/batch)`;
    console.error(`[lance-context] ${initMsg}`);
    broadcastLog('info', initMsg);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const batchNum = i + 1;
      const batchStart = Date.now();
      const textsProcessedBefore = i * this.batchSize;

      // Update progress bar before starting batch
      updateSubProgress(
        textsProcessedBefore,
        texts.length,
        `Gemini batch ${batchNum}/${chunks.length}: embedding ${chunk.length} texts...`
      );

      const chunkResults = await this.embedBatchDirect(chunk);
      results.push(...chunkResults);

      const batchElapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
      const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const textsProcessed = Math.min((i + 1) * this.batchSize, texts.length);
      const progressMsg = `Gemini batch ${batchNum}/${chunks.length}: done in ${batchElapsed}s (${textsProcessed}/${texts.length} texts, ${totalElapsed}s total)`;

      console.error(`[lance-context] ${progressMsg}`);
      broadcastLog('info', progressMsg);

      // Update progress bar after batch completes
      updateSubProgress(textsProcessed, texts.length, progressMsg);
    }

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const completeMsg = `Gemini: completed embedding ${texts.length} texts in ${totalElapsed}s`;
    console.error(`[lance-context] ${completeMsg}`);
    broadcastLog('info', completeMsg);

    return results;
  }

  /**
   * Embed a batch of texts using Gemini's batchEmbedContents endpoint.
   * Used internally by embedBatch.
   */
  private async embedBatchDirect(texts: string[]): Promise<number[][]> {
    // Acquire a rate limit token before making the request
    const acquireMsg = 'Gemini: acquiring rate limit token...';
    console.error(`[lance-context] ${acquireMsg}`);
    broadcastLog('info', acquireMsg);

    await this.rateLimiter.acquire();

    const acquiredMsg = 'Gemini: rate limit token acquired';
    console.error(`[lance-context] ${acquiredMsg}`);
    broadcastLog('info', acquiredMsg);

    const url = `${this.baseUrl}/models/${this.model}:batchEmbedContents`;
    const requestBody = JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${this.model}`,
        content: {
          parts: [{ text }],
        },
        outputDimensionality: this.dimensions,
      })),
    });

    const payloadSizeKb = (requestBody.length / 1024).toFixed(1);
    const sendingMsg = `Gemini: sending batch request (${texts.length} texts, ${payloadSizeKb} KB payload)...`;
    console.error(`[lance-context] ${sendingMsg}`);
    broadcastLog('info', sendingMsg);

    const fetchStart = Date.now();
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: requestBody,
    });

    const fetchTime = ((Date.now() - fetchStart) / 1000).toFixed(1);
    const responseMsg = `Gemini: received response in ${fetchTime}s (status: ${response.status})`;
    console.error(`[lance-context] ${responseMsg}`);
    broadcastLog('info', responseMsg);

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
