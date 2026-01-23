<p align="center">
  <img src="logo.svg" alt="lance-context logo" width="150" height="150">
</p>

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

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server (index.ts)                    │
│         Exposes tools: index_codebase, search_code          │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                  CodeIndexer (indexer.ts)                   │
│  - AST-aware chunking for supported languages               │
│  - Incremental indexing (only re-index changed files)       │
│  - Hybrid search (semantic + keyword scoring)               │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│              Embedding Backends (embeddings/)               │
│            Jina v3  │  Ollama (local)                       │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                   LanceDB Vector Store                      │
│           Stored in .lance-context/ directory               │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Embedding Backends

lance-context automatically selects the best available backend (in priority order):

1. **Jina v3** (if `JINA_API_KEY` is set, free tier available)
   ```bash
   export JINA_API_KEY=jina_...
   ```

2. **Ollama** (local fallback, privacy-preserving)
   ```bash
   # Make sure Ollama is running with nomic-embed-text
   ollama pull nomic-embed-text
   ```

### Project Configuration

Create a `.lance-context.json` file in your project root to customize indexing:

```json
{
  "patterns": ["**/*.ts", "**/*.js", "**/*.py"],
  "excludePatterns": ["**/node_modules/**", "**/dist/**"],
  "chunking": {
    "maxLines": 100,
    "overlap": 20
  },
  "search": {
    "semanticWeight": 0.7,
    "keywordWeight": 0.3
  },
  "instructions": "Project-specific instructions for AI agents working with this codebase."
}
```

#### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `patterns` | Glob patterns for files to index | Common code file extensions |
| `excludePatterns` | Glob patterns for files to exclude | node_modules, dist, .git, etc. |
| `chunking.maxLines` | Maximum lines per chunk | 100 |
| `chunking.overlap` | Overlapping lines between chunks | 20 |
| `search.semanticWeight` | Weight for semantic similarity (0-1) | 0.7 |
| `search.keywordWeight` | Weight for keyword matching (0-1) | 0.3 |
| `instructions` | Project-specific instructions for AI agents | - |

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

### `get_project_instructions`

Get project-specific instructions from the config:

```
> get_project_instructions
Use semantic search for exploring this codebase. Always run tests before committing.
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

## Troubleshooting

### "No embedding backend available"

This error means no API keys are set and Ollama is not running/accessible.

**Solutions:**
1. Set an API key: `export OPENAI_API_KEY=sk-...` or `export JINA_API_KEY=jina_...`
2. Or start Ollama: `ollama serve` and ensure `nomic-embed-text` model is pulled

### "Embedding dimension mismatch"

This occurs when switching between embedding backends (e.g., from Jina to OpenAI). Each backend produces different vector dimensions.

**Solution:** Force a full reindex:
```
> index_codebase(forceReindex: true)
```

### Slow Indexing

Large codebases may take time to index initially.

**Tips:**
1. Use `excludePatterns` to skip unnecessary directories (tests, generated code)
2. Ollama is faster for local use but requires more resources
3. Subsequent runs use incremental indexing (only changed files)

### Index Corruption

If you encounter strange search results or errors:

**Solution:** Clear and rebuild the index:
```
> clear_index
> index_codebase
```

Or manually delete the `.lance-context/` directory and re-index.

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting PRs.

## Related Projects

- [claude-context](https://github.com/zilliztech/claude-context) - Similar tool using Zilliz Cloud
- [Serena](https://github.com/oraios/serena) - Symbol-level code navigation

## Credits

Built with:
- [LanceDB](https://lancedb.github.io/lancedb/) - Vector database
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - Model Context Protocol
- [Jina AI](https://jina.ai/) - Embedding API
