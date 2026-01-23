/**
 * Git worktree management module for parallel agent isolation.
 */

// Types
export type {
  BranchPrefix,
  PackageManager,
  WorktreeInfo,
  CreateWorktreeOptions,
  CreateWorktreeResult,
  RemoveWorktreeOptions,
  RemoveWorktreeResult,
  ListWorktreesResult,
} from './types.js';

// Manager
export { WorktreeManager, formatWorktreeInfo, formatWorktreeList } from './worktree-manager.js';
