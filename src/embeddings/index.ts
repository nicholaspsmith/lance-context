import type {
  EmbeddingBackend,
  EmbeddingConfig,
  CreateBackendResult,
  BackendFallbackInfo,
} from './types.js';
import { OllamaBackend, DEFAULT_OLLAMA_MODEL } from './ollama.js';
import { GeminiBackend } from './gemini.js';

export * from './types.js';
export { chunkArray } from './types.js';
export { OllamaBackend, DEFAULT_OLLAMA_MODEL } from './ollama.js';
export { GeminiBackend } from './gemini.js';
export { RateLimiter, type RateLimiterConfig } from './rate-limiter.js';

/**
 * Create an embedding backend based on configuration and available credentials.
 *
 * Tries backends in priority order:
 * 1. Gemini (if GEMINI_API_KEY environment variable is set) - free tier, recommended
 * 2. Ollama (local fallback, requires Ollama to be running)
 *
 * If an explicitly configured backend fails to initialize (e.g., rate limited),
 * automatically falls back to Ollama and returns fallback info.
 *
 * @param config - Optional configuration to customize the backend
 * @returns A promise resolving to the backend and optional fallback info
 * @throws Error if no backend is available (no API keys and Ollama not running)
 *
 * @example
 * ```typescript
 * // Use automatic backend selection
 * const { backend } = await createEmbeddingBackend();
 *
 * // Force a specific backend (will fallback to Ollama on failure)
 * const { backend, fallback } = await createEmbeddingBackend({ backend: 'gemini' });
 * if (fallback) {
 *   console.warn(`Fell back to ${fallback.fallbackBackend}: ${fallback.reason}`);
 * }
 * ```
 */
export async function createEmbeddingBackend(
  config?: Partial<EmbeddingConfig>
): Promise<CreateBackendResult> {
  const geminiKey = config?.apiKey || process.env.GEMINI_API_KEY;
  const ollamaUrl = config?.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
  const ollamaModel = config?.model || DEFAULT_OLLAMA_MODEL;
  const ollamaBatchSize = config?.batchSize;
  const ollamaConcurrency = config?.concurrency;

  // Helper to create Ollama backend
  const createOllamaBackend = () =>
    new OllamaBackend({
      backend: 'ollama',
      baseUrl: ollamaUrl,
      model: ollamaModel,
      batchSize: ollamaBatchSize,
      concurrency: ollamaConcurrency,
    });

  // Helper to try Ollama as fallback
  const tryOllamaFallback = async (
    originalBackend: string,
    reason: string
  ): Promise<CreateBackendResult> => {
    console.error(`[glancey] WARN: ${originalBackend} backend failed: ${reason}`);
    console.error(`[glancey] WARN: Falling back to Ollama...`);

    try {
      const fallbackBackend = createOllamaBackend();
      await fallbackBackend.initialize();
      console.error(`[glancey] Using ollama embedding backend (fallback from ${originalBackend})`);

      const fallbackInfo: BackendFallbackInfo = {
        occurred: true,
        originalBackend,
        fallbackBackend: 'ollama',
        reason,
      };

      return { backend: fallbackBackend, fallback: fallbackInfo };
    } catch (ollamaError) {
      throw new Error(
        `Configured ${originalBackend} backend failed (${reason}) and Ollama fallback also failed: ${ollamaError}`
      );
    }
  };

  // If explicit backend is specified, try it first with fallback to Ollama
  if (config?.backend && config.backend !== 'local') {
    if (config.backend === 'gemini') {
      if (!geminiKey) {
        throw new Error(
          'Gemini backend requested but no API key available. Get a free key at https://aistudio.google.com/app/apikey and set GEMINI_API_KEY.'
        );
      }
      try {
        const backend = new GeminiBackend({ backend: 'gemini', apiKey: geminiKey, ...config });
        await backend.initialize();
        console.error(`[glancey] Using gemini embedding backend (explicitly configured)`);
        return { backend };
      } catch (error) {
        return tryOllamaFallback('gemini', String(error));
      }
    } else if (config.backend === 'ollama') {
      // Ollama explicitly configured - no fallback available
      const backend = createOllamaBackend();
      await backend.initialize();
      console.error(`[glancey] Using ollama embedding backend (explicitly configured)`);
      return { backend };
    }
  }

  // Auto-select: try backends in priority order
  const backends: Array<{ name: string; create: () => EmbeddingBackend }> = [];

  // Priority 1: Gemini (if API key available) - free tier, recommended
  if (geminiKey) {
    backends.push({
      name: 'gemini',
      create: () => new GeminiBackend({ backend: 'gemini', apiKey: geminiKey, ...config }),
    });
  }

  // Priority 2: Ollama (local fallback)
  backends.push({
    name: 'ollama',
    create: createOllamaBackend,
  });

  // Try each backend until one works
  for (const { name, create } of backends) {
    try {
      const backend = create();
      await backend.initialize();
      console.error(`[glancey] Using ${name} embedding backend`);
      return { backend };
    } catch (error) {
      console.error(`[glancey] Backend ${name} failed: ${error}`);
    }
  }

  throw new Error('No embedding backend available. Set GEMINI_API_KEY (free) or install Ollama.');
}
