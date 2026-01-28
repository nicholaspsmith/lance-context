import type { EmbeddingBackend, EmbeddingConfig } from './types.js';
import { OllamaBackend, DEFAULT_OLLAMA_MODEL } from './ollama.js';
import { JinaBackend } from './jina.js';

export * from './types.js';
export { chunkArray } from './types.js';
export { OllamaBackend, DEFAULT_OLLAMA_MODEL } from './ollama.js';
export { JinaBackend } from './jina.js';
export { RateLimiter, type RateLimiterConfig } from './rate-limiter.js';

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
 * // Force a specific backend
 * const backend = await createEmbeddingBackend({ backend: 'ollama' });
 * ```
 */
export async function createEmbeddingBackend(
  config?: Partial<EmbeddingConfig>
): Promise<EmbeddingBackend> {
  const jinaKey = config?.apiKey || process.env.JINA_API_KEY;
  const ollamaUrl = config?.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
  const ollamaModel = config?.model || DEFAULT_OLLAMA_MODEL;
  const ollamaBatchSize = config?.batchSize;
  const ollamaConcurrency = config?.concurrency;

  // If explicit backend is specified, use only that backend
  if (config?.backend && config.backend !== 'local') {
    if (config.backend === 'jina') {
      if (!jinaKey) {
        throw new Error(
          'Jina backend requested but no API key available. Set JINA_API_KEY or provide apiKey in config.'
        );
      }
      const backend = new JinaBackend({ backend: 'jina', apiKey: jinaKey, ...config });
      await backend.initialize();
      console.error(`[lance-context] Using jina embedding backend (explicitly configured)`);
      return backend;
    } else if (config.backend === 'ollama') {
      const backend = new OllamaBackend({
        backend: 'ollama',
        baseUrl: ollamaUrl,
        model: ollamaModel,
        batchSize: ollamaBatchSize,
        concurrency: ollamaConcurrency,
      });
      await backend.initialize();
      console.error(`[lance-context] Using ollama embedding backend (explicitly configured)`);
      return backend;
    }
  }

  // Auto-select: try backends in priority order
  const backends: Array<() => EmbeddingBackend> = [];

  // Priority 1: Jina (if API key available)
  if (jinaKey) {
    backends.push(() => new JinaBackend({ backend: 'jina', apiKey: jinaKey, ...config }));
  }

  // Priority 2: Ollama (local fallback)
  backends.push(
    () =>
      new OllamaBackend({
        backend: 'ollama',
        baseUrl: ollamaUrl,
        model: ollamaModel,
        batchSize: ollamaBatchSize,
        concurrency: ollamaConcurrency,
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
