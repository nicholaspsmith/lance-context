/**
 * Tool handlers for search operations.
 */

import type { CodeChunk, SimilarCodeResult } from '../search/indexer.js';
import type { ToolContext, ToolResponse } from './types.js';
import { createToolResponse } from './types.js';
import { isString, isNumber, isStringArray } from '../utils/type-guards.js';
import { GlanceyError } from '../utils/errors.js';
import { dashboardState } from '../dashboard/state.js';

/**
 * Arguments for search_code tool.
 */
export interface SearchCodeArgs {
  query: string;
  limit?: number;
  pathPattern?: string;
  languages?: string[];
}

/**
 * Parse and validate search_code arguments.
 */
export function parseSearchCodeArgs(args: Record<string, unknown> | undefined): SearchCodeArgs {
  const query = isString(args?.query) ? args.query : '';
  if (!query) {
    throw new GlanceyError('query is required', 'validation', { tool: 'search_code' });
  }

  return {
    query,
    limit: isNumber(args?.limit) ? args.limit : 10,
    pathPattern: isString(args?.pathPattern) ? args.pathPattern : undefined,
    languages: isStringArray(args?.languages) ? args.languages : undefined,
  };
}

/**
 * Format search results for display.
 */
export function formatSearchResults(results: CodeChunk[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  return results
    .map((r, i) => {
      let header = `## Result ${i + 1}: ${r.filepath}:${r.startLine}-${r.endLine}`;
      if (r.symbolName) {
        const typeLabel = r.symbolType ? ` (${r.symbolType})` : '';
        header += `\n**Symbol:** \`${r.symbolName}\`${typeLabel}`;
      }
      return `${header}\n\`\`\`${r.language}\n${r.content}\n\`\`\``;
    })
    .join('\n\n');
}

/**
 * Handle search_code tool.
 */
export async function handleSearchCode(
  args: SearchCodeArgs,
  context: ToolContext
): Promise<ToolResponse> {
  const results = await context.indexer.search({
    query: args.query,
    limit: args.limit,
    pathPattern: args.pathPattern,
    languages: args.languages,
  });

  const formatted = formatSearchResults(results);

  // Track token savings (optional - may not be available in tests)
  try {
    const status = await context.indexer.getStatus();
    const charsReturned = formatted.length;
    const matchedFiles = new Set(results.map((r) => r.filepath)).size;
    dashboardState
      .getTokenTracker()
      .recordSearchCode(charsReturned, matchedFiles, status.fileCount ?? 0);
  } catch {
    // Token tracking not available, continue silently
  }

  return createToolResponse(formatted, context.toolGuidance);
}

/**
 * Arguments for search_similar tool.
 */
export interface SearchSimilarArgs {
  code?: string;
  filepath?: string;
  startLine?: number;
  endLine?: number;
  limit?: number;
  threshold?: number;
  excludeSelf?: boolean;
}

/**
 * Parse and validate search_similar arguments.
 */
export function parseSearchSimilarArgs(
  args: Record<string, unknown> | undefined
): SearchSimilarArgs {
  const code = isString(args?.code) ? args.code : undefined;
  const filepath = isString(args?.filepath) ? args.filepath : undefined;

  if (!code && !filepath) {
    throw new GlanceyError('Either code or filepath must be provided', 'validation', {
      tool: 'search_similar',
    });
  }

  return {
    code,
    filepath,
    startLine: isNumber(args?.startLine) ? args.startLine : undefined,
    endLine: isNumber(args?.endLine) ? args.endLine : undefined,
    limit: isNumber(args?.limit) ? args.limit : 10,
    threshold: isNumber(args?.threshold) ? args.threshold : undefined,
    excludeSelf: args?.excludeSelf !== false, // Default to true
  };
}

/**
 * Format similar code results for display.
 */
export function formatSimilarResults(results: SimilarCodeResult[]): string {
  if (results.length === 0) {
    return 'No similar code found.';
  }

  return results
    .map((r, i) => {
      let header = `## Similar ${i + 1}: ${r.filepath}:${r.startLine}-${r.endLine} (${(r.similarity * 100).toFixed(1)}% similar)`;
      if (r.symbolName) {
        const typeLabel = r.symbolType ? ` (${r.symbolType})` : '';
        header += `\n**Symbol:** \`${r.symbolName}\`${typeLabel}`;
      }
      return `${header}\n\`\`\`${r.language}\n${r.content}\n\`\`\``;
    })
    .join('\n\n');
}

/**
 * Handle search_similar tool.
 */
export async function handleSearchSimilar(
  args: SearchSimilarArgs,
  context: ToolContext
): Promise<ToolResponse> {
  const results = await context.indexer.searchSimilar({
    code: args.code,
    filepath: args.filepath,
    startLine: args.startLine,
    endLine: args.endLine,
    limit: args.limit,
    threshold: args.threshold,
    excludeSelf: args.excludeSelf,
  });

  const formatted = formatSimilarResults(results);

  // Track token savings (optional)
  try {
    dashboardState.getTokenTracker().recordSearchSimilar(formatted.length, results.length);
  } catch {
    // Token tracking not available
  }

  return createToolResponse(formatted, context.toolGuidance);
}
