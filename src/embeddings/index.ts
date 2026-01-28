import type { EmbeddingBackend, EmbeddingConfig } from './types.js';
import { OllamaBackend, DEFAULT_OLLAMA_MODEL } from './ollama.js';
import { JinaBackend } from './jina.js';

export * from './types.js';
export { chunkArray } from './types.js';
export { OllamaBackend, DEFAULT_OLLAMA_MODEL } from './ollama.js';
export { JinaBackend, DEFAULT_JINA_API_KEY } from './jina.js';
export { RateLimiter, type RateLimiterConfig } from './rate-limiter.js';

/**
 * Create an embedding backend based on configuration and available credentials.
 *
 * Tries backends in priority order:
 * 1. Jina (works out of the box with built-in community API key)
 * 2. Ollama (local alternative, requires Ollama to be installed)
 *
 * @param config - Optional configuration to customize the backend
 * @returns A promise resolving to an initialized embedding backend
 * @throws Error if no backend is available
 *
 * @example
 * ```typescript
 * // Use automatic backend selection (defaults to Jina)
 * const backend = await createEmbeddingBackend();
 *
 * // Use your own Jina API key
 * const backend = await createEmbeddingBackend({ apiKey: 'your-key' });
 *
 * // Force Ollama backend
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
      // Jina works with or without user-provided key (has built-in default)
      const backend = new JinaBackend({ backend: 'jina', apiKey: jinaKey, ...config });
      await backend.initialize();
      const keyType = jinaKey ? 'custom key' : 'community key';
      console.error(`[lance-context] Using jina embedding backend (${keyType})`);
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
  const backends: Array<{ create: () => EmbeddingBackend; name: string }> = [];

  // Priority 1: Jina (always available - has built-in key)
  backends.push({
    create: () => new JinaBackend({ backend: 'jina', apiKey: jinaKey, ...config }),
    name: jinaKey ? 'jina (custom key)' : 'jina (community key)',
  });

  // Priority 2: Ollama (local alternative)
  backends.push({
    create: () =>
      new OllamaBackend({
        backend: 'ollama',
        baseUrl: ollamaUrl,
        model: ollamaModel,
        batchSize: ollamaBatchSize,
        concurrency: ollamaConcurrency,
      }),
    name: 'ollama',
  });

  // Try each backend until one works
  for (const { create, name } of backends) {
    try {
      const backend = create();
      await backend.initialize();
      console.error(`[lance-context] Using ${name} embedding backend`);
      return backend;
    } catch (error) {
      console.error(`[lance-context] Backend ${name} failed: ${error}`);
    }
  }

  throw new Error(
    'No embedding backend available. Jina API may be unreachable, and Ollama is not running.'
  );
}
