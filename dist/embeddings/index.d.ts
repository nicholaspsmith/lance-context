import type { EmbeddingBackend, EmbeddingConfig } from './types.js';
export * from './types.js';
export { OllamaBackend } from './ollama.js';
export { JinaBackend } from './jina.js';
/**
 * Create an embedding backend based on configuration
 * Falls back through backends: jina -> local -> ollama
 */
export declare function createEmbeddingBackend(config?: Partial<EmbeddingConfig>): Promise<EmbeddingBackend>;
//# sourceMappingURL=index.d.ts.map