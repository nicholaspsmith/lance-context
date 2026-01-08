import type { EmbeddingBackend, EmbeddingConfig } from './types.js';
import { OllamaBackend } from './ollama.js';
import { JinaBackend } from './jina.js';
import { OpenAIBackend } from './openai.js';

export * from './types.js';
export { OllamaBackend } from './ollama.js';
export { JinaBackend } from './jina.js';
export { OpenAIBackend } from './openai.js';

/**
 * Create an embedding backend based on configuration
 * Falls back through backends: openai -> jina -> ollama
 */
export async function createEmbeddingBackend(
  config?: Partial<EmbeddingConfig>
): Promise<EmbeddingBackend> {
  const backends: Array<() => EmbeddingBackend> = [];

  // Priority 1: OpenAI (if API key available)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    backends.push(
      () =>
        new OpenAIBackend({
          backend: 'openai',
          apiKey: openaiKey,
          model: config?.model || 'text-embedding-3-small',
          baseUrl: config?.baseUrl,
        })
    );
  }

  // Priority 2: Jina (if API key available)
  const jinaKey = config?.apiKey || process.env.JINA_API_KEY;
  if (jinaKey) {
    backends.push(() => new JinaBackend({ backend: 'jina', apiKey: jinaKey, ...config }));
  }

  // Priority 3: Ollama (local fallback)
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

  throw new Error(
    'No embedding backend available. Set OPENAI_API_KEY, JINA_API_KEY, or install Ollama.'
  );
}
