import type { EmbeddingBackend, EmbeddingConfig } from './types.js';
/**
 * Jina AI embedding backend
 * Uses Jina's free API tier for high-quality embeddings
 */
export declare class JinaBackend implements EmbeddingBackend {
    name: string;
    private model;
    private apiKey;
    private baseUrl;
    private dimensions;
    constructor(config: EmbeddingConfig);
    initialize(): Promise<void>;
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    getDimensions(): number;
}
//# sourceMappingURL=jina.d.ts.map