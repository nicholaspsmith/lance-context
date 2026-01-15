#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createEmbeddingBackend } from './embeddings/index.js';
import { CodeIndexer } from './search/indexer.js';

const PROJECT_PATH = process.env.LANCE_CONTEXT_PROJECT || process.cwd();

let indexerPromise: Promise<CodeIndexer> | null = null;

async function getIndexer(): Promise<CodeIndexer> {
  if (!indexerPromise) {
    indexerPromise = (async () => {
      const backend = await createEmbeddingBackend();
      const idx = new CodeIndexer(PROJECT_PATH, backend);
      await idx.initialize();
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
              description: 'Force a full reindex, ignoring cached file modification times (default: false)',
            },
          },
        },
      },
      {
        name: 'search_code',
        description:
          'Search the codebase using natural language. Returns relevant code snippets.',
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
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const idx = await getIndexer();

    switch (name) {
      case 'index_codebase': {
        const patterns = (args?.patterns as string[]) || undefined;
        const excludePatterns = (args?.excludePatterns as string[]) || undefined;
        const forceReindex = (args?.forceReindex as boolean) || false;
        const result = await idx.indexCodebase(patterns, excludePatterns, forceReindex);
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
        const query = args?.query as string;
        const limit = (args?.limit as number) || 10;
        const results = await idx.search(query, limit);
        const formatted = results
          .map(
            (r, i) =>
              `## Result ${i + 1}: ${r.filePath}:${r.startLine}-${r.endLine}\n\`\`\`${r.language}\n${r.content}\n\`\`\``
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[lance-context] MCP server started');
}

main().catch((error) => {
  console.error('[lance-context] Fatal error:', error);
  process.exit(1);
});
