/**
 * Tool handlers for clustering operations.
 */

import type { CodeIndexer, CodeChunk, CodebaseSummary } from '../search/indexer.js';
import type { ConceptCluster } from '../search/clustering.js';
import type { ToolResponse } from './types.js';
import { createToolResponse } from './types.js';
import { isNumber, isBoolean, isString } from '../utils/type-guards.js';
import { GlanceyError } from '../utils/errors.js';
import { dashboardState } from '../dashboard/state.js';

/**
 * Context for clustering tools.
 */
export interface ClusteringToolContext {
  indexer: CodeIndexer;
  toolGuidance: string;
}

/**
 * Arguments for summarize_codebase tool.
 */
export interface SummarizeCodebaseArgs {
  numClusters?: number;
}

/**
 * Parse and validate summarize_codebase arguments.
 */
export function parseSummarizeCodebaseArgs(
  args: Record<string, unknown> | undefined
): SummarizeCodebaseArgs {
  return {
    numClusters: isNumber(args?.numClusters) ? args.numClusters : undefined,
  };
}

/**
 * Format codebase summary for display.
 */
export function formatCodebaseSummary(summary: CodebaseSummary): string {
  const languageList = summary.languages
    .map((l) => `- **${l.language}**: ${l.fileCount} files, ${l.chunkCount} chunks`)
    .join('\n');

  const conceptList = summary.concepts
    .map((c) => {
      const keywords = c.keywords.slice(0, 5).join(', ');
      return `- **Cluster ${c.id}: ${c.label}** (${c.size} chunks)\n  Keywords: ${keywords}`;
    })
    .join('\n');

  return `# Codebase Summary

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
}

/**
 * Handle summarize_codebase tool.
 */
export async function handleSummarizeCodebase(
  args: SummarizeCodebaseArgs,
  context: ClusteringToolContext
): Promise<ToolResponse> {
  const summary = await context.indexer.summarizeCodebase(
    args.numClusters ? { numClusters: args.numClusters } : undefined
  );
  const formatted = formatCodebaseSummary(summary);

  // Track token savings (optional)
  try {
    const status = await context.indexer.getStatus();
    dashboardState
      .getTokenTracker()
      .recordSummarizeCodebase(formatted.length, status.fileCount ?? 0);
  } catch {
    // Token tracking not available
  }

  return createToolResponse(formatted, context.toolGuidance);
}

/**
 * Arguments for list_concepts tool.
 */
export interface ListConceptsArgs {
  forceRecluster?: boolean;
}

/**
 * Parse and validate list_concepts arguments.
 */
export function parseListConceptsArgs(args: Record<string, unknown> | undefined): ListConceptsArgs {
  return {
    forceRecluster: isBoolean(args?.forceRecluster) ? args.forceRecluster : false,
  };
}

/**
 * Format concept clusters for display.
 */
export function formatConceptClusters(concepts: ConceptCluster[]): string {
  if (concepts.length === 0) {
    return 'No concept clusters found. Make sure the codebase is indexed first.';
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

  return `# Concept Clusters\n\n${formatted}`;
}

/**
 * Handle list_concepts tool.
 */
export async function handleListConcepts(
  args: ListConceptsArgs,
  context: ClusteringToolContext
): Promise<ToolResponse> {
  const concepts = await context.indexer.listConcepts(args.forceRecluster ?? false);
  const formatted = formatConceptClusters(concepts);

  // Track token savings (optional)
  try {
    dashboardState.getTokenTracker().recordListConcepts(formatted.length, concepts.length);
  } catch {
    // Token tracking not available
  }

  return createToolResponse(formatted, context.toolGuidance);
}

/**
 * Arguments for search_by_concept tool.
 */
export interface SearchByConceptArgs {
  conceptId: number;
  query?: string;
  limit?: number;
}

/**
 * Parse and validate search_by_concept arguments.
 */
export function parseSearchByConceptArgs(
  args: Record<string, unknown> | undefined
): SearchByConceptArgs {
  const conceptId = isNumber(args?.conceptId) ? args.conceptId : -1;
  if (conceptId < 0) {
    throw new GlanceyError(
      'conceptId is required and must be a non-negative number',
      'validation',
      { tool: 'search_by_concept' }
    );
  }

  return {
    conceptId,
    query: isString(args?.query) ? args.query : undefined,
    limit: isNumber(args?.limit) ? args.limit : 10,
  };
}

/**
 * Format concept search results for display.
 */
export function formatConceptSearchResults(results: CodeChunk[], conceptId: number): string {
  if (results.length === 0) {
    return `No code found in concept cluster ${conceptId}. Try list_concepts to see available clusters.`;
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
 * Handle search_by_concept tool.
 */
export async function handleSearchByConcept(
  args: SearchByConceptArgs,
  context: ClusteringToolContext
): Promise<ToolResponse> {
  const results = await context.indexer.searchByConcept(
    args.conceptId,
    args.query,
    args.limit ?? 10
  );
  const formatted = formatConceptSearchResults(results, args.conceptId);

  // Track token savings (optional)
  try {
    dashboardState.getTokenTracker().recordSearchByConcept(formatted.length, results.length);
  } catch {
    // Token tracking not available
  }

  return createToolResponse(formatted, context.toolGuidance);
}
