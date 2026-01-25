/**
 * Common types for MCP tool handlers.
 */

import type { CodeIndexer } from '../search/indexer.js';

/**
 * Standard MCP tool response format.
 */
export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  /** Indicates an error response */
  isError?: boolean;
}

/**
 * Context passed to all tool handlers.
 */
export interface ToolContext {
  indexer: CodeIndexer;
  projectPath: string;
  toolGuidance: string;
}

/**
 * Generic tool handler function signature.
 */
export type ToolHandler<TArgs = Record<string, unknown>> = (
  args: TArgs,
  context: ToolContext
) => Promise<ToolResponse>;

/**
 * Helper to create a successful tool response.
 */
export function createToolResponse(text: string, guidance: string = ''): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: text + guidance,
      },
    ],
  };
}
