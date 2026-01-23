/**
 * Git worktree management for parallel agent isolation.
 *
 * Creates isolated workspaces in .git/agent-worktrees/ to allow multiple
 * agents to work simultaneously without file conflicts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  PackageManager,
  WorktreeInfo,
  CreateWorktreeOptions,
  CreateWorktreeResult,
  RemoveWorktreeOptions,
  RemoveWorktreeResult,
  ListWorktreesResult,
} from './types.js';

const execAsync = promisify(exec);

/**
 * Manages git worktrees for parallel agent isolation.
 */
export class WorktreeManager {
  private readonly projectPath: string;
  private readonly worktreesDir: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.worktreesDir = path.join(projectPath, '.git', 'agent-worktrees');
  }

  /**
   * Ensure the worktrees directory exists.
   */
  private async ensureWorktreesDir(): Promise<void> {
    if (!fs.existsSync(this.worktreesDir)) {
      fs.mkdirSync(this.worktreesDir, { recursive: true });
    }
  }

  /**
   * Generate a worktree name from options.
   */
  private generateName(options: CreateWorktreeOptions): string {
    if (options.issueId) {
      return `${options.issueId}-${options.shortName}`;
    }
    return options.shortName;
  }

  /**
   * Generate a branch name from options.
   */
  private generateBranchName(options: CreateWorktreeOptions): string {
    const prefix = options.prefix || 'feature';
    const name = this.generateName(options);
    return `${prefix}/${name}`;
  }

  /**
   * Detect the package manager used in a directory.
   */
  async detectPackageManager(dir: string): Promise<PackageManager | null> {
    // Check for lock files in order of preference
    const lockFiles: Array<{ file: string; manager: PackageManager }> = [
      { file: 'bun.lockb', manager: 'bun' },
      { file: 'pnpm-lock.yaml', manager: 'pnpm' },
      { file: 'yarn.lock', manager: 'yarn' },
      { file: 'package-lock.json', manager: 'npm' },
    ];

    for (const { file, manager } of lockFiles) {
      if (fs.existsSync(path.join(dir, file))) {
        return manager;
      }
    }

    // Check if package.json exists at all
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return 'npm'; // Default to npm if package.json exists but no lock file
    }

    return null;
  }

  /**
   * Install dependencies in a directory.
   */
  async installDependencies(
    dir: string,
    packageManager?: PackageManager
  ): Promise<{ success: boolean; time: number; error?: string }> {
    const startTime = Date.now();

    const manager = packageManager || (await this.detectPackageManager(dir));
    if (!manager) {
      return { success: true, time: 0 }; // No package.json, nothing to install
    }

    const commands: Record<PackageManager, string> = {
      npm: 'npm install',
      yarn: 'yarn install',
      pnpm: 'pnpm install',
      bun: 'bun install',
    };

    try {
      await execAsync(commands[manager], {
        cwd: dir,
        env: { ...process.env, CI: 'true' }, // Suppress interactive prompts
      });
      return { success: true, time: Date.now() - startTime };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, time: Date.now() - startTime, error: message };
    }
  }

  /**
   * Get the current branch name.
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: this.projectPath });
      return stdout.trim() || 'main';
    } catch {
      return 'main';
    }
  }

  /**
   * Get the default base branch (main or master).
   */
  async getDefaultBaseBranch(): Promise<string> {
    try {
      // Check if main exists
      await execAsync('git rev-parse --verify main', { cwd: this.projectPath });
      return 'main';
    } catch {
      try {
        // Check if master exists
        await execAsync('git rev-parse --verify master', { cwd: this.projectPath });
        return 'master';
      } catch {
        // Default to whatever the current branch is
        return this.getCurrentBranch();
      }
    }
  }

  /**
   * Check if a branch exists.
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      await execAsync(`git rev-parse --verify ${branchName}`, { cwd: this.projectPath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new worktree for isolated agent work.
   */
  async createWorktree(options: CreateWorktreeOptions): Promise<CreateWorktreeResult> {
    await this.ensureWorktreesDir();

    const name = this.generateName(options);
    const worktreePath = path.join(this.worktreesDir, name);
    const branchName = this.generateBranchName(options);

    // Check if worktree already exists
    if (fs.existsSync(worktreePath)) {
      return {
        success: false,
        error: `Worktree "${name}" already exists at ${worktreePath}`,
      };
    }

    // Check if branch already exists
    if (await this.branchExists(branchName)) {
      return {
        success: false,
        error: `Branch "${branchName}" already exists. Use a different short_name or issue_id.`,
      };
    }

    // Determine base branch
    const baseBranch = options.baseBranch || (await this.getDefaultBaseBranch());

    try {
      // Create worktree with a new branch
      await execAsync(`git worktree add -b ${branchName} "${worktreePath}" ${baseBranch}`, {
        cwd: this.projectPath,
      });

      // Get worktree info
      const info = await this.getWorktreeInfo(name);
      if (!info) {
        return {
          success: false,
          error: 'Worktree created but failed to get info',
        };
      }

      // Install dependencies if requested (default: true)
      let depsInstalled = false;
      let depsInstallTime: number | undefined;

      if (options.installDeps !== false) {
        const installResult = await this.installDependencies(worktreePath, options.packageManager);
        depsInstalled = installResult.success;
        depsInstallTime = installResult.time;

        if (!installResult.success) {
          // Don't fail the worktree creation, just note the issue
          console.error(`[worktree] Dependency installation failed: ${installResult.error}`);
        }
      }

      return {
        success: true,
        worktree: info,
        depsInstalled,
        depsInstallTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to create worktree: ${message}`,
      };
    }
  }

  /**
   * Get information about a specific worktree.
   */
  async getWorktreeInfo(name: string): Promise<WorktreeInfo | null> {
    const worktreePath = path.join(this.worktreesDir, name);

    if (!fs.existsSync(worktreePath)) {
      return null;
    }

    try {
      // Get branch name
      const { stdout: branchOutput } = await execAsync('git branch --show-current', {
        cwd: worktreePath,
      });
      const branch = branchOutput.trim();

      // Get current commit (short hash)
      const { stdout: commitOutput } = await execAsync('git rev-parse --short HEAD', {
        cwd: worktreePath,
      });
      const commit = commitOutput.trim();

      // Check if dirty (uncommitted changes)
      let dirty = false;
      try {
        const { stdout: statusOutput } = await execAsync('git status --porcelain', {
          cwd: worktreePath,
        });
        dirty = statusOutput.trim().length > 0;
      } catch {
        dirty = false;
      }

      // Get ahead/behind count relative to origin
      let ahead = 0;
      let behind = 0;
      try {
        // Get the default base branch for comparison
        const baseBranch = await this.getDefaultBaseBranch();
        const { stdout: aheadBehindOutput } = await execAsync(
          `git rev-list --left-right --count ${baseBranch}...HEAD`,
          { cwd: worktreePath }
        );
        const [behindStr, aheadStr] = aheadBehindOutput.trim().split('\t');
        behind = parseInt(behindStr, 10) || 0;
        ahead = parseInt(aheadStr, 10) || 0;
      } catch {
        // Ignore errors - ahead/behind may not be available
      }

      // Get creation time from directory stat
      let createdAt: Date | undefined;
      try {
        const stats = fs.statSync(worktreePath);
        createdAt = stats.birthtime;
      } catch {
        // Ignore
      }

      return {
        name,
        path: worktreePath,
        branch,
        commit,
        valid: true,
        dirty,
        ahead,
        behind,
        createdAt,
      };
    } catch {
      // Worktree exists but git commands failed - may be in invalid state
      return {
        name,
        path: worktreePath,
        branch: '',
        commit: '',
        valid: false,
        dirty: false,
        ahead: 0,
        behind: 0,
      };
    }
  }

  /**
   * List all agent worktrees.
   */
  async listWorktrees(): Promise<ListWorktreesResult> {
    if (!fs.existsSync(this.worktreesDir)) {
      return { worktrees: [], count: 0 };
    }

    const entries = fs.readdirSync(this.worktreesDir, { withFileTypes: true });
    const worktrees: WorktreeInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const info = await this.getWorktreeInfo(entry.name);
        if (info) {
          worktrees.push(info);
        }
      }
    }

    // Sort by creation time (newest first)
    worktrees.sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return b.createdAt.getTime() - a.createdAt.getTime();
      }
      return a.name.localeCompare(b.name);
    });

    return { worktrees, count: worktrees.length };
  }

  /**
   * Remove a worktree.
   */
  async removeWorktree(options: RemoveWorktreeOptions): Promise<RemoveWorktreeResult> {
    const worktreePath = path.join(this.worktreesDir, options.name);

    if (!fs.existsSync(worktreePath)) {
      return {
        success: false,
        error: `Worktree "${options.name}" does not exist`,
      };
    }

    // Get info before removal to know the branch name
    const info = await this.getWorktreeInfo(options.name);
    const branchName = info?.branch;

    // Check if dirty and force not specified
    if (info?.dirty && !options.force) {
      return {
        success: false,
        branch: branchName,
        error: `Worktree "${options.name}" has uncommitted changes. Use force=true to remove anyway.`,
      };
    }

    try {
      // Remove the worktree
      const forceFlag = options.force ? '--force' : '';
      await execAsync(`git worktree remove ${forceFlag} "${worktreePath}"`, {
        cwd: this.projectPath,
      });

      // Optionally delete the branch
      let branchDeleted = false;
      if (options.deleteBranch && branchName) {
        try {
          await execAsync(`git branch -D ${branchName}`, { cwd: this.projectPath });
          branchDeleted = true;
        } catch (error) {
          // Branch deletion failed - not critical
          console.error(`[worktree] Failed to delete branch ${branchName}:`, error);
        }
      }

      return {
        success: true,
        branch: branchName,
        branchDeleted,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        branch: branchName,
        error: `Failed to remove worktree: ${message}`,
      };
    }
  }

  /**
   * Prune stale worktree entries from git.
   */
  async pruneWorktrees(): Promise<void> {
    await execAsync('git worktree prune', { cwd: this.projectPath });
  }
}

/**
 * Format worktree info for display.
 */
export function formatWorktreeInfo(info: WorktreeInfo): string {
  const parts: string[] = [];

  parts.push(`## Worktree: ${info.name}`);
  parts.push(`**Path:** ${info.path}`);
  parts.push(`**Branch:** ${info.branch}`);
  parts.push(`**Commit:** ${info.commit}`);
  parts.push(`**Status:** ${info.valid ? (info.dirty ? 'dirty' : 'clean') : 'invalid'}`);

  if (info.ahead > 0 || info.behind > 0) {
    parts.push(`**Ahead/Behind:** +${info.ahead}/-${info.behind}`);
  }

  if (info.createdAt) {
    parts.push(`**Created:** ${info.createdAt.toISOString()}`);
  }

  return parts.join('\n');
}

/**
 * Format list of worktrees for display.
 */
export function formatWorktreeList(result: ListWorktreesResult): string {
  if (result.count === 0) {
    return 'No agent worktrees found.';
  }

  const parts: string[] = [];
  parts.push(`Found ${result.count} worktree(s):\n`);

  for (const wt of result.worktrees) {
    const status = wt.valid ? (wt.dirty ? '(dirty)' : '(clean)') : '(invalid)';
    const aheadBehind = wt.ahead > 0 || wt.behind > 0 ? ` [+${wt.ahead}/-${wt.behind}]` : '';
    parts.push(`- **${wt.name}** on \`${wt.branch}\` ${status}${aheadBehind}`);
    parts.push(`  Path: ${wt.path}`);
  }

  return parts.join('\n');
}
