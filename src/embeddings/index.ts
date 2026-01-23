import type { EmbeddingBackend, EmbeddingConfig } from './types.js';
import { OllamaBackend } from './ollama.js';
import { JinaBackend } from './jina.js';

export * from './types.js';
export { OllamaBackend } from './ollama.js';
export { JinaBackend } from './jina.js';

/**
 * Create an embedding backend based on configuration and available credentials.
 *
 * Tries backends in priority order:
 * 1. Jina (if JINA_API_KEY environment variable or config.apiKey is set)
 * 2. Ollama (local fallback, requires Ollama to be running)
 *
 * @param config - Optional configuration to customize the backend
 * @returns A promise resolving to an initialized embedding backend
 * @throws Error if no backend is available (no API keys and Ollama not running)
 *
 * @example
 * ```typescript
 * // Use automatic backend selection
 * const backend = await createEmbeddingBackend();
 *
 * // Force a specific model
 * const backend = await createEmbeddingBackend({ model: 'jina-embeddings-v3' });
 * ```
 */
export async function createEmbeddingBackend(
  config?: Partial<EmbeddingConfig>
): Promise<EmbeddingBackend> {
  const backends: Array<() => EmbeddingBackend> = [];

  // Priority 1: Jina (if API key available)
  const jinaKey = config?.apiKey || process.env.JINA_API_KEY;
  if (jinaKey) {
    backends.push(() => new JinaBackend({ backend: 'jina', apiKey: jinaKey, ...config }));
  }

  // Priority 2: Ollama (local fallback)
  backends.push(
    () =>
      new OllamaBackend({
        backend: 'ollama',
        baseUrl: config?.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434',
        model: config?.model || 'nomic-embed-text',
      })
  );

  // Try each backend until one works
  for (const createBackend of backends) {
    try {
      const backend = createBackend();
      await backend.initialize();
      console.error(`[lance-context] Using ${backend.name} embedding backend`);
      return backend;
    } catch (error) {
      console.error(`[lance-context] Backend failed: ${error}`);
    }
  }

  throw new Error('No embedding backend available. Set JINA_API_KEY or install Ollama.');
}
