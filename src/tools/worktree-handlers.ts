/**
 * Tool handlers for worktree operations.
 */

import {
  WorktreeManager,
  formatWorktreeInfo,
  formatWorktreeList,
  type WorktreeInfo,
  type CreateWorktreeResult,
  type RemoveWorktreeResult,
  type ListWorktreesResult,
} from '../worktree/index.js';
import type { ToolResponse } from './types.js';
import { createToolResponse } from './types.js';
import { isString, isBoolean } from '../utils/type-guards.js';
import { LanceContextError } from '../utils/errors.js';

/**
 * Interface for worktree manager operations (for testability).
 */
export interface IWorktreeManager {
  createWorktree(options: {
    shortName: string;
    issueId?: string;
    prefix?: 'feature' | 'fix' | 'refactor' | 'docs' | 'test';
    baseBranch?: string;
    installDeps?: boolean;
    packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  }): Promise<CreateWorktreeResult>;
  listWorktrees(): Promise<ListWorktreesResult>;
  removeWorktree(options: {
    name: string;
    deleteBranch?: boolean;
    force?: boolean;
  }): Promise<RemoveWorktreeResult>;
  getWorktreeInfo(name: string): Promise<WorktreeInfo | null>;
}

/**
 * Context for worktree tools.
 */
export interface WorktreeToolContext {
  projectPath: string;
  toolGuidance: string;
  /** Optional worktree manager instance (for testing). */
  worktreeManager?: IWorktreeManager;
}

/**
 * Get or create a worktree manager instance.
 */
function getWorktreeManager(context: WorktreeToolContext): IWorktreeManager {
  return context.worktreeManager ?? new WorktreeManager(context.projectPath);
}

/**
 * Arguments for create_worktree tool.
 */
export interface CreateWorktreeArgs {
  shortName: string;
  issueId?: string;
  prefix?: 'feature' | 'fix' | 'refactor' | 'docs' | 'test';
  baseBranch?: string;
  installDeps?: boolean;
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
}

/**
 * Parse and validate create_worktree arguments.
 */
export function parseCreateWorktreeArgs(
  args: Record<string, unknown> | undefined
): CreateWorktreeArgs {
  const shortName = isString(args?.short_name) ? args.short_name : '';
  if (!shortName) {
    throw new LanceContextError('short_name is required', 'validation', {
      tool: 'create_worktree',
    });
  }

  const prefix = isString(args?.prefix) ? args.prefix : undefined;
  const validPrefixes = ['feature', 'fix', 'refactor', 'docs', 'test'];
  if (prefix && !validPrefixes.includes(prefix)) {
    throw new LanceContextError(
      `prefix must be one of: ${validPrefixes.join(', ')}`,
      'validation',
      { tool: 'create_worktree' }
    );
  }

  const packageManager = isString(args?.package_manager) ? args.package_manager : undefined;
  const validPackageManagers = ['npm', 'yarn', 'pnpm', 'bun'];
  if (packageManager && !validPackageManagers.includes(packageManager)) {
    throw new LanceContextError(
      `package_manager must be one of: ${validPackageManagers.join(', ')}`,
      'validation',
      { tool: 'create_worktree' }
    );
  }

  return {
    shortName,
    issueId: isString(args?.issue_id) ? args.issue_id : undefined,
    prefix: prefix as CreateWorktreeArgs['prefix'],
    baseBranch: isString(args?.base_branch) ? args.base_branch : undefined,
    installDeps: isBoolean(args?.install_deps) ? args.install_deps : true,
    packageManager: packageManager as CreateWorktreeArgs['packageManager'],
  };
}

/**
 * Format worktree creation result.
 */
export function formatWorktreeCreationResult(result: CreateWorktreeResult): string {
  if (!result.success) {
    return `Failed to create worktree: ${result.error}`;
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

  return parts.join('\n');
}

/**
 * Handle create_worktree tool.
 */
export async function handleCreateWorktree(
  args: CreateWorktreeArgs,
  context: WorktreeToolContext
): Promise<ToolResponse> {
  const worktreeManager = getWorktreeManager(context);
  const result = await worktreeManager.createWorktree({
    shortName: args.shortName,
    issueId: args.issueId,
    prefix: args.prefix,
    baseBranch: args.baseBranch,
    installDeps: args.installDeps,
    packageManager: args.packageManager,
  });

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to create worktree: ${result.error}` + context.toolGuidance,
        },
      ],
      isError: true,
    };
  }

  return createToolResponse(formatWorktreeCreationResult(result), context.toolGuidance);
}

/**
 * Handle list_worktrees tool.
 */
export async function handleListWorktrees(context: WorktreeToolContext): Promise<ToolResponse> {
  const worktreeManager = getWorktreeManager(context);
  const result = await worktreeManager.listWorktrees();
  return createToolResponse(formatWorktreeList(result), context.toolGuidance);
}

/**
 * Arguments for remove_worktree tool.
 */
export interface RemoveWorktreeArgs {
  name: string;
  deleteBranch?: boolean;
  force?: boolean;
}

/**
 * Parse and validate remove_worktree arguments.
 */
export function parseRemoveWorktreeArgs(
  args: Record<string, unknown> | undefined
): RemoveWorktreeArgs {
  const name = isString(args?.name) ? args.name : '';
  if (!name) {
    throw new LanceContextError('name is required', 'validation', {
      tool: 'remove_worktree',
    });
  }

  return {
    name,
    deleteBranch: isBoolean(args?.delete_branch) ? args.delete_branch : false,
    force: isBoolean(args?.force) ? args.force : false,
  };
}

/**
 * Format worktree removal result.
 */
export function formatWorktreeRemovalResult(name: string, result: RemoveWorktreeResult): string {
  if (!result.success) {
    return `Failed to remove worktree: ${result.error}`;
  }

  const parts: string[] = [];
  parts.push('## Worktree Removed\n');
  parts.push(`**Name:** ${name}`);
  if (result.branch) {
    parts.push(`**Branch:** ${result.branch}`);
    parts.push(`**Branch deleted:** ${result.branchDeleted ? 'yes' : 'no'}`);
  }

  return parts.join('\n');
}

/**
 * Handle remove_worktree tool.
 */
export async function handleRemoveWorktree(
  args: RemoveWorktreeArgs,
  context: WorktreeToolContext
): Promise<ToolResponse> {
  const worktreeManager = getWorktreeManager(context);
  const result = await worktreeManager.removeWorktree({
    name: args.name,
    deleteBranch: args.deleteBranch,
    force: args.force,
  });

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to remove worktree: ${result.error}` + context.toolGuidance,
        },
      ],
      isError: true,
    };
  }

  return createToolResponse(formatWorktreeRemovalResult(args.name, result), context.toolGuidance);
}

/**
 * Arguments for worktree_status tool.
 */
export interface WorktreeStatusArgs {
  name: string;
}

/**
 * Parse and validate worktree_status arguments.
 */
export function parseWorktreeStatusArgs(
  args: Record<string, unknown> | undefined
): WorktreeStatusArgs {
  const name = isString(args?.name) ? args.name : '';
  if (!name) {
    throw new LanceContextError('name is required', 'validation', {
      tool: 'worktree_status',
    });
  }

  return { name };
}

/**
 * Handle worktree_status tool.
 */
export async function handleWorktreeStatus(
  args: WorktreeStatusArgs,
  context: WorktreeToolContext
): Promise<ToolResponse> {
  const worktreeManager = getWorktreeManager(context);
  const info = await worktreeManager.getWorktreeInfo(args.name);

  if (!info) {
    return {
      content: [
        {
          type: 'text',
          text: `Worktree "${args.name}" not found.` + context.toolGuidance,
        },
      ],
      isError: true,
    };
  }

  return createToolResponse(formatWorktreeInfo(info), context.toolGuidance);
}
