/**
 * Embedding backend interface that all embedding providers must implement.
 * Supports both single text and batch embedding operations.
 */
export interface EmbeddingBackend {
  /** Display name of the embedding backend (e.g., 'jina', 'ollama') */
  name: string;

  /**
   * Initialize the backend, validating credentials and connectivity.
   * @throws Error if initialization fails (e.g., invalid API key, server unreachable)
   */
  initialize(): Promise<void>;

  /**
   * Generate an embedding vector for a single text.
   * @param text - The text to embed
   * @returns A promise resolving to the embedding vector (array of numbers)
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embedding vectors for multiple texts in a single batch.
   * More efficient than calling embed() multiple times.
   * @param texts - Array of texts to embed
   * @returns A promise resolving to an array of embedding vectors
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Get the dimensionality of the embedding vectors produced by this backend.
   * @returns The number of dimensions in the embedding vectors
   */
  getDimensions(): number;
}

/**
 * Configuration options for embedding backends.
 */
export interface EmbeddingConfig {
  /** Which embedding backend to use */
  backend: 'jina' | 'ollama' | 'local';

  /** Model name/identifier (backend-specific) */
  model?: string;

  /** API key for cloud-based backends (Jina) */
  apiKey?: string;

  /** Base URL for the embedding API (useful for Ollama or custom endpoints) */
  baseUrl?: string;
}

/**
 * Default embedding configuration using local Ollama with nomic-embed-text model.
 */
export const DEFAULT_CONFIG: EmbeddingConfig = {
  backend: 'ollama',
  model: 'nomic-embed-text',
  baseUrl: 'http://localhost:11434',
};
