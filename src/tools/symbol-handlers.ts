/**
 * Tool handlers for symbol analysis and editing operations.
 */

import * as fs from 'fs';
import * as path from 'path';
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
  type Symbol as SymbolType,
  type SymbolsOverview,
  type EditResult,
} from '../symbols/index.js';
import type { ToolResponse } from './types.js';
import { createToolResponse } from './types.js';
import { isString, isNumber, isBoolean } from '../utils/type-guards.js';
import { LanceContextError } from '../utils/errors.js';
import { dashboardState } from '../dashboard/state.js';

/**
 * Context for symbol tools.
 */
export interface SymbolToolContext {
  projectPath: string;
  toolGuidance: string;
}

// ============================================================================
// get_symbols_overview
// ============================================================================

/**
 * Arguments for get_symbols_overview tool.
 */
export interface GetSymbolsOverviewArgs {
  relativePath: string;
  depth?: number;
}

/**
 * Parse and validate get_symbols_overview arguments.
 */
export function parseGetSymbolsOverviewArgs(
  args: Record<string, unknown> | undefined
): GetSymbolsOverviewArgs {
  const relativePath = isString(args?.relative_path) ? args.relative_path : '';
  if (!relativePath) {
    throw new LanceContextError('relative_path is required', 'validation', {
      tool: 'get_symbols_overview',
    });
  }

  return {
    relativePath,
    depth: isNumber(args?.depth) ? args.depth : 0,
  };
}

/**
 * Format symbols overview for display.
 */
export function formatSymbolsOverview(overview: SymbolsOverview): string {
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

  return parts.join('\n');
}

/**
 * Handle get_symbols_overview tool.
 */
export async function handleGetSymbolsOverview(
  args: GetSymbolsOverviewArgs,
  context: SymbolToolContext
): Promise<ToolResponse> {
  const extractor = new SymbolExtractor(context.projectPath);
  const overview = await extractor.getSymbolsOverview(args.relativePath, args.depth ?? 0);
  const formatted = formatSymbolsOverview(overview);

  // Track token savings (optional)
  try {
    const estimatedFileLines = Math.max(100, overview.totalSymbols * 15); // ~15 lines per symbol on average
    dashboardState.getTokenTracker().recordSymbolsOverview(formatted.length, estimatedFileLines);
  } catch {
    // Token tracking not available
  }

  return createToolResponse(formatted, context.toolGuidance);
}

// ============================================================================
// find_symbol
// ============================================================================

/**
 * Arguments for find_symbol tool.
 */
export interface FindSymbolArgs {
  namePathPattern: string;
  relativePath?: string;
  depth?: number;
  includeBody?: boolean;
  substringMatching?: boolean;
  includeKinds?: SymbolKind[];
  excludeKinds?: SymbolKind[];
}

/**
 * Parse and validate find_symbol arguments.
 */
export function parseFindSymbolArgs(args: Record<string, unknown> | undefined): FindSymbolArgs {
  const namePathPattern = isString(args?.name_path_pattern) ? args.name_path_pattern : '';
  if (!namePathPattern) {
    throw new LanceContextError('name_path_pattern is required', 'validation', {
      tool: 'find_symbol',
    });
  }

  return {
    namePathPattern,
    relativePath: isString(args?.relative_path) ? args.relative_path : undefined,
    depth: isNumber(args?.depth) ? args.depth : 0,
    includeBody: isBoolean(args?.include_body) ? args.include_body : false,
    substringMatching: isBoolean(args?.substring_matching) ? args.substring_matching : false,
    includeKinds: Array.isArray(args?.include_kinds)
      ? (args.include_kinds as SymbolKind[])
      : undefined,
    excludeKinds: Array.isArray(args?.exclude_kinds)
      ? (args.exclude_kinds as SymbolKind[])
      : undefined,
  };
}

/**
 * Code file extensions to search.
 */
const CODE_EXTENSIONS = [
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

/**
 * Get files to search for symbols.
 */
export async function getFilesToSearch(
  projectPath: string,
  relativePath?: string
): Promise<string[]> {
  const files: string[] = [];
  const { glob: globFn } = await import('glob');

  if (relativePath) {
    const fullPath = path.join(projectPath, relativePath);
    try {
      const fsStat = fs.statSync(fullPath);
      if (fsStat.isFile()) {
        files.push(relativePath);
      } else {
        // Directory - find all analyzable files
        for (const ext of CODE_EXTENSIONS) {
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
    // Search whole codebase
    for (const ext of CODE_EXTENSIONS) {
      const matches = await globFn(`**/${ext}`, {
        cwd: projectPath,
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
      });
      files.push(...matches);
    }
  }

  return files;
}

/**
 * Format matched symbols for display.
 */
export function formatMatchedSymbols(
  matchedSymbols: Array<{ symbol: SymbolType; file: string }>,
  namePathPattern: string
): string {
  if (matchedSymbols.length === 0) {
    return `No symbols found matching pattern: ${namePathPattern}`;
  }

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

  return parts.join('\n');
}

/**
 * Handle find_symbol tool.
 */
export async function handleFindSymbol(
  args: FindSymbolArgs,
  context: SymbolToolContext
): Promise<ToolResponse> {
  const extractor = new SymbolExtractor(context.projectPath);
  const files = await getFilesToSearch(context.projectPath, args.relativePath);

  // Parse the pattern
  const pattern = parseNamePath(args.namePathPattern);

  // Find matching symbols
  const matchedSymbols: Array<{ symbol: SymbolType; file: string }> = [];

  for (const file of files.slice(0, 100)) {
    // Limit to prevent timeout
    try {
      const symbols = await extractor.extractSymbols(file, args.includeBody ?? false);
      const findMatches = (syms: SymbolType[], currentDepth: number) => {
        for (const sym of syms) {
          // Apply kind filters
          if (args.excludeKinds && args.excludeKinds.includes(sym.kind)) continue;
          if (args.includeKinds && !args.includeKinds.includes(sym.kind)) continue;

          if (matchNamePath(sym.namePath, pattern, args.substringMatching ?? false)) {
            matchedSymbols.push({ symbol: sym, file });
          }

          // Search children up to requested depth
          if (currentDepth < (args.depth ?? 0) && sym.children) {
            findMatches(sym.children, currentDepth + 1);
          }
        }
      };
      findMatches(symbols, 0);
    } catch {
      // Skip files that can't be analyzed
    }
  }

  return createToolResponse(
    formatMatchedSymbols(matchedSymbols, args.namePathPattern),
    context.toolGuidance
  );
}

// ============================================================================
// find_referencing_symbols
// ============================================================================

/**
 * Arguments for find_referencing_symbols tool.
 */
export interface FindReferencingSymbolsArgs {
  namePath: string;
  relativePath: string;
  includeInfo?: boolean;
  includeKinds?: SymbolKind[];
  excludeKinds?: SymbolKind[];
}

/**
 * Parse and validate find_referencing_symbols arguments.
 */
export function parseFindReferencingSymbolsArgs(
  args: Record<string, unknown> | undefined
): FindReferencingSymbolsArgs {
  const namePath = isString(args?.name_path) ? args.name_path : '';
  const relativePath = isString(args?.relative_path) ? args.relative_path : '';

  if (!namePath || !relativePath) {
    throw new LanceContextError('name_path and relative_path are required', 'validation', {
      tool: 'find_referencing_symbols',
    });
  }

  return {
    namePath,
    relativePath,
    includeInfo: isBoolean(args?.include_info) ? args.include_info : false,
    includeKinds: Array.isArray(args?.include_kinds)
      ? (args.include_kinds as SymbolKind[])
      : undefined,
    excludeKinds: Array.isArray(args?.exclude_kinds)
      ? (args.exclude_kinds as SymbolKind[])
      : undefined,
  };
}

/**
 * Handle find_referencing_symbols tool.
 */
export async function handleFindReferencingSymbols(
  args: FindReferencingSymbolsArgs,
  context: SymbolToolContext
): Promise<ToolResponse> {
  const finder = new ReferenceFinder(context.projectPath);
  const references = await finder.findReferences({
    namePath: args.namePath,
    relativePath: args.relativePath,
    includeInfo: args.includeInfo,
    includeKinds: args.includeKinds,
    excludeKinds: args.excludeKinds,
  });

  return createToolResponse(formatReferencesResult(references), context.toolGuidance);
}

// ============================================================================
// search_for_pattern
// ============================================================================

/**
 * Arguments for search_for_pattern tool.
 */
export interface SearchForPatternArgs {
  substringPattern: string;
  relativePath?: string;
  restrictSearchToCodeFiles?: boolean;
  pathsIncludeGlob?: string;
  pathsExcludeGlob?: string;
  contextLinesBefore?: number;
  contextLinesAfter?: number;
  maxAnswerChars?: number;
}

/**
 * Parse and validate search_for_pattern arguments.
 */
export function parseSearchForPatternArgs(
  args: Record<string, unknown> | undefined
): SearchForPatternArgs {
  const substringPattern = isString(args?.substring_pattern) ? args.substring_pattern : '';
  if (!substringPattern) {
    throw new LanceContextError('substring_pattern is required', 'validation', {
      tool: 'search_for_pattern',
    });
  }

  return {
    substringPattern,
    relativePath: isString(args?.relative_path) ? args.relative_path : undefined,
    restrictSearchToCodeFiles: isBoolean(args?.restrict_search_to_code_files)
      ? args.restrict_search_to_code_files
      : false,
    pathsIncludeGlob: isString(args?.paths_include_glob) ? args.paths_include_glob : undefined,
    pathsExcludeGlob: isString(args?.paths_exclude_glob) ? args.paths_exclude_glob : undefined,
    contextLinesBefore: isNumber(args?.context_lines_before) ? args.context_lines_before : 0,
    contextLinesAfter: isNumber(args?.context_lines_after) ? args.context_lines_after : 0,
    maxAnswerChars: isNumber(args?.max_answer_chars) ? args.max_answer_chars : 50000,
  };
}

/**
 * Handle search_for_pattern tool.
 */
export async function handleSearchForPattern(
  args: SearchForPatternArgs,
  context: SymbolToolContext
): Promise<ToolResponse> {
  const result = await searchForPattern(context.projectPath, {
    substringPattern: args.substringPattern,
    relativePath: args.relativePath,
    restrictSearchToCodeFiles: args.restrictSearchToCodeFiles,
    pathsIncludeGlob: args.pathsIncludeGlob,
    pathsExcludeGlob: args.pathsExcludeGlob,
    contextLinesBefore: args.contextLinesBefore,
    contextLinesAfter: args.contextLinesAfter,
    maxAnswerChars: args.maxAnswerChars,
  });

  return createToolResponse(formatPatternSearchResults(result), context.toolGuidance);
}

// ============================================================================
// Symbol Editing: replace_symbol_body
// ============================================================================

/**
 * Arguments for replace_symbol_body tool.
 */
export interface ReplaceSymbolBodyArgs {
  namePath: string;
  relativePath: string;
  body: string;
}

/**
 * Parse and validate replace_symbol_body arguments.
 */
export function parseReplaceSymbolBodyArgs(
  args: Record<string, unknown> | undefined
): ReplaceSymbolBodyArgs {
  const namePath = isString(args?.name_path) ? args.name_path : '';
  const relativePath = isString(args?.relative_path) ? args.relative_path : '';
  const body = isString(args?.body) ? args.body : '';

  if (!namePath || !relativePath || !body) {
    throw new LanceContextError('name_path, relative_path, and body are required', 'validation', {
      tool: 'replace_symbol_body',
    });
  }

  return { namePath, relativePath, body };
}

/**
 * Format symbol edit result for display.
 */
export function formatSymbolEditResult(result: EditResult, operation: string): string {
  if (!result.success) {
    return `Failed to ${operation}: ${result.error}`;
  }

  return (
    `Symbol "${result.symbolName}" ${operation} in ${result.filepath}.\n` +
    `New location: lines ${result.newRange?.startLine}-${result.newRange?.endLine}`
  );
}

/**
 * Handle replace_symbol_body tool.
 */
export async function handleReplaceSymbolBody(
  args: ReplaceSymbolBodyArgs,
  context: SymbolToolContext
): Promise<ToolResponse> {
  const editor = new SymbolEditor(context.projectPath);
  const result = await editor.replaceSymbolBody({
    namePath: args.namePath,
    relativePath: args.relativePath,
    body: args.body,
  });

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to replace symbol: ${result.error}` + context.toolGuidance,
        },
      ],
      isError: true,
    };
  }

  return createToolResponse(formatSymbolEditResult(result, 'replaced'), context.toolGuidance);
}

// ============================================================================
// Symbol Editing: insert_before_symbol
// ============================================================================

/**
 * Arguments for insert_before_symbol tool.
 */
export interface InsertBeforeSymbolArgs {
  namePath: string;
  relativePath: string;
  body: string;
}

/**
 * Parse and validate insert_before_symbol arguments.
 */
export function parseInsertBeforeSymbolArgs(
  args: Record<string, unknown> | undefined
): InsertBeforeSymbolArgs {
  const namePath = isString(args?.name_path) ? args.name_path : '';
  const relativePath = isString(args?.relative_path) ? args.relative_path : '';
  const body = isString(args?.body) ? args.body : '';

  if (!namePath || !relativePath || !body) {
    throw new LanceContextError('name_path, relative_path, and body are required', 'validation', {
      tool: 'insert_before_symbol',
    });
  }

  return { namePath, relativePath, body };
}

/**
 * Handle insert_before_symbol tool.
 */
export async function handleInsertBeforeSymbol(
  args: InsertBeforeSymbolArgs,
  context: SymbolToolContext
): Promise<ToolResponse> {
  const editor = new SymbolEditor(context.projectPath);
  const result = await editor.insertBeforeSymbol({
    namePath: args.namePath,
    relativePath: args.relativePath,
    body: args.body,
  });

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to insert before symbol: ${result.error}` + context.toolGuidance,
        },
      ],
      isError: true,
    };
  }

  return createToolResponse(
    `Content inserted before "${result.symbolName}" in ${result.filepath}.\n` +
      `Inserted at: lines ${result.newRange?.startLine}-${result.newRange?.endLine}`,
    context.toolGuidance
  );
}

// ============================================================================
// Symbol Editing: insert_after_symbol
// ============================================================================

/**
 * Arguments for insert_after_symbol tool.
 */
export interface InsertAfterSymbolArgs {
  namePath: string;
  relativePath: string;
  body: string;
}

/**
 * Parse and validate insert_after_symbol arguments.
 */
export function parseInsertAfterSymbolArgs(
  args: Record<string, unknown> | undefined
): InsertAfterSymbolArgs {
  const namePath = isString(args?.name_path) ? args.name_path : '';
  const relativePath = isString(args?.relative_path) ? args.relative_path : '';
  const body = isString(args?.body) ? args.body : '';

  if (!namePath || !relativePath || !body) {
    throw new LanceContextError('name_path, relative_path, and body are required', 'validation', {
      tool: 'insert_after_symbol',
    });
  }

  return { namePath, relativePath, body };
}

/**
 * Handle insert_after_symbol tool.
 */
export async function handleInsertAfterSymbol(
  args: InsertAfterSymbolArgs,
  context: SymbolToolContext
): Promise<ToolResponse> {
  const editor = new SymbolEditor(context.projectPath);
  const result = await editor.insertAfterSymbol({
    namePath: args.namePath,
    relativePath: args.relativePath,
    body: args.body,
  });

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to insert after symbol: ${result.error}` + context.toolGuidance,
        },
      ],
      isError: true,
    };
  }

  return createToolResponse(
    `Content inserted after "${result.symbolName}" in ${result.filepath}.\n` +
      `Inserted at: lines ${result.newRange?.startLine}-${result.newRange?.endLine}`,
    context.toolGuidance
  );
}

// ============================================================================
// Symbol Editing: rename_symbol
// ============================================================================

/**
 * Arguments for rename_symbol tool.
 */
export interface RenameSymbolArgs {
  namePath: string;
  relativePath: string;
  newName: string;
  dryRun?: boolean;
}

/**
 * Parse and validate rename_symbol arguments.
 */
export function parseRenameSymbolArgs(args: Record<string, unknown> | undefined): RenameSymbolArgs {
  const namePath = isString(args?.name_path) ? args.name_path : '';
  const relativePath = isString(args?.relative_path) ? args.relative_path : '';
  const newName = isString(args?.new_name) ? args.new_name : '';

  if (!namePath || !relativePath || !newName) {
    throw new LanceContextError(
      'name_path, relative_path, and new_name are required',
      'validation',
      { tool: 'rename_symbol' }
    );
  }

  return {
    namePath,
    relativePath,
    newName,
    dryRun: isBoolean(args?.dry_run) ? args.dry_run : false,
  };
}

/**
 * Handle rename_symbol tool.
 */
export async function handleRenameSymbol(
  args: RenameSymbolArgs,
  context: SymbolToolContext
): Promise<ToolResponse> {
  const renamer = new SymbolRenamer(context.projectPath);
  const result = await renamer.renameSymbol({
    namePath: args.namePath,
    relativePath: args.relativePath,
    newName: args.newName,
    dryRun: args.dryRun,
  });

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to rename symbol: ${result.error}` + context.toolGuidance,
        },
      ],
      isError: true,
    };
  }

  const modeLabel = args.dryRun ? ' (dry run)' : '';
  return createToolResponse(formatRenameResult(result) + modeLabel, context.toolGuidance);
}
