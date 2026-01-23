#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
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
        description: 'Search the codebase using natural language. Returns relevant code snippets.',
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
    'get_index_status',
    'clear_index',
    'get_project_instructions',
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
              text: `${mode}: Indexed ${result.filesIndexed} files, total ${result.chunksCreated} chunks.`,
            },
          ],
        };
      }

      case 'search_code': {
        const query = isString(args?.query) ? args.query : '';
        if (!query) {
          throw new Error('query is required');
        }
        const limit = isNumber(args?.limit) ? args.limit : 10;
        const results = await idx.search(query, limit);
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
              text: formatted || 'No results found.',
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
              text: JSON.stringify(status, null, 2),
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
              text: 'Index cleared.',
            },
          ],
        };
      }

      case 'get_project_instructions': {
        const config = await loadConfig(PROJECT_PATH);
        const instructions = getInstructions(config);
        return {
          content: [
            {
              type: 'text',
              text:
                instructions ||
                'No project instructions configured. Add an "instructions" field to .lance-context.json.',
            },
          ],
        };
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
