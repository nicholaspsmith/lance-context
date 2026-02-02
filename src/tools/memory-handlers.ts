/**
 * Tool handlers for memory operations.
 */

import { MemoryManager, type MemoryInfo } from '../memory/index.js';
import type { ToolResponse } from './types.js';
import { createToolResponse } from './types.js';
import { isString } from '../utils/type-guards.js';
import { GlanceyError } from '../utils/errors.js';

/**
 * Interface for memory manager operations (for testability).
 */
export interface IMemoryManager {
  writeMemory(name: string, content: string): Promise<void>;
  readMemory(name: string): Promise<string>;
  listMemories(): Promise<MemoryInfo[]>;
  deleteMemory(name: string): Promise<void>;
  editMemory(
    name: string,
    needle: string,
    repl: string,
    mode: 'literal' | 'regex'
  ): Promise<{ matchCount: number }>;
}

/**
 * Context for memory tools.
 */
export interface MemoryToolContext {
  projectPath: string;
  toolGuidance: string;
  /** Optional memory manager instance (for testing). Uses MemoryManager if not provided. */
  memoryManager?: IMemoryManager;
}

/**
 * Get or create a memory manager instance.
 */
function getMemoryManager(context: MemoryToolContext): IMemoryManager {
  return context.memoryManager ?? new MemoryManager(context.projectPath);
}

/**
 * Arguments for write_memory tool.
 */
export interface WriteMemoryArgs {
  memoryFileName: string;
  content: string;
}

/**
 * Parse and validate write_memory arguments.
 */
export function parseWriteMemoryArgs(args: Record<string, unknown> | undefined): WriteMemoryArgs {
  const memoryFileName = isString(args?.memory_file_name) ? args.memory_file_name : '';
  const content = isString(args?.content) ? args.content : '';

  if (!memoryFileName || !content) {
    throw new GlanceyError('memory_file_name and content are required', 'validation', {
      tool: 'write_memory',
    });
  }

  return { memoryFileName, content };
}

/**
 * Handle write_memory tool.
 */
export async function handleWriteMemory(
  args: WriteMemoryArgs,
  context: MemoryToolContext
): Promise<ToolResponse> {
  const memoryManager = getMemoryManager(context);
  await memoryManager.writeMemory(args.memoryFileName, args.content);
  return createToolResponse(
    `Memory "${args.memoryFileName}" saved successfully.`,
    context.toolGuidance
  );
}

/**
 * Arguments for read_memory tool.
 */
export interface ReadMemoryArgs {
  memoryFileName: string;
}

/**
 * Parse and validate read_memory arguments.
 */
export function parseReadMemoryArgs(args: Record<string, unknown> | undefined): ReadMemoryArgs {
  const memoryFileName = isString(args?.memory_file_name) ? args.memory_file_name : '';

  if (!memoryFileName) {
    throw new GlanceyError('memory_file_name is required', 'validation', {
      tool: 'read_memory',
    });
  }

  return { memoryFileName };
}

/**
 * Handle read_memory tool.
 */
export async function handleReadMemory(
  args: ReadMemoryArgs,
  context: MemoryToolContext
): Promise<ToolResponse> {
  const memoryManager = getMemoryManager(context);
  const content = await memoryManager.readMemory(args.memoryFileName);
  return createToolResponse(
    `## Memory: ${args.memoryFileName}\n\n${content}`,
    context.toolGuidance
  );
}

/**
 * Format memory list for display.
 */
export function formatMemoryList(memories: MemoryInfo[]): string {
  if (memories.length === 0) {
    return 'No memories found.';
  }

  const header = `## Available Memories (${memories.length})\n\n`;
  const rows = memories.map((m) => {
    const sizeKb = (m.size / 1024).toFixed(1);
    const date = m.lastModified.toISOString().split('T')[0];
    return `- **${m.name}** (${sizeKb} KB, modified ${date})`;
  });

  return header + rows.join('\n');
}

/**
 * Handle list_memories tool.
 */
export async function handleListMemories(context: MemoryToolContext): Promise<ToolResponse> {
  const memoryManager = getMemoryManager(context);
  const memories = await memoryManager.listMemories();
  return createToolResponse(formatMemoryList(memories), context.toolGuidance);
}

/**
 * Arguments for delete_memory tool.
 */
export interface DeleteMemoryArgs {
  memoryFileName: string;
}

/**
 * Parse and validate delete_memory arguments.
 */
export function parseDeleteMemoryArgs(args: Record<string, unknown> | undefined): DeleteMemoryArgs {
  const memoryFileName = isString(args?.memory_file_name) ? args.memory_file_name : '';

  if (!memoryFileName) {
    throw new GlanceyError('memory_file_name is required', 'validation', {
      tool: 'delete_memory',
    });
  }

  return { memoryFileName };
}

/**
 * Handle delete_memory tool.
 */
export async function handleDeleteMemory(
  args: DeleteMemoryArgs,
  context: MemoryToolContext
): Promise<ToolResponse> {
  const memoryManager = getMemoryManager(context);
  await memoryManager.deleteMemory(args.memoryFileName);
  return createToolResponse(
    `Memory "${args.memoryFileName}" deleted successfully.`,
    context.toolGuidance
  );
}

/**
 * Arguments for edit_memory tool.
 */
export interface EditMemoryArgs {
  memoryFileName: string;
  needle: string;
  repl: string;
  mode: 'literal' | 'regex';
}

/**
 * Parse and validate edit_memory arguments.
 */
export function parseEditMemoryArgs(args: Record<string, unknown> | undefined): EditMemoryArgs {
  const memoryFileName = isString(args?.memory_file_name) ? args.memory_file_name : '';
  const needle = isString(args?.needle) ? args.needle : '';
  const repl = isString(args?.repl) ? args.repl : '';
  const mode = isString(args?.mode) ? args.mode : '';

  if (!memoryFileName || !needle || mode === '') {
    throw new GlanceyError('memory_file_name, needle, repl, and mode are required', 'validation', {
      tool: 'edit_memory',
    });
  }

  if (mode !== 'literal' && mode !== 'regex') {
    throw new GlanceyError('mode must be "literal" or "regex"', 'validation', {
      tool: 'edit_memory',
    });
  }

  return { memoryFileName, needle, repl, mode };
}

/**
 * Handle edit_memory tool.
 */
export async function handleEditMemory(
  args: EditMemoryArgs,
  context: MemoryToolContext
): Promise<ToolResponse> {
  const memoryManager = getMemoryManager(context);
  const result = await memoryManager.editMemory(
    args.memoryFileName,
    args.needle,
    args.repl,
    args.mode
  );
  return createToolResponse(
    `Memory "${args.memoryFileName}" edited. ${result.matchCount} replacement(s) made.`,
    context.toolGuidance
  );
}
