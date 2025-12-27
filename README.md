# lance-context

An MCP plugin that adds semantic code search to Claude Code and other AI coding agents, giving them deep context from your entire codebase.

## Features

- **Semantic Code Search**: Natural language queries locate relevant code across your entire codebase
- **Multiple Embedding Backends**: Jina v3 API, local sentence-transformers, or Ollama
- **LanceDB Vector Storage**: Fast, efficient vector search with hybrid BM25 + dense matching
- **MCP Compatible**: Works with Claude Code, Cursor, and other MCP-compatible tools

## Installation

### For Claude Code

```bash
claude mcp add lance-context -- npx lance-context
```

Or with a specific project path:

```bash
claude mcp add lance-context -- npx lance-context --project /path/to/your/project
```

### Manual Installation

```bash
npm install -g lance-context
```

## Configuration

### Embedding Backends

lance-context automatically selects the best available backend:

1. **Jina v3** (highest quality, free tier available)
   ```bash
   export JINA_API_KEY=your-api-key
   ```

2. **Ollama** (local, privacy-preserving)
   ```bash
   # Make sure Ollama is running with nomic-embed-text
   ollama pull nomic-embed-text
   ```

## Usage

Once installed, you'll have access to these tools:

### `index_codebase`

Index your codebase for semantic search:

```
> index_codebase
Indexed 150 files, created 800 chunks.
```

With custom patterns:

```
> index_codebase(patterns: ["**/*.py"], excludePatterns: ["**/tests/**"])
```

### `search_code`

Search using natural language:

```
> search_code(query: "authentication middleware")

## Result 1: src/middleware/auth.ts:1-50
...
```

### `get_index_status`

Check index status:

```
> get_index_status
{
  "indexed": true,
  "fileCount": 150,
  "chunkCount": 800,
  "lastUpdated": "2024-12-27T12:00:00Z"
}
```

### `clear_index`

Clear the index:

```
> clear_index
Index cleared.
```

## How It Works

1. **Indexing**: Code files are chunked into ~100-line segments with overlap
2. **Embedding**: Each chunk is converted to a vector using your chosen backend
3. **Storage**: Vectors are stored in LanceDB (`.lance-context/` directory)
4. **Search**: Natural language queries are embedded and matched against stored vectors

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JINA_API_KEY` | Jina AI API key for embeddings | - |
| `OLLAMA_URL` | Ollama server URL | `http://localhost:11434` |
| `LANCE_CONTEXT_PROJECT` | Project path to index | Current directory |

## Supported Languages

TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, PHP, C/C++, C#, Swift, Kotlin, and more.

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

## Related Projects

- [claude-context](https://github.com/zilliztech/claude-context) - Similar tool using Zilliz Cloud
- [Serena](https://github.com/oraios/serena) - Symbol-level code navigation

## Credits

Built with:
- [LanceDB](https://lancedb.github.io/lancedb/) - Vector database
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - Model Context Protocol
- [Jina AI](https://jina.ai/) - Embedding API
