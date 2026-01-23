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
import { loadConfig, getInstructions, getDashboardConfig } from './config.js';
import {
  startDashboard,
  stopDashboard,
  dashboardState,
  isPortAvailable,
} from './dashboard/index.js';
import type { CommandName } from './dashboard/index.js';

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
      const backend = await createEmbeddingBackend();
      const idx = new CodeIndexer(PROJECT_PATH, backend);
      await idx.initialize();

      // Share indexer and config with dashboard state
      const config = await getConfig();
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

        // Notify dashboard of indexing start
        dashboardState.onIndexingStart();

        const result = await idx.indexCodebase(
          patterns,
          excludePatterns,
          forceReindex,
          (progress) => {
            // Emit progress events to dashboard
            dashboardState.onProgress(progress);
          }
        );

        // Notify dashboard of indexing completion
        dashboardState.onIndexingComplete(result);

        const mode = result.incremental ? 'Incremental update' : 'Full reindex';
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
          throw new Error('query is required');
        }
        const results = await idx.search({
          query,
          limit: isNumber(args?.limit) ? args.limit : 10,
          pathPattern: isString(args?.pathPattern) ? args.pathPattern : undefined,
          languages: isStringArray(args?.languages) ? args.languages : undefined,
        });
        const formatted = results
          .map(
            (r, i) =>
              `## Result ${i + 1}: ${r.filepath}:${r.startLine}-${r.endLine}\n\`\`\`${r.language}\n${r.content}\n\`\`\``
          )
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
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2) + TOOL_GUIDANCE,
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
          .map(
            (r, i) =>
              `## Similar ${i + 1}: ${r.filepath}:${r.startLine}-${r.endLine} (${(r.similarity * 100).toFixed(1)}% similar)\n\`\`\`${r.language}\n${r.content}\n\`\`\``
          )
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
          throw new Error('message is required');
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
            throw new Error(`Failed to stage files: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        // Check if there are staged changes
        try {
          const { stdout } = await execAsync('git diff --cached --name-only', {
            cwd: PROJECT_PATH,
          });
          if (!stdout.trim()) {
            throw new Error(
              'No staged changes to commit. Stage files first or pass files parameter.'
            );
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes('No staged changes')) {
            throw e;
          }
          throw new Error(
            `Failed to check staged changes: ${e instanceof Error ? e.message : String(e)}`
          );
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
          throw new Error(`Git commit failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
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
