import { exec } from 'child_process';
import { promisify } from 'util';
import { access, constants } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * Beads issue from bd list --json
 */
export interface BeadsIssue {
  id: string;
  title: string;
  status: string;
  priority?: number;
  issue_type?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  labels?: string[];
}

/**
 * Beads status information
 */
export interface BeadsStatus {
  available: boolean;
  issueCount: number;
  openCount: number;
  readyCount: number;
  readyIssues: BeadsIssue[];
  openIssues: BeadsIssue[];
  allIssues: BeadsIssue[];
  syncBranch?: string;
  daemonRunning?: boolean;
}

/**
 * Check if beads is available in the project
 */
export async function isBeadsAvailable(projectPath: string): Promise<boolean> {
  try {
    const beadsDir = join(projectPath, '.beads');
    await access(beadsDir, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get beads status and issues
 */
export async function getBeadsStatus(projectPath: string): Promise<BeadsStatus> {
  const available = await isBeadsAvailable(projectPath);

  if (!available) {
    return {
      available: false,
      issueCount: 0,
      openCount: 0,
      readyCount: 0,
      readyIssues: [],
      openIssues: [],
      allIssues: [],
    };
  }

  try {
    // Get ready issues (open, not blocked)
    const { stdout: readyOutput } = await execAsync('bd ready --json 2>/dev/null || echo "[]"', {
      cwd: projectPath,
      timeout: 5000,
    });

    let readyIssues: BeadsIssue[] = [];
    try {
      const parsed = JSON.parse(readyOutput.trim() || '[]');
      readyIssues = Array.isArray(parsed) ? parsed : [];
    } catch {
      readyIssues = [];
    }

    // Get all open issues
    const { stdout: listOutput } = await execAsync(
      'bd list --limit 0 --json 2>/dev/null || echo "[]"',
      {
        cwd: projectPath,
        timeout: 5000,
      }
    );

    let openIssues: BeadsIssue[] = [];
    try {
      const parsed = JSON.parse(listOutput.trim() || '[]');
      openIssues = Array.isArray(parsed) ? parsed : [];
    } catch {
      openIssues = [];
    }

    // Get all issues including closed
    const { stdout: allOutput } = await execAsync(
      'bd list --all --limit 0 --json 2>/dev/null || echo "[]"',
      {
        cwd: projectPath,
        timeout: 5000,
      }
    );

    let allIssues: BeadsIssue[] = [];
    try {
      const parsed = JSON.parse(allOutput.trim() || '[]');
      allIssues = Array.isArray(parsed) ? parsed : [];
    } catch {
      allIssues = [];
    }

    // Get info for sync branch and daemon status
    let syncBranch: string | undefined;
    let daemonRunning = false;

    try {
      const { stdout: infoOutput } = await execAsync('bd info --json 2>/dev/null || echo "{}"', {
        cwd: projectPath,
        timeout: 5000,
      });
      const info = JSON.parse(infoOutput.trim() || '{}');
      syncBranch = info.syncBranch || info.sync_branch;
      daemonRunning = info.daemonConnected || info.daemon_connected || false;
    } catch {
      // Ignore info errors
    }

    // Get total count including closed
    const { stdout: countOutput } = await execAsync('bd count 2>/dev/null || echo "0"', {
      cwd: projectPath,
      timeout: 5000,
    });
    const totalCount = parseInt(countOutput.trim(), 10) || allIssues.length;

    return {
      available: true,
      issueCount: totalCount,
      openCount: openIssues.length,
      readyCount: readyIssues.length,
      readyIssues,
      openIssues,
      allIssues,
      syncBranch,
      daemonRunning,
    };
  } catch {
    // If bd commands fail, beads might not be properly configured
    return {
      available: true,
      issueCount: 0,
      openCount: 0,
      readyCount: 0,
      readyIssues: [],
      openIssues: [],
      allIssues: [],
    };
  }
}
