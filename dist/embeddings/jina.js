/**
 * Jina AI embedding backend
 * Uses Jina's free API tier for high-quality embeddings
 */
export class JinaBackend {
    name = 'jina';
    model;
    apiKey;
    baseUrl = 'https://api.jina.ai/v1/embeddings';
    dimensions = 1024; // jina-embeddings-v3 default
    constructor(config) {
        this.model = config.model || 'jina-embeddings-v3';
        if (!config.apiKey) {
            throw new Error('Jina API key is required. Set JINA_API_KEY environment variable.');
        }
        this.apiKey = config.apiKey;
    }
    async initialize() {
        // Test API key with a small request
        try {
            await this.embed('test');
        }
        catch (error) {
            throw new Error(`Failed to initialize Jina backend: ${error}`);
        }
    }
    async embed(text) {
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                input: [text],
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Jina API error: ${response.status} - ${error}`);
        }
        const data = (await response.json());
        return data.data[0].embedding;
    }
    async embedBatch(texts) {
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                input: texts,
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Jina API error: ${response.status} - ${error}`);
        }
        const data = (await response.json());
        return data.data.map((d) => d.embedding);
    }
    getDimensions() {
        return this.dimensions;
    }
}
//# sourceMappingURL=jina.js.map