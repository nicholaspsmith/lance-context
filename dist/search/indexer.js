import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs/promises';
import * as path from 'path';
const CHUNK_SIZE = 100; // lines per chunk
const CHUNK_OVERLAP = 20; // overlap between chunks
/**
 * Code indexer using LanceDB for vector storage
 */
export class CodeIndexer {
    db = null;
    table = null;
    embeddingBackend;
    indexPath;
    projectPath;
    constructor(projectPath, embeddingBackend) {
        this.projectPath = projectPath;
        this.embeddingBackend = embeddingBackend;
        this.indexPath = path.join(projectPath, '.lance-context');
    }
    async initialize() {
        this.db = await lancedb.connect(this.indexPath);
    }
    async getStatus() {
        const tableNames = await this.db?.tableNames();
        const hasTable = tableNames?.includes('code_chunks') ?? false;
        if (!hasTable) {
            return {
                indexed: false,
                fileCount: 0,
                chunkCount: 0,
                lastUpdated: null,
                indexPath: this.indexPath,
            };
        }
        this.table = await this.db.openTable('code_chunks');
        const count = await this.table.countRows();
        return {
            indexed: true,
            fileCount: 0, // Would need to query distinct files
            chunkCount: count,
            lastUpdated: new Date().toISOString(),
            indexPath: this.indexPath,
        };
    }
    async indexCodebase(patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.go', '**/*.rs'], excludePatterns = ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/build/**']) {
        const { glob } = await import('glob');
        // Find all matching files
        const files = [];
        for (const pattern of patterns) {
            const matches = await glob(pattern, {
                cwd: this.projectPath,
                ignore: excludePatterns,
                absolute: true,
            });
            files.push(...matches);
        }
        console.error(`[lance-context] Found ${files.length} files to index`);
        // Process files into chunks
        const allChunks = [];
        for (const filePath of files) {
            const chunks = await this.chunkFile(filePath);
            allChunks.push(...chunks);
        }
        console.error(`[lance-context] Created ${allChunks.length} chunks`);
        // Generate embeddings in batches
        const batchSize = 32;
        for (let i = 0; i < allChunks.length; i += batchSize) {
            const batch = allChunks.slice(i, i + batchSize);
            const texts = batch.map((c) => c.content);
            const embeddings = await this.embeddingBackend.embedBatch(texts);
            batch.forEach((chunk, idx) => {
                chunk.embedding = embeddings[idx];
            });
            console.error(`[lance-context] Embedded ${i + batch.length}/${allChunks.length} chunks`);
        }
        // Store in LanceDB
        const dimensions = this.embeddingBackend.getDimensions();
        const data = allChunks.map((chunk) => ({
            id: chunk.id,
            filePath: chunk.filePath,
            content: chunk.content,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            language: chunk.language,
            vector: chunk.embedding,
        }));
        // Drop existing table if exists
        const tableNames = await this.db.tableNames();
        if (tableNames.includes('code_chunks')) {
            await this.db.dropTable('code_chunks');
        }
        this.table = await this.db.createTable('code_chunks', data);
        return {
            filesIndexed: files.length,
            chunksCreated: allChunks.length,
        };
    }
    async chunkFile(filePath) {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const ext = path.extname(filePath).slice(1);
        const language = this.getLanguage(ext);
        const relativePath = path.relative(this.projectPath, filePath);
        const chunks = [];
        for (let i = 0; i < lines.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
            const chunkLines = lines.slice(i, i + CHUNK_SIZE);
            const chunkContent = chunkLines.join('\n');
            if (chunkContent.trim().length === 0)
                continue;
            chunks.push({
                id: `${relativePath}:${i + 1}-${i + chunkLines.length}`,
                filePath: relativePath,
                content: chunkContent,
                startLine: i + 1,
                endLine: i + chunkLines.length,
                language,
            });
        }
        return chunks;
    }
    getLanguage(ext) {
        const langMap = {
            ts: 'typescript',
            tsx: 'typescript',
            js: 'javascript',
            jsx: 'javascript',
            py: 'python',
            go: 'go',
            rs: 'rust',
            java: 'java',
            rb: 'ruby',
            php: 'php',
            c: 'c',
            cpp: 'cpp',
            h: 'c',
            hpp: 'cpp',
            cs: 'csharp',
            swift: 'swift',
            kt: 'kotlin',
            md: 'markdown',
            json: 'json',
            yaml: 'yaml',
            yml: 'yaml',
        };
        return langMap[ext] || ext;
    }
    async search(query, limit = 10) {
        if (!this.table) {
            const status = await this.getStatus();
            if (!status.indexed) {
                throw new Error('Codebase not indexed. Run index_codebase first.');
            }
        }
        const queryEmbedding = await this.embeddingBackend.embed(query);
        const results = await this.table.search(queryEmbedding).limit(limit).toArray();
        return results.map((r) => ({
            id: r.id,
            filePath: r.filePath,
            content: r.content,
            startLine: r.startLine,
            endLine: r.endLine,
            language: r.language,
        }));
    }
    async clearIndex() {
        const tableNames = await this.db.tableNames();
        if (tableNames.includes('code_chunks')) {
            await this.db.dropTable('code_chunks');
        }
        this.table = null;
    }
}
//# sourceMappingURL=indexer.js.map