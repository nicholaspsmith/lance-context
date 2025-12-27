/**
 * Embedding backend interface
 */
export interface EmbeddingBackend {
    name: string;
    initialize(): Promise<void>;
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    getDimensions(): number;
}
export interface EmbeddingConfig {
    backend: 'jina' | 'local' | 'ollama';
    model?: string;
    apiKey?: string;
    baseUrl?: string;
}
export declare const DEFAULT_CONFIG: EmbeddingConfig;
//# sourceMappingURL=types.d.ts.map