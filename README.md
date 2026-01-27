<p align="center">
  <img src="logo.svg" alt="lance-context logo" width="150" height="150">
</p>

<p align="center">
  <a href="https://github.com/nicholaspsmith/lance-context/actions/workflows/ci.yml"><img src="https://github.com/nicholaspsmith/lance-context/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/lance-context"><img src="https://img.shields.io/npm/v/lance-context.svg" alt="npm version"></a>
  <a href="https://github.com/nicholaspsmith/lance-context/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg" alt="Node.js version">
</p>

# lance-context

An MCP plugin that adds semantic code search to Claude Code and other AI coding agents, giving them deep context from your entire codebase.

## Features

- **Semantic Code Search**: Natural language queries locate relevant code across your entire codebase
- **Multiple Embedding Backends**: Jina v3 API or Ollama (local)
- **LanceDB Vector Storage**: Fast, efficient vector search with hybrid BM25 + dense matching
- **MCP Compatible**: Works with Claude Code, Cursor, and other MCP-compatible tools
- **Web Dashboard**: Real-time monitoring of index status, configuration, and usage statistics
- **Beads Integration**: Shows issue tracker data if your project uses [beads](https://github.com/steveyegge/beads)

## Installation

### Quick Install (Recommended)

Add lance-context to Claude Code with automatic updates:

```bash
claude mcp add --scope user --transport stdio lance-context -- npx -y lance-context@latest
```

This ensures you always run the latest version. Restart Claude Code to start using semantic search.

### Global Install (Alternative)

For faster startup (no npm check on each run):

```bash
npm install -g lance-context
```

This automatically registers lance-context with Claude Code. Update manually with `npm update -g lance-context`.

### Manual Registration

If automatic registration didn't work, manually add to Claude Code:

```bash
claude mcp add --scope user --transport stdio lance-context -- npx -y lance-context@latest
```

### Verify Installation

In Claude Code, run `/mcp` to see lance-context in the list of MCP servers.

### Project-Level Installation

For project-specific MCP configuration, add a `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "lance-context": {
      "command": "npx",
      "args": ["-y", "lance-context@latest"]
    }
  }
}
```

### Project Configuration

Create a `.lance-context.json` file in your project root to customize indexing behavior. All options are optional - lance-context works out of the box with sensible defaults.

#### Minimal Configuration

For most projects, you only need to specify what to include:

```json
{
  "patterns": ["**/*.ts", "**/*.js"],
  "instructions": "This is a TypeScript monorepo. Use semantic search to find relevant utilities."
}
```

#### Full Configuration Example

```json
{
  "patterns": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  "excludePatterns": ["**/node_modules/**", "**/dist/**", "**/*.test.ts"],
  "embedding": {
    "backend": "jina"
  },
  "chunking": {
    "maxLines": 100,
    "overlap": 20
  },
  "search": {
    "semanticWeight": 0.7,
    "keywordWeight": 0.3
  },
  "dashboard": {
    "enabled": true,
    "port": 24300,
    "openBrowser": true
  },
  "instructions": "Project-specific instructions for AI agents working with this codebase."
}
```

#### Configuration Options Reference

| Option | Description | Default |
|--------|-------------|---------|
| `patterns` | Glob patterns for files to index | `["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.py", "**/*.go", "**/*.rs", "**/*.java", "**/*.rb", "**/*.php", "**/*.c", "**/*.cpp", "**/*.h", "**/*.hpp", "**/*.cs", "**/*.swift", "**/*.kt"]` |
| `excludePatterns` | Glob patterns for files to exclude | `["**/node_modules/**", "**/dist/**", "**/.git/**", "**/build/**", "**/target/**", "**/__pycache__/**", "**/venv/**", "**/.venv/**", "**/vendor/**", "**/*.min.js", "**/*.min.css"]` |
| `embedding.backend` | Embedding provider: `"jina"` or `"ollama"` | Auto-detect based on available API keys |
| `embedding.model` | Override the default embedding model | Backend default |
| `chunking.maxLines` | Maximum lines per chunk | `100` |
| `chunking.overlap` | Overlapping lines between chunks for context continuity | `20` |
| `search.semanticWeight` | Weight for semantic (vector) similarity (0-1) | `0.7` |
| `search.keywordWeight` | Weight for BM25 keyword matching (0-1) | `0.3` |
| `dashboard.enabled` | Enable the web dashboard | `true` |
| `dashboard.port` | Port for the dashboard server | `24300` |
| `dashboard.openBrowser` | Auto-open browser when dashboard starts | `true` |
| `instructions` | Project-specific instructions returned by `get_project_instructions` | None |

#### Default Behavior

Without a `.lance-context.json` file, lance-context will:

- Index common source code files (TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, PHP, C/C++, C#, Swift, Kotlin)
- Exclude build artifacts, dependencies, and generated files
- Use Jina embeddings if `JINA_API_KEY` is set, otherwise use local Ollama with `qwen3-embedding:0.6b`
- Split code into 100-line chunks with 20-line overlap
- Use hybrid search with 70% semantic / 30% keyword weighting
- Start the dashboard on port 24300

#### Environment Variables

Set these environment variables to configure embedding backends:

| Variable | Description | Default |
|----------|-------------|---------|
| `JINA_API_KEY` | Jina AI API key for cloud embeddings ([free tier available](https://jina.ai/)) | None |
| `OLLAMA_URL` | Custom Ollama server URL for local embeddings | `http://localhost:11434` |
| `LANCE_CONTEXT_PROJECT` | Override the project path to index | Current working directory |

**Backend Selection Priority:**

1. If `embedding.backend` is set in config, use that backend
2. If `JINA_API_KEY` is set, use Jina
3. Fall back to Ollama (must be running locally)

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

## Embedding Backend Setup

lance-context automatically selects the best available backend (in priority order):

1. **Jina v3** (if `JINA_API_KEY` is set, free tier available but rate-limited)
   ```bash
   export JINA_API_KEY=jina_...
   ```

2. **Ollama** (recommended for most users - free, local, no rate limits)

### Ollama Setup (Recommended)

Ollama provides free, local embeddings with no API rate limits. Perfect for indexing large codebases.

1. **Install Ollama** from [ollama.com](https://ollama.com)

2. **Pull the embedding model:**
   ```bash
   ollama pull qwen3-embedding:0.6b
   ```

3. **Verify it's working:**
   ```bash
   ollama run qwen3-embedding:0.6b "test"
   ```

That's it! lance-context will automatically use Ollama when no Jina API key is set.

#### Model Options

| Model | Size | Quality | Best For |
|-------|------|---------|----------|
| `qwen3-embedding:0.6b` | 639MB | Good | Most users (default) |
| `qwen3-embedding:4b` | 2.5GB | Better | Users with 16GB+ RAM |
| `qwen3-embedding:8b` | 4.7GB | Best | Users with 32GB+ RAM |

To use a different model, add to your `.lance-context.json`:
```json
{
  "embedding": {
    "backend": "ollama",
    "model": "qwen3-embedding:4b"
  }
}
```

See [Project Configuration](#project-configuration) for all configuration options including how to specify a backend.

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

## Dashboard

lance-context includes a web dashboard for monitoring index status and usage.

### Accessing the Dashboard

The dashboard starts automatically when the MCP server runs and is available at:

```
http://127.0.0.1:24300
```

The browser opens automatically on startup (configurable).

### Dashboard Features

- **Index Status**: Files indexed, chunks created, last updated time
- **Embedding Backend**: Current backend and index path
- **Configuration**: Project path, chunk settings, search weights
- **File Patterns**: Include/exclude patterns being used
- **Command Usage**: Real-time chart of MCP tool usage (using [charts.css](https://chartscss.org/))
- **Beads Integration**: Issue tracker status and ready tasks (if beads is configured)

### Dashboard Configuration

Configure the dashboard via the `dashboard` options in `.lance-context.json`. See [Configuration Options Reference](#configuration-options-reference) for details.

## How It Works

1. **Indexing**: Code files are chunked into ~100-line segments with overlap
2. **Embedding**: Each chunk is converted to a vector using your chosen backend
3. **Storage**: Vectors are stored in LanceDB (`.lance-context/` directory)
4. **Search**: Natural language queries are embedded and matched against stored vectors

## Supported Languages

TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, PHP, C/C++, C#, Swift, Kotlin, and more.

## Troubleshooting

### "No embedding backend available"

This error means no API keys are set and Ollama is not running/accessible.

**Solutions:**
1. Set up Ollama (recommended):
   ```bash
   # Install from https://ollama.com, then:
   ollama pull qwen3-embedding:0.6b
   ```
2. Or set a Jina API key: `export JINA_API_KEY=jina_...`

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

MIT - See [LICENSE](LICENSE) for details.

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

Inspired by:
- [Serena](https://github.com/oraios/serena) by [Oraios](https://github.com/oraios) - Symbol-level code navigation and editing
