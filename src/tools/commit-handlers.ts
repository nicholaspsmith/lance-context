/**
 * Tool handlers for git commit operations.
 */

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import type { ToolResponse } from './types.js';
import { isString, isStringArray } from '../utils/type-guards.js';
import { GlanceyError, wrapError } from '../utils/errors.js';

const execAsync = promisify(exec);

/**
 * Commit rules reminder text.
 */
export const COMMIT_RULES = `
## Commit Rules Reminder

1. **Branch**: Must be on a feature branch, not main/master
2. **Message length**: Subject line must be ≤72 characters
3. **Imperative mood**: "Add feature" not "Added feature"
4. **Single responsibility**: One logical change per commit
5. **Body format**: Only "Co-Authored-By: Claude <noreply@anthropic.com>"

**Signs of multi-responsibility** (split into separate commits):
- Message contains "and" connecting actions
- Message lists multiple changes with commas
- Changes span unrelated files/features
`;

/**
 * Execute a git command safely using spawn with array arguments.
 */
export function gitSpawn(
  args: string[],
  options: { cwd: string; stdin?: string }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const exitCode = code ?? 1;
        const error = new Error(`git ${args[0]} failed with code ${exitCode}: ${stderr}`);
        (error as Error & { code: number; stdout: string; stderr: string }).code = exitCode;
        (error as Error & { code: number; stdout: string; stderr: string }).stdout = stdout;
        (error as Error & { code: number; stdout: string; stderr: string }).stderr = stderr;
        reject(error);
      }
    });

    if (options.stdin !== undefined) {
      proc.stdin.write(options.stdin);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }
  });
}

/**
 * Interface for git operations (for testability).
 */
export interface IGitOperations {
  getCurrentBranch(cwd: string): Promise<string>;
  stageFiles(cwd: string, files: string[]): Promise<void>;
  getStagedFiles(cwd: string): Promise<string[]>;
  commit(cwd: string, message: string): Promise<string>;
  unstageFiles(cwd: string, files: string[]): Promise<void>;
  writeMarkerFile(projectPath: string): void;
}

/**
 * Default git operations implementation.
 */
export const defaultGitOperations: IGitOperations = {
  async getCurrentBranch(cwd: string): Promise<string> {
    const { stdout } = await execAsync('git branch --show-current', { cwd });
    return stdout.trim();
  },

  async stageFiles(cwd: string, files: string[]): Promise<void> {
    await gitSpawn(['add', '--', ...files], { cwd });
  },

  async getStagedFiles(cwd: string): Promise<string[]> {
    const { stdout } = await gitSpawn(['diff', '--cached', '--name-only'], { cwd });
    return stdout.trim().split('\n').filter(Boolean);
  },

  async commit(cwd: string, message: string): Promise<string> {
    const fullMessage = `${message}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`;
    const { stdout } = await gitSpawn(['commit', '-F', '-'], { cwd, stdin: fullMessage });
    return stdout.trim();
  },

  async unstageFiles(cwd: string, files: string[]): Promise<void> {
    await gitSpawn(['reset', 'HEAD', '--', ...files], { cwd });
  },

  writeMarkerFile(projectPath: string): void {
    const markerPath = path.join(projectPath, '.git', 'MCP_COMMIT_MARKER');
    try {
      fs.writeFileSync(markerPath, Date.now().toString());
    } catch {
      // Ignore marker write failures - non-critical
    }
  },
};

/**
 * Context for commit tools.
 */
export interface CommitToolContext {
  projectPath: string;
  /** Optional git operations (for testing). */
  gitOperations?: IGitOperations;
}

/**
 * Get git operations instance.
 */
function getGitOperations(context: CommitToolContext): IGitOperations {
  return context.gitOperations ?? defaultGitOperations;
}

/**
 * Arguments for commit tool.
 */
export interface CommitArgs {
  message: string;
  files?: string[];
}

/**
 * Parse and validate commit arguments.
 */
export function parseCommitArgs(args: Record<string, unknown> | undefined): CommitArgs {
  const message = isString(args?.message) ? args.message : '';
  const files = isStringArray(args?.files) ? args.files : [];

  if (!message) {
    throw new GlanceyError('message is required', 'validation', { tool: 'commit' });
  }

  return { message, files };
}

/**
 * Validation result for commit message.
 */
export interface CommitValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate commit message and branch.
 */
export async function validateCommit(
  message: string,
  context: CommitToolContext
): Promise<CommitValidationResult> {
  const git = getGitOperations(context);
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: Not on main/master branch
  try {
    const currentBranch = await git.getCurrentBranch(context.projectPath);
    if (currentBranch === 'main' || currentBranch === 'master') {
      errors.push(
        `Cannot commit directly to ${currentBranch}. Create a feature branch first:\n  git checkout -b feature/your-feature-name`
      );
    }
  } catch {
    errors.push('Failed to determine current branch. Are you in a git repository?');
  }

  // Check 2: Message length
  const subjectLine = message.split('\n')[0];
  if (subjectLine.length > 72) {
    errors.push(`Subject line is ${subjectLine.length} characters (max 72). Shorten it.`);
  }

  // Check 3: Imperative mood (heuristic)
  const pastTensePatterns =
    /^(Added|Fixed|Updated|Changed|Removed|Implemented|Created|Deleted|Modified|Refactored|Merged)\b/i;
  if (pastTensePatterns.test(subjectLine)) {
    warnings.push(
      `Subject may not be imperative mood. Use "Add" not "Added", "Fix" not "Fixed", etc.`
    );
  }

  // Check 4: Single responsibility (heuristic)
  const multiResponsibilityPatterns =
    /\b(and|,)\s+(add|fix|update|change|remove|implement|create|delete|modify|refactor)\b/i;
  if (multiResponsibilityPatterns.test(subjectLine)) {
    errors.push(`Message suggests multiple responsibilities. Split into separate commits.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format validation errors for response.
 */
export function formatValidationErrors(errors: string[], warnings: string[]): string {
  let text = `## Commit Blocked\n\n**Errors:**\n${errors.map((e) => `- ${e}`).join('\n')}`;
  if (warnings.length > 0) {
    text += `\n\n**Warnings:**\n${warnings.map((w) => `- ${w}`).join('\n')}`;
  }
  text += `\n${COMMIT_RULES}`;
  return text;
}

/**
 * Format successful commit response.
 */
export function formatCommitSuccess(output: string, warnings: string[]): string {
  let response = `## Commit Successful\n\n${output}`;
  if (warnings.length > 0) {
    response += `\n\n**Warnings:**\n${warnings.map((w) => `- ${w}`).join('\n')}`;
  }
  response += `\n${COMMIT_RULES}`;
  return response;
}

/**
 * Handle commit tool.
 */
export async function handleCommit(
  args: CommitArgs,
  context: CommitToolContext
): Promise<ToolResponse> {
  const git = getGitOperations(context);

  // Validate commit message and branch
  const validation = await validateCommit(args.message, context);
  if (!validation.valid) {
    return {
      content: [
        {
          type: 'text',
          text: formatValidationErrors(validation.errors, validation.warnings),
        },
      ],
      isError: true,
    };
  }

  // Track files we staged for potential rollback
  const stagedByUs: string[] = [];

  // Stage files if provided
  if (args.files && args.files.length > 0) {
    try {
      await git.stageFiles(context.projectPath, args.files);
      stagedByUs.push(...args.files);
    } catch (e) {
      throw wrapError('Failed to stage files', 'git', e, { files: args.files });
    }
  }

  // Check if there are staged changes
  try {
    const stagedFiles = await git.getStagedFiles(context.projectPath);
    if (stagedFiles.length === 0) {
      throw new GlanceyError(
        'No staged changes to commit. Stage files first or pass files parameter.',
        'git'
      );
    }
  } catch (e) {
    if (e instanceof GlanceyError) {
      throw e;
    }
    throw wrapError('Failed to check staged changes', 'git', e);
  }

  // Write marker file
  git.writeMarkerFile(context.projectPath);

  // Execute commit
  try {
    const output = await git.commit(context.projectPath, args.message);
    return {
      content: [
        {
          type: 'text',
          text: formatCommitSuccess(output, validation.warnings),
        },
      ],
    };
  } catch (e) {
    // Rollback: unstage files we staged if commit failed
    if (stagedByUs.length > 0) {
      try {
        await git.unstageFiles(context.projectPath, stagedByUs);
      } catch {
        // Ignore rollback failures - best effort
      }
    }
    throw wrapError('Git commit failed', 'git', e, { message: args.message });
  }
}
