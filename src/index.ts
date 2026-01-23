#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);
import { createEmbeddingBackend } from './embeddings/index.js';
import { CodeIndexer } from './search/indexer.js';
import { isStringArray, isString, isNumber, isBoolean } from './utils/type-guards.js';
import { logError, formatErrorResponse, wrapError, LanceContextError } from './utils/errors.js';
import { loadConfig, loadSecrets, getInstructions, getDashboardConfig } from './config.js';
import {
  startDashboard,
  stopDashboard,
  dashboardState,
  isPortAvailable,
} from './dashboard/index.js';
import type { CommandName } from './dashboard/index.js';

// Symbolic analysis imports
import {
  SymbolExtractor,
  searchForPattern,
  formatPatternSearchResults,
  ReferenceFinder,
  formatReferencesResult,
  SymbolEditor,
  SymbolRenamer,
  formatRenameResult,
  SymbolKind,
  SymbolKindNames,
  parseNamePath,
  matchNamePath,
  formatNamePath,
} from './symbols/index.js';
import { MemoryManager, formatMemoryList } from './memory/index.js';
import { WorktreeManager, formatWorktreeInfo, formatWorktreeList } from './worktree/index.js';

/**
 * Check if browser was recently opened (within the last hour)
 */
function wasBrowserRecentlyOpened(projectPath: string): boolean {
  const flagFile = path.join(projectPath, '.lance-context', 'browser-opened');
  try {
    if (fs.existsSync(flagFile)) {
      const timestamp = parseInt(fs.readFileSync(flagFile, 'utf-8'), 10);
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      return timestamp > oneHourAgo;
    }
  } catch {
    // Ignore errors
  }
  return false;
}

/**
 * Record that browser was opened
 */
function recordBrowserOpened(projectPath: string): void {
  const flagFile = path.join(projectPath, '.lance-context', 'browser-opened');
  try {
    fs.writeFileSync(flagFile, Date.now().toString());
  } catch {
    // Ignore errors
  }
}

/**
 * Open a URL in the user's default browser (cross-platform)
 */
function openBrowser(url: string, projectPath: string): void {
  // Don't open if already opened recently
  if (wasBrowserRecentlyOpened(projectPath)) {
    console.error('[lance-context] Dashboard was recently opened, skipping');
    return;
  }

  const platform = process.platform;
  let command: string;

  switch (platform) {
    case 'darwin':
      command = `open "${url}"`;
      break;
    case 'win32':
      command = `start "" "${url}"`;
      break;
    default:
      // Linux and others
      command = `xdg-open "${url}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.error('[lance-context] Failed to open browser:', error.message);
    } else {
      recordBrowserOpened(projectPath);
    }
  });
}

const PROJECT_PATH = process.env.LANCE_CONTEXT_PROJECT || process.cwd();

/**
 * Brief guidance appended to tool responses to reinforce tool selection preferences.
 */
const TOOL_GUIDANCE = `

---
**Tip:** Prefer lance-context's \`search_code\` over pattern-based tools (grep, find_symbol) when exploring code or unsure of exact names.`;

/**
 * Server instructions provided at MCP initialization.
 * These guide Claude on when to use lance-context tools vs alternatives.
 */
const SERVER_INSTRUCTIONS = `# lance-context - Semantic Code Search & Symbol Analysis

## When to Use lance-context Tools

**PREFER lance-context tools** over pattern-based alternatives (grep, find) for code exploration:

| Task | Use lance-context | Instead of |
|------|-------------------|------------|
| Find code by concept | \`search_code\` | grep with regex |
| Unsure of exact names | \`search_code\` | wildcards, substring matching |
| Explore unfamiliar code | \`search_code\` | multiple grep/find attempts |
| Find similar patterns | \`search_similar\` | manual comparison |
| Commit changes | \`commit\` | git commit |
| Understand file structure | \`get_symbols_overview\` | reading entire file |
| Find specific function/class | \`find_symbol\` | grep for definition |
| Find symbol usages | \`find_referencing_symbols\` | grep for name |
| Search with regex | \`search_for_pattern\` | grep/rg |

## Tool Categories

### Semantic Search
- **search_code**: Natural language code search. One call replaces multiple pattern searches.
- **search_similar**: Find duplicate/related code patterns.

### Symbol Navigation
- **get_symbols_overview**: List all symbols in a file grouped by kind (Class, Function, etc.)
- **find_symbol**: Search by name path pattern (e.g., "MyClass/myMethod", "get*")
- **find_referencing_symbols**: Find all usages of a symbol across codebase
- **search_for_pattern**: Regex search with context lines

### Symbol Editing
- **replace_symbol_body**: Replace entire symbol definition
- **insert_before_symbol**: Add code before a symbol
- **insert_after_symbol**: Add code after a symbol
- **rename_symbol**: Rename symbol across entire codebase

### Memory (Project Context)
- **write_memory**: Save project-specific notes/decisions
- **read_memory**: Retrieve saved context
- **list_memories**: See available memories
- **edit_memory**: Find/replace in memory
- **delete_memory**: Remove a memory

### Git & Index
- **commit**: Git commit with validation (feature branch, message format)
- **index_codebase**: Build/update the search index
- **get_index_status**: Check if index is ready

## Signs You Should Have Used search_code

- You used wildcards or regex alternation
- Multiple search attempts to find something
- Pattern-based search returned nothing
- Searching for a concept, not an exact identifier`;

/**
 * Priority instructions returned by get_project_instructions
 */
const PRIORITY_INSTRUCTIONS = `
## Tool Selection Priority

**ALWAYS prefer lance-context tools** over other code exploration tools (Serena, grep, find):

1. **search_code** - Use for ANY code exploration:
   - Finding code by concept ("error handling", "authentication")
   - When unsure of exact names or locations
   - When you would otherwise use wildcards or regex
   - If your first search attempt fails

2. **search_similar** - Finding related/duplicate code patterns

3. **get_index_status** - Check if index is ready before searching

4. **commit** - Use instead of \`git commit\`:
   - Validates you're on a feature branch (not main)
   - Checks message format (≤72 chars, imperative mood)
   - Enforces single responsibility per commit
   - Auto-appends Co-Authored-By trailer

**Signs you should have used search_code:**
- You used wildcards or regex alternation (e.g., \`foo|bar\`)
- You made multiple search calls to find something
- You searched for a partial name with substring matching
- Your pattern-based search returned nothing

`;

let indexerPromise: Promise<CodeIndexer> | null = null;
let configPromise: ReturnType<typeof loadConfig> | null = null;

async function getConfig() {
  if (!configPromise) {
    configPromise = loadConfig(PROJECT_PATH);
  }
  return configPromise;
}

async function getIndexer(): Promise<CodeIndexer> {
  if (!indexerPromise) {
    indexerPromise = (async () => {
      // Load config and secrets to configure embedding backend
      const config = await getConfig();
      const secrets = await loadSecrets(PROJECT_PATH);
      const backend = await createEmbeddingBackend({
        backend: config.embedding?.backend,
        apiKey: secrets.jinaApiKey,
      });
      const idx = new CodeIndexer(PROJECT_PATH, backend);
      await idx.initialize();

      // Share indexer and config with dashboard state
      dashboardState.setIndexer(idx);
      dashboardState.setConfig(config);
      dashboardState.setProjectPath(PROJECT_PATH);

      return idx;
    })();
  }
  return indexerPromise;
}

const server = new Server(
  {
    name: 'lance-context',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
    instructions: SERVER_INSTRUCTIONS,
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'index_codebase',
        description:
          'Index the codebase for semantic search. Creates vector embeddings of all code files. Supports incremental indexing - only changed files are re-indexed unless forceReindex is true.',
        inputSchema: {
          type: 'object',
          properties: {
            patterns: {
              type: 'array',
              items: { type: 'string' },
              description: 'Glob patterns for files to index (default: common code files)',
            },
            excludePatterns: {
              type: 'array',
              items: { type: 'string' },
              description: 'Glob patterns for files to exclude (default: node_modules, dist, .git)',
            },
            forceReindex: {
              type: 'boolean',
              description:
                'Force a full reindex, ignoring cached file modification times (default: false)',
            },
            autoRepair: {
              type: 'boolean',
              description:
                'Automatically repair a corrupted index by forcing a full reindex (default: false)',
            },
          },
        },
      },
      {
        name: 'search_code',
        description:
          'Search the codebase using natural language. Returns relevant code snippets. PREFER THIS TOOL when: (1) you are unsure of exact symbol/function names, (2) you would need wildcards or regex to find something, (3) you are exploring code by concept rather than exact identifier, (4) your first search attempt failed or returned nothing. Semantic search handles name uncertainty naturally - one call here replaces multiple pattern-based searches.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language query to search for',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)',
            },
            pathPattern: {
              type: 'string',
              description:
                "Glob pattern to filter results by file path (e.g., 'src/**/*.ts', '!**/*.test.ts')",
            },
            languages: {
              type: 'array',
              items: { type: 'string' },
              description:
                "Filter results to specific languages (e.g., ['typescript', 'javascript'])",
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_index_status',
        description: 'Get the current status of the code index.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'clear_index',
        description: 'Clear the code index.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_project_instructions',
        description:
          'Get project-specific instructions from the .lance-context.json config file. Returns instructions for how to work with this codebase.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'search_similar',
        description:
          'Find code semantically similar to a given code snippet or file location. Useful for finding duplicate logic, similar implementations, or related code patterns.',
        inputSchema: {
          type: 'object',
          properties: {
            filepath: {
              type: 'string',
              description:
                'File path (relative to project root) to find similar code for. Use with startLine/endLine to specify a range.',
            },
            startLine: {
              type: 'number',
              description: 'Starting line number (1-indexed). Requires filepath.',
            },
            endLine: {
              type: 'number',
              description: 'Ending line number (1-indexed). Requires filepath.',
            },
            code: {
              type: 'string',
              description:
                'Code snippet to find similar code for. Alternative to filepath - provide either code or filepath, not both.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)',
            },
            threshold: {
              type: 'number',
              description: 'Minimum similarity score 0-1 (default: 0)',
            },
            excludeSelf: {
              type: 'boolean',
              description: 'Exclude the source chunk from results (default: true)',
            },
          },
        },
      },
      {
        name: 'summarize_codebase',
        description:
          'Generate a comprehensive summary of the codebase including file statistics, language distribution, and discovered concept areas. Uses k-means clustering on embeddings to identify related code groups.',
        inputSchema: {
          type: 'object',
          properties: {
            numClusters: {
              type: 'number',
              description:
                'Target number of concept clusters (default: auto-determined based on codebase size)',
            },
          },
        },
      },
      {
        name: 'list_concepts',
        description:
          'List all discovered concept clusters in the codebase. Each cluster represents a semantic grouping of related code (e.g., authentication, database, API handlers). Returns cluster labels, sizes, and representative code chunks.',
        inputSchema: {
          type: 'object',
          properties: {
            forceRecluster: {
              type: 'boolean',
              description: 'Force reclustering even if cached results exist (default: false)',
            },
          },
        },
      },
      {
        name: 'search_by_concept',
        description:
          'Search for code within a specific concept cluster. Use list_concepts first to discover available clusters and their IDs. Can optionally combine with a semantic query to search within the cluster.',
        inputSchema: {
          type: 'object',
          properties: {
            conceptId: {
              type: 'number',
              description: 'The cluster ID to search within (from list_concepts)',
            },
            query: {
              type: 'string',
              description:
                'Optional semantic query to search within the cluster. If not provided, returns representative chunks.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)',
            },
          },
          required: ['conceptId'],
        },
      },
      {
        name: 'commit',
        description:
          'Create a git commit with validation. USE THIS TOOL instead of running git commit directly. This tool enforces project commit rules: (1) validates you are on a feature branch (not main), (2) checks commit message format (<=72 chars, imperative mood, single responsibility), (3) returns commit rules as a reminder. Prevents common mistakes like committing to main or multi-responsibility commits.',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description:
                'The commit message. Must be <=72 characters, imperative mood, single responsibility.',
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Files to stage before committing. If not provided, commits already-staged files.',
            },
          },
          required: ['message'],
        },
      },
      // --- Symbolic Analysis Tools ---
      {
        name: 'get_symbols_overview',
        description:
          "Get a high-level overview of code symbols in a file. Returns symbols grouped by kind (Class, Function, Method, etc.) in a compact format. Use this to understand a file's structure before diving into specific symbols.",
        inputSchema: {
          type: 'object',
          properties: {
            relative_path: {
              type: 'string',
              description: 'The relative path to the file to analyze.',
            },
            depth: {
              type: 'number',
              description: 'Depth of descendants to retrieve (0 = top-level only). Default: 0.',
            },
            max_answer_chars: {
              type: 'number',
              description: 'Maximum response size in characters. Default: 50000.',
            },
          },
          required: ['relative_path'],
        },
      },
      {
        name: 'find_symbol',
        description:
          'Find symbols by name path pattern. Supports: (1) simple name "myFunction", (2) relative path "MyClass/myMethod", (3) absolute path "/MyClass/myMethod", (4) glob pattern "get*" with substring_matching. Returns symbol locations and optionally their source code body.',
        inputSchema: {
          type: 'object',
          properties: {
            name_path_pattern: {
              type: 'string',
              description:
                'The name path pattern to search for (e.g., "MyClass/myMethod", "get*").',
            },
            relative_path: {
              type: 'string',
              description: 'Optional. Restrict search to this file or directory.',
            },
            depth: {
              type: 'number',
              description:
                'Depth of descendants to retrieve (e.g., 1 for class methods). Default: 0.',
            },
            include_body: {
              type: 'boolean',
              description: "Whether to include the symbol's source code. Default: false.",
            },
            include_info: {
              type: 'boolean',
              description:
                'Whether to include additional info (docstring, signature). Default: false.',
            },
            substring_matching: {
              type: 'boolean',
              description:
                'If true, use substring matching for the last element of the pattern. Default: false.',
            },
            include_kinds: {
              type: 'array',
              items: { type: 'number' },
              description:
                'LSP symbol kind integers to include. If not provided, all kinds are included.',
            },
            exclude_kinds: {
              type: 'array',
              items: { type: 'number' },
              description:
                'LSP symbol kind integers to exclude. Takes precedence over include_kinds.',
            },
            max_answer_chars: {
              type: 'number',
              description: 'Maximum response size in characters. Default: 50000.',
            },
          },
          required: ['name_path_pattern'],
        },
      },
      {
        name: 'find_referencing_symbols',
        description:
          'Find all references to a symbol across the codebase. Returns code snippets showing where the symbol is used.',
        inputSchema: {
          type: 'object',
          properties: {
            name_path: {
              type: 'string',
              description:
                'Name path of the symbol to find references for (e.g., "MyClass/myMethod").',
            },
            relative_path: {
              type: 'string',
              description: 'The relative path to the file containing the symbol.',
            },
            include_info: {
              type: 'boolean',
              description:
                'Whether to include additional info about referencing symbols. Default: false.',
            },
            include_kinds: {
              type: 'array',
              items: { type: 'number' },
              description: 'LSP symbol kind integers to include.',
            },
            exclude_kinds: {
              type: 'array',
              items: { type: 'number' },
              description: 'LSP symbol kind integers to exclude.',
            },
            max_answer_chars: {
              type: 'number',
              description: 'Maximum response size in characters. Default: 50000.',
            },
          },
          required: ['name_path', 'relative_path'],
        },
      },
      {
        name: 'search_for_pattern',
        description:
          'Search for a regex pattern in the codebase. Returns matched lines with optional context. Useful for finding code patterns, TODO comments, specific strings, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            substring_pattern: {
              type: 'string',
              description: 'Regular expression pattern to search for.',
            },
            relative_path: {
              type: 'string',
              description: 'Restrict search to this file or directory. Default: entire project.',
            },
            restrict_search_to_code_files: {
              type: 'boolean',
              description: 'Only search in code files (not config, docs). Default: false.',
            },
            paths_include_glob: {
              type: 'string',
              description: 'Glob pattern for files to include (e.g., "*.py", "src/**/*.ts").',
            },
            paths_exclude_glob: {
              type: 'string',
              description:
                'Glob pattern for files to exclude (e.g., "*test*", "**/*_generated.py").',
            },
            context_lines_before: {
              type: 'number',
              description: 'Number of context lines before each match. Default: 0.',
            },
            context_lines_after: {
              type: 'number',
              description: 'Number of context lines after each match. Default: 0.',
            },
            max_answer_chars: {
              type: 'number',
              description: 'Maximum response size in characters. Default: 50000.',
            },
          },
          required: ['substring_pattern'],
        },
      },
      // --- Memory Tools ---
      {
        name: 'write_memory',
        description:
          'Write information about this project to a named memory file. Memories persist across sessions and can be read later. Useful for storing architectural decisions, patterns, or project-specific context.',
        inputSchema: {
          type: 'object',
          properties: {
            memory_file_name: {
              type: 'string',
              description: 'The name of the memory (will be saved as .md file).',
            },
            content: {
              type: 'string',
              description: 'The markdown content to write to the memory.',
            },
            max_answer_chars: {
              type: 'number',
              description: 'Maximum response size in characters. Default: 50000.',
            },
          },
          required: ['memory_file_name', 'content'],
        },
      },
      {
        name: 'read_memory',
        description:
          'Read the content of a memory file. Only read memories that are relevant to the current task.',
        inputSchema: {
          type: 'object',
          properties: {
            memory_file_name: {
              type: 'string',
              description: 'The name of the memory to read.',
            },
            max_answer_chars: {
              type: 'number',
              description: 'Maximum response size in characters. Default: 50000.',
            },
          },
          required: ['memory_file_name'],
        },
      },
      {
        name: 'list_memories',
        description:
          'List all available memory files for this project. Use this to discover what project context has been saved.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'delete_memory',
        description:
          'Delete a memory file. Only delete memories when explicitly requested by the user.',
        inputSchema: {
          type: 'object',
          properties: {
            memory_file_name: {
              type: 'string',
              description: 'The name of the memory to delete.',
            },
          },
          required: ['memory_file_name'],
        },
      },
      {
        name: 'edit_memory',
        description:
          'Edit a memory file using find/replace. Supports both literal string and regex replacement.',
        inputSchema: {
          type: 'object',
          properties: {
            memory_file_name: {
              type: 'string',
              description: 'The name of the memory to edit.',
            },
            needle: {
              type: 'string',
              description: 'The string or regex pattern to search for.',
            },
            repl: {
              type: 'string',
              description: 'The replacement string.',
            },
            mode: {
              type: 'string',
              enum: ['literal', 'regex'],
              description:
                'How to interpret the needle: "literal" for exact match, "regex" for regex pattern.',
            },
          },
          required: ['memory_file_name', 'needle', 'repl', 'mode'],
        },
      },
      // --- Symbol Editing Tools ---
      {
        name: 'replace_symbol_body',
        description:
          'Replace the entire body of a symbol (function, class, method, etc.) with new content. Use this for significant rewrites of symbol definitions.',
        inputSchema: {
          type: 'object',
          properties: {
            name_path: {
              type: 'string',
              description: 'Name path of the symbol to replace (e.g., "MyClass/myMethod").',
            },
            relative_path: {
              type: 'string',
              description: 'The relative path to the file containing the symbol.',
            },
            body: {
              type: 'string',
              description:
                'The new body content for the symbol (including signature line for functions).',
            },
          },
          required: ['name_path', 'relative_path', 'body'],
        },
      },
      {
        name: 'insert_before_symbol',
        description:
          'Insert code before a symbol definition. Useful for adding new functions, classes, or imports before an existing symbol.',
        inputSchema: {
          type: 'object',
          properties: {
            name_path: {
              type: 'string',
              description: 'Name path of the symbol to insert before.',
            },
            relative_path: {
              type: 'string',
              description: 'The relative path to the file containing the symbol.',
            },
            body: {
              type: 'string',
              description: 'The content to insert before the symbol.',
            },
          },
          required: ['name_path', 'relative_path', 'body'],
        },
      },
      {
        name: 'insert_after_symbol',
        description:
          'Insert code after a symbol definition. Useful for adding new functions, classes, or code after an existing symbol.',
        inputSchema: {
          type: 'object',
          properties: {
            name_path: {
              type: 'string',
              description: 'Name path of the symbol to insert after.',
            },
            relative_path: {
              type: 'string',
              description: 'The relative path to the file containing the symbol.',
            },
            body: {
              type: 'string',
              description: 'The content to insert after the symbol.',
            },
          },
          required: ['name_path', 'relative_path', 'body'],
        },
      },
      {
        name: 'rename_symbol',
        description:
          'Rename a symbol throughout the entire codebase. Updates the symbol definition and all references.',
        inputSchema: {
          type: 'object',
          properties: {
            name_path: {
              type: 'string',
              description: 'Name path of the symbol to rename.',
            },
            relative_path: {
              type: 'string',
              description: 'The relative path to the file containing the symbol definition.',
            },
            new_name: {
              type: 'string',
              description: 'The new name for the symbol.',
            },
            dry_run: {
              type: 'boolean',
              description: 'If true, preview changes without making them. Default: false.',
            },
          },
          required: ['name_path', 'relative_path', 'new_name'],
        },
      },
      // --- Worktree Tools ---
      {
        name: 'create_worktree',
        description:
          'Create an isolated git worktree for parallel agent work. Prevents file conflicts when multiple agents work simultaneously. Creates a new branch and optionally installs dependencies.',
        inputSchema: {
          type: 'object',
          properties: {
            short_name: {
              type: 'string',
              description:
                'Short descriptive name for the worktree (e.g., "add-auth", "fix-login"). Used in branch name.',
            },
            issue_id: {
              type: 'string',
              description:
                'Optional issue ID (e.g., "bd-123"). Combined with short_name for naming.',
            },
            prefix: {
              type: 'string',
              enum: ['feature', 'fix', 'refactor', 'docs', 'test'],
              description: 'Branch prefix (default: "feature").',
            },
            base_branch: {
              type: 'string',
              description: 'Base branch to create from (default: main or current branch).',
            },
            install_deps: {
              type: 'boolean',
              description: 'Whether to install dependencies after creation (default: true).',
            },
            package_manager: {
              type: 'string',
              enum: ['npm', 'yarn', 'pnpm', 'bun'],
              description: 'Package manager to use (default: auto-detect from lock file).',
            },
          },
          required: ['short_name'],
        },
      },
      {
        name: 'list_worktrees',
        description:
          'List all agent worktrees and their status. Shows branch, commit, dirty state, and ahead/behind counts.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'remove_worktree',
        description:
          'Remove an agent worktree. Optionally deletes the associated branch. Fails if worktree has uncommitted changes unless force is true.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the worktree to remove.',
            },
            delete_branch: {
              type: 'boolean',
              description: 'Whether to also delete the branch (default: false).',
            },
            force: {
              type: 'boolean',
              description:
                'Force removal even if worktree has uncommitted changes (default: false).',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'worktree_status',
        description:
          'Get detailed status of a specific worktree including branch, commit, and dirty state.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the worktree to get status for.',
            },
          },
          required: ['name'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Record command usage for dashboard
  const validCommands: CommandName[] = [
    'index_codebase',
    'search_code',
    'search_similar',
    'get_index_status',
    'clear_index',
    'get_project_instructions',
    'commit',
  ];
  if (validCommands.includes(name as CommandName)) {
    dashboardState.recordCommandUsage(name as CommandName);
  }

  try {
    const idx = await getIndexer();

    switch (name) {
      case 'index_codebase': {
        const patterns = isStringArray(args?.patterns) ? args.patterns : undefined;
        const excludePatterns = isStringArray(args?.excludePatterns)
          ? args.excludePatterns
          : undefined;
        const forceReindex = isBoolean(args?.forceReindex) ? args.forceReindex : false;
        const autoRepair = isBoolean(args?.autoRepair) ? args.autoRepair : false;

        // Notify dashboard of indexing start
        dashboardState.onIndexingStart();

        const result = await idx.indexCodebase(
          patterns,
          excludePatterns,
          forceReindex,
          (progress) => {
            // Emit progress events to dashboard
            dashboardState.onProgress(progress);
          },
          autoRepair
        );

        // Notify dashboard of indexing completion
        dashboardState.onIndexingComplete(result);

        const mode = result.repaired
          ? 'Repaired (corruption detected)'
          : result.incremental
            ? 'Incremental update'
            : 'Full reindex';
        return {
          content: [
            {
              type: 'text',
              text: `${mode}: Indexed ${result.filesIndexed} files, total ${result.chunksCreated} chunks.${TOOL_GUIDANCE}`,
            },
          ],
        };
      }

      case 'search_code': {
        const query = isString(args?.query) ? args.query : '';
        if (!query) {
          throw new LanceContextError('query is required', 'validation', { tool: 'search_code' });
        }
        const results = await idx.search({
          query,
          limit: isNumber(args?.limit) ? args.limit : 10,
          pathPattern: isString(args?.pathPattern) ? args.pathPattern : undefined,
          languages: isStringArray(args?.languages) ? args.languages : undefined,
        });
        const formatted = results
          .map((r, i) => {
            // Build header with optional symbol context
            let header = `## Result ${i + 1}: ${r.filepath}:${r.startLine}-${r.endLine}`;
            if (r.symbolName) {
              const typeLabel = r.symbolType ? ` (${r.symbolType})` : '';
              header += `\n**Symbol:** \`${r.symbolName}\`${typeLabel}`;
            }
            return `${header}\n\`\`\`${r.language}\n${r.content}\n\`\`\``;
          })
          .join('\n\n');
        return {
          content: [
            {
              type: 'text',
              text: (formatted || 'No results found.') + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'get_index_status': {
        const status = await idx.getStatus();
        let statusText = JSON.stringify(status, null, 2);

        // Add corruption warning if detected
        if (status.corrupted) {
          statusText =
            `**WARNING: Index corruption detected!**\n` +
            `Reason: ${status.corruptionReason}\n` +
            `\nTo repair, either:\n` +
            `1. Run \`index_codebase\` with \`autoRepair: true\`\n` +
            `2. Run \`clear_index\` followed by \`index_codebase\`\n\n` +
            statusText;
        }

        return {
          content: [
            {
              type: 'text',
              text: statusText + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'clear_index': {
        await idx.clearIndex();
        return {
          content: [
            {
              type: 'text',
              text: 'Index cleared.' + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'get_project_instructions': {
        const config = await loadConfig(PROJECT_PATH);
        const projectInstructions = getInstructions(config);
        const fullInstructions = PRIORITY_INSTRUCTIONS + (projectInstructions || '');
        return {
          content: [
            {
              type: 'text',
              text:
                fullInstructions ||
                'No project instructions configured. Add an "instructions" field to .lance-context.json.',
            },
          ],
        };
      }

      case 'search_similar': {
        const results = await idx.searchSimilar({
          filepath: isString(args?.filepath) ? args.filepath : undefined,
          startLine: isNumber(args?.startLine) ? args.startLine : undefined,
          endLine: isNumber(args?.endLine) ? args.endLine : undefined,
          code: isString(args?.code) ? args.code : undefined,
          limit: isNumber(args?.limit) ? args.limit : 10,
          threshold: isNumber(args?.threshold) ? args.threshold : 0,
          excludeSelf: isBoolean(args?.excludeSelf) ? args.excludeSelf : true,
        });

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No similar code found.' + TOOL_GUIDANCE,
              },
            ],
          };
        }

        const formatted = results
          .map((r, i) => {
            let header = `## Similar ${i + 1}: ${r.filepath}:${r.startLine}-${r.endLine} (${(r.similarity * 100).toFixed(1)}% similar)`;
            if (r.symbolName) {
              const typeLabel = r.symbolType ? ` (${r.symbolType})` : '';
              header += `\n**Symbol:** \`${r.symbolName}\`${typeLabel}`;
            }
            return `${header}\n\`\`\`${r.language}\n${r.content}\n\`\`\``;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: formatted + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'summarize_codebase': {
        const numClusters = isNumber(args?.numClusters) ? args.numClusters : undefined;
        const summary = await idx.summarizeCodebase(numClusters ? { numClusters } : undefined);

        const languageList = summary.languages
          .map((l) => `- **${l.language}**: ${l.fileCount} files, ${l.chunkCount} chunks`)
          .join('\n');

        const conceptList = summary.concepts
          .map((c) => {
            const keywords = c.keywords.slice(0, 5).join(', ');
            return `- **Cluster ${c.id}: ${c.label}** (${c.size} chunks)\n  Keywords: ${keywords}`;
          })
          .join('\n');

        const formatted = `# Codebase Summary

## Overview
- **Total Files**: ${summary.totalFiles}
- **Total Chunks**: ${summary.totalChunks}
- **Concept Clusters**: ${summary.concepts.length}
- **Clustering Quality**: ${(summary.clusteringQuality * 100).toFixed(1)}% (silhouette score)
- **Generated At**: ${summary.generatedAt}

## Languages
${languageList}

## Concept Areas
${conceptList}`;

        return {
          content: [
            {
              type: 'text',
              text: formatted + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'list_concepts': {
        const forceRecluster = isBoolean(args?.forceRecluster) ? args.forceRecluster : false;
        const concepts = await idx.listConcepts(forceRecluster);

        if (concepts.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text:
                  'No concept clusters found. Make sure the codebase is indexed first.' +
                  TOOL_GUIDANCE,
              },
            ],
          };
        }

        const formatted = concepts
          .map((c) => {
            const keywords = c.keywords.slice(0, 5).join(', ');
            return `## Cluster ${c.id}: ${c.label}
- **Size**: ${c.size} code chunks
- **Keywords**: ${keywords}
- **Representatives**: ${c.representativeChunks.slice(0, 3).join(', ')}`;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `# Concept Clusters\n\n${formatted}` + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'search_by_concept': {
        const conceptId = isNumber(args?.conceptId) ? args.conceptId : -1;
        if (conceptId < 0) {
          throw new LanceContextError(
            'conceptId is required and must be a non-negative number',
            'validation',
            { tool: 'search_by_concept' }
          );
        }

        const query = isString(args?.query) ? args.query : undefined;
        const limit = isNumber(args?.limit) ? args.limit : 10;

        const results = await idx.searchByConcept(conceptId, query, limit);

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text:
                  `No code found in concept cluster ${conceptId}. Try list_concepts to see available clusters.` +
                  TOOL_GUIDANCE,
              },
            ],
          };
        }

        const formatted = results
          .map((r, i) => {
            let header = `## Result ${i + 1}: ${r.filepath}:${r.startLine}-${r.endLine}`;
            if (r.symbolName) {
              const typeLabel = r.symbolType ? ` (${r.symbolType})` : '';
              header += `\n**Symbol:** \`${r.symbolName}\`${typeLabel}`;
            }
            return `${header}\n\`\`\`${r.language}\n${r.content}\n\`\`\``;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: formatted + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'commit': {
        const message = isString(args?.message) ? args.message : '';
        const files = isStringArray(args?.files) ? args.files : [];

        if (!message) {
          throw new LanceContextError('message is required', 'validation', { tool: 'commit' });
        }

        // Commit rules to return with every response
        const COMMIT_RULES = `
## Commit Rules Reminder

1. **Branch**: Must be on a feature branch, not main/master
2. **Message length**: Subject line must be ≤72 characters
3. **Imperative mood**: "Add feature" not "Added feature"
4. **Single responsibility**: One logical change per commit
5. **Body format**: Only "Co-Authored-By: Claude <noreply@anthropic.com>"

**Signs of multi-responsibility** (split into separate commits):
- Message contains "and" connecting actions
- Message lists multiple changes with commas
- Changes span unrelated files/features
`;

        const errors: string[] = [];
        const warnings: string[] = [];

        // Check 1: Not on main/master branch
        let currentBranch = '';
        try {
          const { stdout } = await execAsync('git branch --show-current', { cwd: PROJECT_PATH });
          currentBranch = stdout.trim();
          if (currentBranch === 'main' || currentBranch === 'master') {
            errors.push(
              `Cannot commit directly to ${currentBranch}. Create a feature branch first:\n  git checkout -b feature/your-feature-name`
            );
          }
        } catch {
          errors.push('Failed to determine current branch. Are you in a git repository?');
        }

        // Check 2: Message length
        const subjectLine = message.split('\n')[0];
        if (subjectLine.length > 72) {
          errors.push(`Subject line is ${subjectLine.length} characters (max 72). Shorten it.`);
        }

        // Check 3: Imperative mood (heuristic - check for common past tense patterns)
        const pastTensePatterns =
          /^(Added|Fixed|Updated|Changed|Removed|Implemented|Created|Deleted|Modified|Refactored|Merged)\b/i;
        if (pastTensePatterns.test(subjectLine)) {
          warnings.push(
            `Subject may not be imperative mood. Use "Add" not "Added", "Fix" not "Fixed", etc.`
          );
        }

        // Check 4: Single responsibility (heuristic - check for "and" or multiple verbs)
        const multiResponsibilityPatterns =
          /\b(and|,)\s+(add|fix|update|change|remove|implement|create|delete|modify|refactor)\b/i;
        if (multiResponsibilityPatterns.test(subjectLine)) {
          errors.push(`Message suggests multiple responsibilities. Split into separate commits.`);
        }

        // If there are blocking errors, return them without committing
        if (errors.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text: `## Commit Blocked\n\n**Errors:**\n${errors.map((e) => `- ${e}`).join('\n')}\n${warnings.length > 0 ? `\n**Warnings:**\n${warnings.map((w) => `- ${w}`).join('\n')}` : ''}\n${COMMIT_RULES}`,
              },
            ],
            isError: true,
          };
        }

        // Stage files if provided
        if (files.length > 0) {
          try {
            const fileArgs = files.map((f) => `"${f}"`).join(' ');
            await execAsync(`git add ${fileArgs}`, { cwd: PROJECT_PATH });
          } catch (e) {
            throw wrapError('Failed to stage files', 'git', e, { files });
          }
        }

        // Check if there are staged changes
        try {
          const { stdout } = await execAsync('git diff --cached --name-only', {
            cwd: PROJECT_PATH,
          });
          if (!stdout.trim()) {
            throw new LanceContextError(
              'No staged changes to commit. Stage files first or pass files parameter.',
              'git'
            );
          }
        } catch (e) {
          if (e instanceof LanceContextError) {
            throw e;
          }
          throw wrapError('Failed to check staged changes', 'git', e);
        }

        // Build commit message with Co-Authored-By
        const fullMessage = `${message}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`;

        // Execute commit
        try {
          const { stdout } = await execAsync(
            `git commit -m "${fullMessage.replace(/"/g, '\\"')}"`,
            { cwd: PROJECT_PATH }
          );

          let response = `## Commit Successful\n\n${stdout.trim()}`;
          if (warnings.length > 0) {
            response += `\n\n**Warnings:**\n${warnings.map((w) => `- ${w}`).join('\n')}`;
          }
          response += `\n${COMMIT_RULES}`;

          return {
            content: [
              {
                type: 'text',
                text: response,
              },
            ],
          };
        } catch (e) {
          throw wrapError('Git commit failed', 'git', e, { message });
        }
      }

      // --- Symbolic Analysis Tools ---
      case 'get_symbols_overview': {
        const relativePath = isString(args?.relative_path) ? args.relative_path : '';
        if (!relativePath) {
          throw new LanceContextError('relative_path is required', 'validation', {
            tool: 'get_symbols_overview',
          });
        }
        const depth = isNumber(args?.depth) ? args.depth : 0;

        const extractor = new SymbolExtractor(PROJECT_PATH);
        const overview = await extractor.getSymbolsOverview(relativePath, depth);

        // Format the output
        const parts: string[] = [];
        parts.push(`## Symbols in ${overview.filepath}\n`);
        parts.push(`Total: ${overview.totalSymbols} symbols\n`);

        for (const [kindName, entries] of Object.entries(overview.byKind)) {
          parts.push(`\n### ${kindName} (${entries.length})\n`);
          for (const entry of entries) {
            const childInfo = entry.children ? ` [${entry.children} children]` : '';
            parts.push(`- **${entry.name}** (${entry.lines})${childInfo}`);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: parts.join('\n') + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'find_symbol': {
        const namePathPattern = isString(args?.name_path_pattern) ? args.name_path_pattern : '';
        if (!namePathPattern) {
          throw new LanceContextError('name_path_pattern is required', 'validation', {
            tool: 'find_symbol',
          });
        }
        const relativePath = isString(args?.relative_path) ? args.relative_path : undefined;
        const depth = isNumber(args?.depth) ? args.depth : 0;
        const includeBody = isBoolean(args?.include_body) ? args.include_body : false;
        const substringMatching = isBoolean(args?.substring_matching)
          ? args.substring_matching
          : false;
        const includeKinds = Array.isArray(args?.include_kinds)
          ? (args.include_kinds as SymbolKind[])
          : undefined;
        const excludeKinds = Array.isArray(args?.exclude_kinds)
          ? (args.exclude_kinds as SymbolKind[])
          : undefined;

        const extractor = new SymbolExtractor(PROJECT_PATH);

        // If relativePath is provided, search in that file/directory
        // Otherwise, we need to search the whole codebase (more expensive)
        const files: string[] = [];
        if (relativePath) {
          const fullPath = path.join(PROJECT_PATH, relativePath);
          try {
            const fsStat = fs.statSync(fullPath);
            if (fsStat.isFile()) {
              files.push(relativePath);
            } else {
              // Directory - find all analyzable files
              const { glob: globFn } = await import('glob');
              const codeExtensions = [
                '*.ts',
                '*.tsx',
                '*.js',
                '*.jsx',
                '*.py',
                '*.go',
                '*.rs',
                '*.java',
                '*.rb',
              ];
              for (const ext of codeExtensions) {
                const matches = await globFn(`**/${ext}`, {
                  cwd: fullPath,
                  ignore: ['node_modules/**', 'dist/**', '.git/**'],
                });
                files.push(...matches.map((f: string) => path.join(relativePath, f)));
              }
            }
          } catch {
            throw new LanceContextError(`Path not found: ${relativePath}`, 'validation', {
              tool: 'find_symbol',
            });
          }
        } else {
          // Search whole codebase - expensive, limit to reasonable set
          const { glob: globFn } = await import('glob');
          const codeExtensions = [
            '*.ts',
            '*.tsx',
            '*.js',
            '*.jsx',
            '*.py',
            '*.go',
            '*.rs',
            '*.java',
            '*.rb',
          ];
          for (const ext of codeExtensions) {
            const matches = await globFn(`**/${ext}`, {
              cwd: PROJECT_PATH,
              ignore: ['node_modules/**', 'dist/**', '.git/**'],
            });
            files.push(...matches);
          }
        }

        // Parse the pattern
        const pattern = parseNamePath(namePathPattern);

        // Find matching symbols
        const matchedSymbols: Array<{ symbol: import('./symbols/types.js').Symbol; file: string }> =
          [];

        for (const file of files.slice(0, 100)) {
          // Limit to prevent timeout
          try {
            const symbols = await extractor.extractSymbols(file, includeBody);
            const findMatches = (
              syms: import('./symbols/types.js').Symbol[],
              currentDepth: number
            ) => {
              for (const sym of syms) {
                // Apply kind filters
                if (excludeKinds && excludeKinds.includes(sym.kind)) continue;
                if (includeKinds && !includeKinds.includes(sym.kind)) continue;

                if (matchNamePath(sym.namePath, pattern, substringMatching)) {
                  matchedSymbols.push({ symbol: sym, file });
                }

                // Search children up to requested depth
                if (currentDepth < depth && sym.children) {
                  findMatches(sym.children, currentDepth + 1);
                }
              }
            };
            findMatches(symbols, 0);
          } catch {
            // Skip files that can't be analyzed
          }
        }

        if (matchedSymbols.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No symbols found matching pattern: ${namePathPattern}` + TOOL_GUIDANCE,
              },
            ],
          };
        }

        // Format results
        const parts: string[] = [];
        parts.push(`Found ${matchedSymbols.length} matching symbol(s):\n`);

        for (const { symbol } of matchedSymbols) {
          const kindName = SymbolKindNames[symbol.kind];
          parts.push(`\n## ${formatNamePath(symbol.namePath)} (${kindName})`);
          parts.push(
            `**Location:** ${symbol.location.filepath}:${symbol.location.startLine}-${symbol.location.endLine}`
          );

          if (symbol.body) {
            parts.push('\n```');
            parts.push(symbol.body);
            parts.push('```');
          }

          if (symbol.children && symbol.children.length > 0) {
            parts.push(`\n**Children:** ${symbol.children.length}`);
            for (const child of symbol.children) {
              const childKind = SymbolKindNames[child.kind];
              parts.push(
                `  - ${child.name} (${childKind}, lines ${child.location.startLine}-${child.location.endLine})`
              );
            }
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: parts.join('\n') + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'find_referencing_symbols': {
        const namePath = isString(args?.name_path) ? args.name_path : '';
        const relativePath = isString(args?.relative_path) ? args.relative_path : '';

        if (!namePath || !relativePath) {
          throw new LanceContextError('name_path and relative_path are required', 'validation', {
            tool: 'find_referencing_symbols',
          });
        }

        const includeInfo = isBoolean(args?.include_info) ? args.include_info : false;
        const includeKinds = Array.isArray(args?.include_kinds)
          ? (args.include_kinds as SymbolKind[])
          : undefined;
        const excludeKinds = Array.isArray(args?.exclude_kinds)
          ? (args.exclude_kinds as SymbolKind[])
          : undefined;

        const finder = new ReferenceFinder(PROJECT_PATH);
        const references = await finder.findReferences({
          namePath,
          relativePath,
          includeInfo,
          includeKinds,
          excludeKinds,
        });

        return {
          content: [
            {
              type: 'text',
              text: formatReferencesResult(references) + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'search_for_pattern': {
        const substringPattern = isString(args?.substring_pattern) ? args.substring_pattern : '';
        if (!substringPattern) {
          throw new LanceContextError('substring_pattern is required', 'validation', {
            tool: 'search_for_pattern',
          });
        }

        const result = await searchForPattern(PROJECT_PATH, {
          substringPattern,
          relativePath: isString(args?.relative_path) ? args.relative_path : undefined,
          restrictSearchToCodeFiles: isBoolean(args?.restrict_search_to_code_files)
            ? args.restrict_search_to_code_files
            : false,
          pathsIncludeGlob: isString(args?.paths_include_glob)
            ? args.paths_include_glob
            : undefined,
          pathsExcludeGlob: isString(args?.paths_exclude_glob)
            ? args.paths_exclude_glob
            : undefined,
          contextLinesBefore: isNumber(args?.context_lines_before) ? args.context_lines_before : 0,
          contextLinesAfter: isNumber(args?.context_lines_after) ? args.context_lines_after : 0,
          maxAnswerChars: isNumber(args?.max_answer_chars) ? args.max_answer_chars : 50000,
        });

        return {
          content: [
            {
              type: 'text',
              text: formatPatternSearchResults(result) + TOOL_GUIDANCE,
            },
          ],
        };
      }

      // --- Memory Tools ---
      case 'write_memory': {
        const memoryFileName = isString(args?.memory_file_name) ? args.memory_file_name : '';
        const content = isString(args?.content) ? args.content : '';

        if (!memoryFileName || !content) {
          throw new LanceContextError('memory_file_name and content are required', 'validation', {
            tool: 'write_memory',
          });
        }

        const memoryManager = new MemoryManager(PROJECT_PATH);
        await memoryManager.writeMemory(memoryFileName, content);

        return {
          content: [
            {
              type: 'text',
              text: `Memory "${memoryFileName}" saved successfully.` + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'read_memory': {
        const memoryFileName = isString(args?.memory_file_name) ? args.memory_file_name : '';

        if (!memoryFileName) {
          throw new LanceContextError('memory_file_name is required', 'validation', {
            tool: 'read_memory',
          });
        }

        const memoryManager = new MemoryManager(PROJECT_PATH);
        const content = await memoryManager.readMemory(memoryFileName);

        return {
          content: [
            {
              type: 'text',
              text: `## Memory: ${memoryFileName}\n\n${content}` + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'list_memories': {
        const memoryManager = new MemoryManager(PROJECT_PATH);
        const memories = await memoryManager.listMemories();

        return {
          content: [
            {
              type: 'text',
              text: formatMemoryList(memories) + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'delete_memory': {
        const memoryFileName = isString(args?.memory_file_name) ? args.memory_file_name : '';

        if (!memoryFileName) {
          throw new LanceContextError('memory_file_name is required', 'validation', {
            tool: 'delete_memory',
          });
        }

        const memoryManager = new MemoryManager(PROJECT_PATH);
        await memoryManager.deleteMemory(memoryFileName);

        return {
          content: [
            {
              type: 'text',
              text: `Memory "${memoryFileName}" deleted successfully.` + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'edit_memory': {
        const memoryFileName = isString(args?.memory_file_name) ? args.memory_file_name : '';
        const needle = isString(args?.needle) ? args.needle : '';
        const repl = isString(args?.repl) ? args.repl : '';
        const mode = isString(args?.mode) ? args.mode : '';

        if (!memoryFileName || !needle || mode === '') {
          throw new LanceContextError(
            'memory_file_name, needle, repl, and mode are required',
            'validation',
            { tool: 'edit_memory' }
          );
        }

        if (mode !== 'literal' && mode !== 'regex') {
          throw new LanceContextError('mode must be "literal" or "regex"', 'validation', {
            tool: 'edit_memory',
          });
        }

        const memoryManager = new MemoryManager(PROJECT_PATH);
        const result = await memoryManager.editMemory(memoryFileName, needle, repl, mode);

        return {
          content: [
            {
              type: 'text',
              text:
                `Memory "${memoryFileName}" edited. ${result.matchCount} replacement(s) made.` +
                TOOL_GUIDANCE,
            },
          ],
        };
      }

      // --- Symbol Editing Tools ---
      case 'replace_symbol_body': {
        const namePath = isString(args?.name_path) ? args.name_path : '';
        const relativePath = isString(args?.relative_path) ? args.relative_path : '';
        const body = isString(args?.body) ? args.body : '';

        if (!namePath || !relativePath || !body) {
          throw new LanceContextError(
            'name_path, relative_path, and body are required',
            'validation',
            { tool: 'replace_symbol_body' }
          );
        }

        const editor = new SymbolEditor(PROJECT_PATH);
        const result = await editor.replaceSymbolBody({ namePath, relativePath, body });

        if (!result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to replace symbol: ${result.error}` + TOOL_GUIDANCE,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text:
                `Symbol "${result.symbolName}" replaced in ${result.filepath}.\n` +
                `New location: lines ${result.newRange?.startLine}-${result.newRange?.endLine}` +
                TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'insert_before_symbol': {
        const namePath = isString(args?.name_path) ? args.name_path : '';
        const relativePath = isString(args?.relative_path) ? args.relative_path : '';
        const body = isString(args?.body) ? args.body : '';

        if (!namePath || !relativePath || !body) {
          throw new LanceContextError(
            'name_path, relative_path, and body are required',
            'validation',
            { tool: 'insert_before_symbol' }
          );
        }

        const editor = new SymbolEditor(PROJECT_PATH);
        const result = await editor.insertBeforeSymbol({ namePath, relativePath, body });

        if (!result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to insert before symbol: ${result.error}` + TOOL_GUIDANCE,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text:
                `Content inserted before "${result.symbolName}" in ${result.filepath}.\n` +
                `Inserted at: lines ${result.newRange?.startLine}-${result.newRange?.endLine}` +
                TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'insert_after_symbol': {
        const namePath = isString(args?.name_path) ? args.name_path : '';
        const relativePath = isString(args?.relative_path) ? args.relative_path : '';
        const body = isString(args?.body) ? args.body : '';

        if (!namePath || !relativePath || !body) {
          throw new LanceContextError(
            'name_path, relative_path, and body are required',
            'validation',
            { tool: 'insert_after_symbol' }
          );
        }

        const editor = new SymbolEditor(PROJECT_PATH);
        const result = await editor.insertAfterSymbol({ namePath, relativePath, body });

        if (!result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to insert after symbol: ${result.error}` + TOOL_GUIDANCE,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text:
                `Content inserted after "${result.symbolName}" in ${result.filepath}.\n` +
                `Inserted at: lines ${result.newRange?.startLine}-${result.newRange?.endLine}` +
                TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'rename_symbol': {
        const namePath = isString(args?.name_path) ? args.name_path : '';
        const relativePath = isString(args?.relative_path) ? args.relative_path : '';
        const newName = isString(args?.new_name) ? args.new_name : '';
        const dryRun = isBoolean(args?.dry_run) ? args.dry_run : false;

        if (!namePath || !relativePath || !newName) {
          throw new LanceContextError(
            'name_path, relative_path, and new_name are required',
            'validation',
            { tool: 'rename_symbol' }
          );
        }

        const renamer = new SymbolRenamer(PROJECT_PATH);
        const result = await renamer.renameSymbol({ namePath, relativePath, newName, dryRun });

        if (!result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to rename symbol: ${result.error}` + TOOL_GUIDANCE,
              },
            ],
            isError: true,
          };
        }

        const modeLabel = dryRun ? ' (dry run)' : '';
        return {
          content: [
            {
              type: 'text',
              text: formatRenameResult(result) + modeLabel + TOOL_GUIDANCE,
            },
          ],
        };
      }

      // --- Worktree Tools ---
      case 'create_worktree': {
        const shortName = isString(args?.short_name) ? args.short_name : '';

        if (!shortName) {
          throw new LanceContextError('short_name is required', 'validation', {
            tool: 'create_worktree',
          });
        }

        const worktreeManager = new WorktreeManager(PROJECT_PATH);
        const result = await worktreeManager.createWorktree({
          shortName,
          issueId: isString(args?.issue_id) ? args.issue_id : undefined,
          prefix: isString(args?.prefix)
            ? (args.prefix as 'feature' | 'fix' | 'refactor' | 'docs' | 'test')
            : undefined,
          baseBranch: isString(args?.base_branch) ? args.base_branch : undefined,
          installDeps: isBoolean(args?.install_deps) ? args.install_deps : true,
          packageManager: isString(args?.package_manager)
            ? (args.package_manager as 'npm' | 'yarn' | 'pnpm' | 'bun')
            : undefined,
        });

        if (!result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to create worktree: ${result.error}` + TOOL_GUIDANCE,
              },
            ],
            isError: true,
          };
        }

        const worktree = result.worktree;
        const parts: string[] = [];
        parts.push('## Worktree Created\n');
        parts.push(`**Name:** ${worktree?.name}`);
        parts.push(`**Path:** ${worktree?.path}`);
        parts.push(`**Branch:** ${worktree?.branch}`);

        if (result.depsInstalled !== undefined) {
          const depsStatus = result.depsInstalled ? 'installed' : 'skipped/failed';
          const timeInfo = result.depsInstallTime ? ` (${result.depsInstallTime}ms)` : '';
          parts.push(`**Dependencies:** ${depsStatus}${timeInfo}`);
        }

        parts.push('\n**Usage:** Spawn agent with `cwd: "' + (worktree?.path ?? '') + '"`');

        return {
          content: [
            {
              type: 'text',
              text: parts.join('\n') + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'list_worktrees': {
        const worktreeManager = new WorktreeManager(PROJECT_PATH);
        const result = await worktreeManager.listWorktrees();

        return {
          content: [
            {
              type: 'text',
              text: formatWorktreeList(result) + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'remove_worktree': {
        const worktreeName = isString(args?.name) ? args.name : '';

        if (!worktreeName) {
          throw new LanceContextError('name is required', 'validation', {
            tool: 'remove_worktree',
          });
        }

        const worktreeManager = new WorktreeManager(PROJECT_PATH);
        const result = await worktreeManager.removeWorktree({
          name: worktreeName,
          deleteBranch: isBoolean(args?.delete_branch) ? args.delete_branch : false,
          force: isBoolean(args?.force) ? args.force : false,
        });

        if (!result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to remove worktree: ${result.error}` + TOOL_GUIDANCE,
              },
            ],
            isError: true,
          };
        }

        const parts: string[] = [];
        parts.push('## Worktree Removed\n');
        parts.push(`**Name:** ${worktreeName}`);
        if (result.branch) {
          parts.push(`**Branch:** ${result.branch}`);
          parts.push(`**Branch deleted:** ${result.branchDeleted ? 'yes' : 'no'}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: parts.join('\n') + TOOL_GUIDANCE,
            },
          ],
        };
      }

      case 'worktree_status': {
        const worktreeName = isString(args?.name) ? args.name : '';

        if (!worktreeName) {
          throw new LanceContextError('name is required', 'validation', {
            tool: 'worktree_status',
          });
        }

        const worktreeManager = new WorktreeManager(PROJECT_PATH);
        const info = await worktreeManager.getWorktreeInfo(worktreeName);

        if (!info) {
          return {
            content: [
              {
                type: 'text',
                text: `Worktree "${worktreeName}" not found.` + TOOL_GUIDANCE,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: formatWorktreeInfo(info) + TOOL_GUIDANCE,
            },
          ],
        };
      }

      default:
        throw new LanceContextError(`Unknown tool: ${name}`, 'validation', { tool: name });
    }
  } catch (error) {
    // Log full error details server-side for debugging
    logError(error, name);

    return {
      content: [
        {
          type: 'text',
          text: formatErrorResponse(error),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  // Load config to check if dashboard is enabled
  const config = await getConfig();
  const dashboardConfig = getDashboardConfig(config);

  // Initialize the indexer eagerly so dashboard has data
  let indexer: Awaited<ReturnType<typeof getIndexer>> | null = null;
  try {
    indexer = await getIndexer();
  } catch (error) {
    console.error('[lance-context] Failed to initialize indexer:', error);
  }

  // Auto-index if project is not yet indexed
  if (indexer) {
    const status = await indexer.getStatus();
    if (!status.indexed) {
      console.error('[lance-context] Project not indexed, starting auto-index...');
      dashboardState.onIndexingStart();

      // Run indexing in background so server can start immediately
      indexer
        .indexCodebase(undefined, undefined, false, (progress) => {
          dashboardState.onProgress(progress);
        })
        .then((result) => {
          dashboardState.onIndexingComplete(result);
          console.error(
            `[lance-context] Auto-index complete: ${result.filesIndexed} files, ${result.chunksCreated} chunks`
          );
        })
        .catch((error) => {
          console.error('[lance-context] Auto-index failed:', error);
        });
    }
  }

  // Start dashboard if enabled
  if (dashboardConfig.enabled) {
    const dashboardPort = dashboardConfig.port || 24300;
    const portAvailable = await isPortAvailable(dashboardPort);

    if (!portAvailable) {
      // Another process is already running the dashboard
      console.error(`[lance-context] Dashboard already running on port ${dashboardPort}`);
    } else {
      try {
        const dashboard = await startDashboard({
          port: dashboardPort,
          config,
          projectPath: PROJECT_PATH,
        });
        console.error(`[lance-context] Dashboard started at ${dashboard.url}`);

        // Open dashboard in user's default browser if configured
        if (dashboardConfig.openBrowser) {
          openBrowser(dashboard.url, PROJECT_PATH);
        }
      } catch (error) {
        console.error('[lance-context] Failed to start dashboard:', error);
      }
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[lance-context] MCP server started');
}

/**
 * Gracefully shutdown the server and cleanup resources
 */
async function shutdown(signal: string): Promise<void> {
  console.error(`[lance-context] Received ${signal}, shutting down gracefully...`);

  try {
    // Stop the dashboard server
    await stopDashboard();
    console.error('[lance-context] Dashboard stopped');
  } catch (error) {
    console.error('[lance-context] Error stopping dashboard:', error);
  }

  // Close the MCP server connection
  try {
    await server.close();
    console.error('[lance-context] MCP server closed');
  } catch (error) {
    console.error('[lance-context] Error closing MCP server:', error);
  }

  process.exit(0);
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((error) => {
  console.error('[lance-context] Fatal error:', error);
  process.exit(1);
});
