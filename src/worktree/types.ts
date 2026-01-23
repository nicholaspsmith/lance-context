/**
 * Types and interfaces for git worktree management.
 * Enables parallel agent isolation through automatic worktree creation.
 */

/**
 * Branch prefix types that follow .claude/rules.md conventions.
 */
export type BranchPrefix = 'feature' | 'fix' | 'refactor' | 'docs' | 'test';

/**
 * Package manager types for dependency installation.
 */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/**
 * Information about a git worktree.
 */
export interface WorktreeInfo {
  /** Worktree name (directory name within .git/agent-worktrees/) */
  name: string;
  /** Full path to the worktree directory */
  path: string;
  /** Branch name the worktree is on */
  branch: string;
  /** Current HEAD commit hash (short) */
  commit: string;
  /** Whether the worktree is valid/exists */
  valid: boolean;
  /** Whether there are uncommitted changes */
  dirty: boolean;
  /** Number of commits ahead of base branch */
  ahead: number;
  /** Number of commits behind base branch */
  behind: number;
  /** Timestamp when the worktree was created */
  createdAt?: Date;
}

/**
 * Options for creating a new worktree.
 */
export interface CreateWorktreeOptions {
  /** Issue ID (e.g., "bd-123") - optional, used for naming */
  issueId?: string;
  /** Short descriptive name (e.g., "add-auth") - required */
  shortName: string;
  /** Branch prefix (default: "feature") */
  prefix?: BranchPrefix;
  /** Base branch to create from (default: current branch or main) */
  baseBranch?: string;
  /** Whether to install dependencies after creation (default: true) */
  installDeps?: boolean;
  /** Package manager to use (default: auto-detect) */
  packageManager?: PackageManager;
}

/**
 * Result from creating a worktree.
 */
export interface CreateWorktreeResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Worktree info if successful */
  worktree?: WorktreeInfo;
  /** Error message if failed */
  error?: string;
  /** Whether dependencies were installed */
  depsInstalled?: boolean;
  /** Time taken to install dependencies (ms) */
  depsInstallTime?: number;
}

/**
 * Options for removing a worktree.
 */
export interface RemoveWorktreeOptions {
  /** Worktree name to remove */
  name: string;
  /** Whether to also delete the branch (default: false) */
  deleteBranch?: boolean;
  /** Force removal even if dirty (default: false) */
  force?: boolean;
}

/**
 * Result from removing a worktree.
 */
export interface RemoveWorktreeResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Branch name that was associated */
  branch?: string;
  /** Whether the branch was deleted */
  branchDeleted?: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Result from listing worktrees.
 */
export interface ListWorktreesResult {
  /** List of worktrees */
  worktrees: WorktreeInfo[];
  /** Total count */
  count: number;
}
