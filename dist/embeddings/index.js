import { OllamaBackend } from './ollama.js';
import { JinaBackend } from './jina.js';
export * from './types.js';
export { OllamaBackend } from './ollama.js';
export { JinaBackend } from './jina.js';
/**
 * Create an embedding backend based on configuration
 * Falls back through backends: jina -> local -> ollama
 */
export async function createEmbeddingBackend(config) {
    const backends = [];
    // Priority 1: Jina (if API key available)
    const jinaKey = config?.apiKey || process.env.JINA_API_KEY;
    if (jinaKey) {
        backends.push(() => new JinaBackend({ backend: 'jina', apiKey: jinaKey, ...config }));
    }
    // Priority 2: Ollama (local fallback)
    backends.push(() => new OllamaBackend({
        backend: 'ollama',
        baseUrl: config?.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434',
        model: config?.model || 'nomic-embed-text',
    }));
    // Try each backend until one works
    for (const createBackend of backends) {
        try {
            const backend = createBackend();
            await backend.initialize();
            console.error(`[lance-context] Using ${backend.name} embedding backend`);
            return backend;
        }
        catch (error) {
            console.error(`[lance-context] Backend failed: ${error}`);
        }
    }
    throw new Error('No embedding backend available. Install Ollama or set JINA_API_KEY.');
}
//# sourceMappingURL=index.js.map