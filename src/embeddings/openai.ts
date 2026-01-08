import type { EmbeddingBackend, EmbeddingConfig } from './types.js';

const OPENAI_EMBEDDING_MODELS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

const DEFAULT_MODEL = 'text-embedding-3-small';

/**
 * OpenAI embedding backend using the OpenAI API
 */
export class OpenAIBackend implements EmbeddingBackend {
  name = 'openai';
  private apiKey: string;
  private model: string;
  private dimensions: number;
  private baseUrl: string;

  constructor(config: Partial<EmbeddingConfig> & { apiKey: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODEL;
    this.dimensions = OPENAI_EMBEDDING_MODELS[this.model] || 1536;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  async initialize(): Promise<void> {
    // Test the API key with a simple request
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to maintain order
    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }

  getDimensions(): number {
    return this.dimensions;
  }
}
