import type { EmbeddingBackend, EmbeddingConfig } from './types.js';
/**
 * Ollama embedding backend
 * Uses local Ollama server for embeddings
 */
export declare class OllamaBackend implements EmbeddingBackend {
    name: string;
    private model;
    private baseUrl;
    private dimensions;
    constructor(config: EmbeddingConfig);
    initialize(): Promise<void>;
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    getDimensions(): number;
}
//# sourceMappingURL=ollama.d.ts.map