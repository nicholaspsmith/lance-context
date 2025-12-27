/**
 * Ollama embedding backend
 * Uses local Ollama server for embeddings
 */
export class OllamaBackend {
    name = 'ollama';
    model;
    baseUrl;
    dimensions = 768; // nomic-embed-text default
    constructor(config) {
        this.model = config.model || 'nomic-embed-text';
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
    }
    async initialize() {
        // Test connection
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`Ollama server returned ${response.status}`);
            }
        }
        catch (error) {
            throw new Error(`Failed to connect to Ollama at ${this.baseUrl}: ${error}`);
        }
    }
    async embed(text) {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                prompt: text,
            }),
        });
        if (!response.ok) {
            throw new Error(`Ollama embedding failed: ${response.status}`);
        }
        const data = (await response.json());
        return data.embedding;
    }
    async embedBatch(texts) {
        // Ollama doesn't have native batch, so we parallelize
        const embeddings = await Promise.all(texts.map((t) => this.embed(t)));
        return embeddings;
    }
    getDimensions() {
        return this.dimensions;
    }
}
//# sourceMappingURL=ollama.js.map