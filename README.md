<p align="center">
  <img src="logo.png" alt="glancey logo" width="150" height="150">
</p>

<p align="center">
  <a href="https://github.com/nicholaspsmith/glancey/actions/workflows/ci.yml"><img src="https://github.com/nicholaspsmith/glancey/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/glancey"><img src="https://img.shields.io/npm/v/glancey.svg" alt="npm version"></a>
  <a href="https://github.com/nicholaspsmith/glancey/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg" alt="Node.js version">
</p>

# glancey

An MCP plugin that adds semantic code search to Claude Code and other AI coding agents, giving them deep context from your entire codebase.

## Features

- **Semantic Code Search**: Natural language queries locate relevant code across your entire codebase
- **Token Savings**: Dramatically reduces context usage by returning only relevant code chunks
- **Multiple Embedding Backends**: Google Gemini (free) or Ollama (local)
- **LanceDB Vector Storage**: Fast, efficient vector search with hybrid BM25 + dense matching
- **MCP Compatible**: Works with Claude Code, Cursor, and other MCP-compatible tools
- **Web Dashboard**: Real-time monitoring of index status, token savings, and usage statistics
- **Beads Integration**: Shows issue tracker data if your project uses [beads](https://github.com/steveyegge/beads)

## How glancey Saves Tokens

AI coding agents typically need to read entire files to understand your codebase, which consumes significant context tokens. glancey dramatically reduces token usage by:

| Without glancey | With glancey | Savings |
|-----------------------|-------------------|---------|
| Read 5-10 files to find auth code (~5000 lines) | `search_code` returns 3 chunks (~150 lines) | ~97% |
| Read entire file to understand structure | `get_symbols_overview` returns compact list | ~80-90% |
| Explore many files to understand codebase | `summarize_codebase` + `list_concepts` | ~95% |
| Read and compare files for duplicates | `search_similar` returns targeted results | ~90% |

### Token Savings Dashboard

The web dashboard displays real-time token savings statistics:
- **Estimated Tokens Saved**: Total tokens avoided by using semantic search
- **Efficiency**: Percentage of potential tokens saved
- **Files Not Read**: Count of files skipped due to targeted search
- **Operations Tracked**: Number of search operations contributing to savings

### How It Works

1. **Chunking**: Your codebase is split into semantic chunks (functions, classes, etc.)
2. **Embedding**: Each chunk is converted to a vector embedding
3. **Search**: Queries find only the most relevant chunks, not entire files
4. **Return**: Only the matching chunks are sent to the AI, saving context tokens

## Installation

### Quick Install (Recommended)

Add glancey to Claude Code:

```bash
claude mcp add --scope user --transport stdio glancey -- npx -y glancey
```

Restart Claude Code to start using semantic search.

### Global Install (Alternative)

For faster startup (no npm check on each run):

```bash
npm install -g glancey
```

This automatically registers glancey with Claude Code. Update manually with `npm update -g glancey`.

### Manual Registration

If automatic registration didn't work, manually add to Claude Code:

```bash
claude mcp add --scope user --transport stdio glancey -- npx -y glancey@latest
```

### Verify Installation

In Claude Code, run `/mcp` to see glancey in the list of MCP servers.

### Initialize Your Project (Recommended)

After installing glancey, run `init_project` in your project to set up agent instructions:

```
> init_project
```

This creates:
- **CLAUDE.md** - Instructions for AI agents on how to use glancey tools
- **Post-commit hook** - Warns when commits bypass the `commit` tool

The hook is installed in `.husky/` if you use Husky, otherwise in `.git/hooks/`.

### Project-Level Installation

For project-specific MCP configuration, add a `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "glancey": {
      "command": "npx",
      "args": ["-y", "glancey@latest"]
    }
  }
}
```

### Project Configuration

Create a `.glancey.json` file in your project root to customize indexing behavior. All options are optional - glancey works out of the box with sensible defaults.

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
    "backend": "gemini"
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
| `embedding.backend` | Embedding provider: `"gemini"` or `"ollama"` | Auto-detect based on available API keys |
| `embedding.model` | Override the default embedding model | Backend default |
| `embedding.ollamaConcurrency` | Max concurrent Ollama requests (1-200) | `100` |
| `indexing.batchSize` | Texts per embedding batch request (1-1000) | `200` |
| `chunking.maxLines` | Maximum lines per chunk | `100` |
| `chunking.overlap` | Overlapping lines between chunks for context continuity | `20` |
| `search.semanticWeight` | Weight for semantic (vector) similarity (0-1) | `0.7` |
| `search.keywordWeight` | Weight for BM25 keyword matching (0-1) | `0.3` |
| `dashboard.enabled` | Enable the web dashboard | `true` |
| `dashboard.port` | Port for the dashboard server | `24300` |
| `dashboard.openBrowser` | Auto-open browser when dashboard starts | `true` |
| `instructions` | Project-specific instructions returned by `get_project_instructions` | None |

#### Default Behavior

Without a `.glancey.json` file, glancey will:

- Index common source code files (TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, PHP, C/C++, C#, Swift, Kotlin)
- Exclude build artifacts, dependencies, and generated files
- Use Gemini embeddings if `GEMINI_API_KEY` is set, otherwise use local Ollama with `qwen3-embedding:0.6b`
- Split code into 100-line chunks with 20-line overlap
- Use hybrid search with 70% semantic / 30% keyword weighting
- Start the dashboard on port 24300

#### Environment Variables

Set these environment variables to configure embedding backends:

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key for cloud embeddings ([free tier available](https://aistudio.google.com/app/apikey)) | None |
| `OLLAMA_URL` | Custom Ollama server URL for local embeddings | `http://localhost:11434` |
| `GLANCEY_PROJECT` | Override the project path to index | Current working directory |

**Backend Selection Priority:**

1. If `embedding.backend` is set in config, use that backend
2. If `GEMINI_API_KEY` is set, use Gemini
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
│            Gemini  │  Ollama (local)                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                   LanceDB Vector Store                      │
│           Stored in .glancey/ directory               │
└─────────────────────────────────────────────────────────────┘
```

## Embedding Backend Setup

glancey automatically selects the best available backend (in priority order):

1. **Google Gemini** (if `GEMINI_API_KEY` is set, free tier available)
   ```bash
   export GEMINI_API_KEY=AIza...
   ```

2. **Ollama** (recommended for most users - free, local, no rate limits)

### Ollama Setup (Recommended)

Ollama provides free, local embeddings with no API rate limits. Perfect for indexing large codebases.

**Requirements:** Ollama 0.2.0 or newer (for batch embedding API)

1. **Install Ollama** from [ollama.com](https://ollama.com)

2. **Verify version** (must be 0.2.0+):
   ```bash
   ollama --version
   ```

3. **Pull the embedding model:**
   ```bash
   ollama pull qwen3-embedding:0.6b
   ```

4. **Verify it's working:**
   ```bash
   ollama run qwen3-embedding:0.6b "test"
   ```

That's it! glancey will automatically use Ollama when no Gemini API key is set.

#### Model Options

| Model | Size | Quality | Best For |
|-------|------|---------|----------|
| `qwen3-embedding:0.6b` | 639MB | Good | Most users (default) |
| `qwen3-embedding:4b` | 2.5GB | Better | Users with 16GB+ RAM |
| `qwen3-embedding:8b` | 4.7GB | Best | Users with 32GB+ RAM |

To use a different model, add to your `.glancey.json`:
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

glancey includes a web dashboard for monitoring index status and usage.

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

Configure the dashboard via the `dashboard` options in `.glancey.json`. See [Configuration Options Reference](#configuration-options-reference) for details.

## How It Works

1. **Indexing**: Code files are chunked into ~100-line segments with overlap
2. **Embedding**: Each chunk is converted to a vector using your chosen backend
3. **Storage**: Vectors are stored in LanceDB (`.glancey/` directory)
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
2. Or set a Gemini API key: `export GEMINI_API_KEY=AIza...`

### "Embedding dimension mismatch"

This occurs when switching between embedding backends (e.g., from Gemini to Ollama). Each backend produces different vector dimensions.

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

Or manually delete the `.glancey/` directory and re-index.

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
- [Google AI Studio](https://aistudio.google.com/) - Gemini Embedding API

Inspired by:
- [Serena](https://github.com/oraios/serena) by [Oraios](https://github.com/oraios) - Symbol-level code navigation and editing
