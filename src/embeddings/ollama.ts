import type { EmbeddingBackend, EmbeddingConfig } from './types.js';
import { chunkArray } from './types.js';
import { fetchWithRetry } from './retry.js';

/** Default batch size for Ollama (texts per batch request) */
const DEFAULT_BATCH_SIZE = 100;

/** Default concurrency for Ollama (parallel batch requests) */
const DEFAULT_CONCURRENCY = 4;

/** Default Ollama model optimized for code search */
export const DEFAULT_OLLAMA_MODEL = 'qwen3-embedding:0.6b';

/** Model dimension defaults (used when dimensions can't be auto-detected) */
const MODEL_DIMENSIONS: Record<string, number> = {
  'qwen3-embedding:0.6b': 1024,
  'qwen3-embedding:4b': 1024,
  'qwen3-embedding:8b': 1024,
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
};

/**
 * Ollama embedding backend
 * Uses local Ollama server for embeddings
 */
export class OllamaBackend implements EmbeddingBackend {
  name = 'ollama';
  private model: string;
  private baseUrl: string;
  private dimensions: number;
  private batchSize: number;
  private concurrency: number;

  constructor(config: EmbeddingConfig) {
    this.model = config.model || DEFAULT_OLLAMA_MODEL;
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.concurrency = config.concurrency ?? DEFAULT_CONCURRENCY;
    // Set dimensions based on known models, default to 1024 for unknown models
    this.dimensions = MODEL_DIMENSIONS[this.model] ?? 1024;
  }

  async initialize(): Promise<void> {
    // Test connection and check if model is available
    try {
      const response = await fetchWithRetry(`${this.baseUrl}/api/tags`, {});
      if (!response.ok) {
        throw new Error(`Ollama server returned ${response.status}`);
      }

      // Check if our model is available
      const data = (await response.json()) as { models?: Array<{ name: string }> };
      const availableModels = data.models?.map((m) => m.name) || [];
      const modelAvailable = availableModels.some(
        (name) => name === this.model || name.startsWith(`${this.model}:`)
      );

      if (!modelAvailable) {
        throw new Error(
          `Model '${this.model}' not found in Ollama.\n\n` +
            `To install it, run:\n` +
            `  ollama pull ${this.model}\n\n` +
            `Available models: ${availableModels.length > 0 ? availableModels.join(', ') : 'none'}\n\n` +
            `For best code search results, we recommend:\n` +
            `  ollama pull ${DEFAULT_OLLAMA_MODEL}`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Model')) {
        throw error; // Re-throw model not found errors as-is
      }
      throw new Error(
        `Failed to connect to Ollama at ${this.baseUrl}.\n\n` +
          `Make sure Ollama is installed and running:\n` +
          `  1. Install Ollama from https://ollama.com\n` +
          `  2. Start Ollama (it runs in the background)\n` +
          `  3. Pull the embedding model: ollama pull ${DEFAULT_OLLAMA_MODEL}\n\n` +
          `Original error: ${error}`
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Use Ollama's batch API (/api/embed) which accepts an array of texts
    // Process multiple batches in parallel for faster indexing
    const batches = chunkArray(texts, this.batchSize);
    const results: number[][] = new Array(texts.length);

    // Process batches in parallel groups controlled by concurrency
    for (let i = 0; i < batches.length; i += this.concurrency) {
      const batchGroup = batches.slice(i, i + this.concurrency);
      const batchPromises = batchGroup.map(async (batch, groupIndex) => {
        const response = await fetchWithRetry(`${this.baseUrl}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            input: batch,
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama embedding failed: ${response.status}`);
        }

        const data = (await response.json()) as { embeddings: number[][] };
        return { batchIndex: i + groupIndex, embeddings: data.embeddings };
      });

      const batchResults = await Promise.all(batchPromises);

      // Place results in correct positions
      for (const { batchIndex, embeddings } of batchResults) {
        const startIndex = batchIndex * this.batchSize;
        for (let j = 0; j < embeddings.length; j++) {
          results[startIndex + j] = embeddings[j];
        }
      }
    }

    return results;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}
