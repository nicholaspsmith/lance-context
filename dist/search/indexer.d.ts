import type { EmbeddingBackend } from '../embeddings/index.js';
export interface CodeChunk {
    id: string;
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    language: string;
    embedding?: number[];
}
export interface IndexStatus {
    indexed: boolean;
    fileCount: number;
    chunkCount: number;
    lastUpdated: string | null;
    indexPath: string;
}
/**
 * Code indexer using LanceDB for vector storage
 */
export declare class CodeIndexer {
    private db;
    private table;
    private embeddingBackend;
    private indexPath;
    private projectPath;
    constructor(projectPath: string, embeddingBackend: EmbeddingBackend);
    initialize(): Promise<void>;
    getStatus(): Promise<IndexStatus>;
    indexCodebase(patterns?: string[], excludePatterns?: string[]): Promise<{
        filesIndexed: number;
        chunksCreated: number;
    }>;
    private chunkFile;
    private getLanguage;
    search(query: string, limit?: number): Promise<CodeChunk[]>;
    clearIndex(): Promise<void>;
}
//# sourceMappingURL=indexer.d.ts.map