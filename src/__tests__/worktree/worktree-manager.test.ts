import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import { exec } from 'child_process';
import {
  WorktreeManager,
  formatWorktreeInfo,
  formatWorktreeList,
} from '../../worktree/worktree-manager.js';
import type { WorktreeInfo, ListWorktreesResult } from '../../worktree/types.js';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

describe('WorktreeManager', () => {
  const projectPath = '/test/project';
  let manager: WorktreeManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new WorktreeManager(projectPath);
  });

  describe('createWorktree', () => {
    it('should create a worktree with correct naming', async () => {
      const mockExec = vi.mocked(exec);
      const mockExistsSync = vi.mocked(fs.existsSync);
      const mockStatSync = vi.mocked(fs.statSync);

      // Track what paths have been "created"
      let worktreeCreated = false;

      // Setup mocks
      mockExistsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        // Worktree dir - exists only after creation
        if (pathStr.includes('agent-worktrees/add-auth')) {
          return worktreeCreated;
        }
        // agent-worktrees dir doesn't exist initially
        if (pathStr.endsWith('agent-worktrees')) return false;
        return false;
      });

      mockStatSync.mockReturnValue({
        birthtime: new Date(),
      } as fs.Stats);

      // Mock git commands
      mockExec.mockImplementation((cmd: string, opts: any, callback?: any) => {
        const cb = typeof opts === 'function' ? opts : callback;
        const cmdStr = String(cmd);

        if (cmdStr.includes('rev-parse --verify feature/add-auth')) {
          // Branch doesn't exist
          cb(new Error('not found'), '', '');
        } else if (cmdStr.includes('rev-parse --verify main')) {
          cb(null, { stdout: 'abc123\n', stderr: '' });
        } else if (cmdStr.includes('worktree add')) {
          // Mark worktree as created
          worktreeCreated = true;
          cb(null, { stdout: 'Preparing worktree\n', stderr: '' });
        } else if (cmdStr.includes('branch --show-current')) {
          cb(null, { stdout: 'feature/add-auth\n', stderr: '' });
        } else if (cmdStr.includes('rev-parse --short HEAD')) {
          cb(null, { stdout: 'abc1234\n', stderr: '' });
        } else if (cmdStr.includes('status --porcelain')) {
          cb(null, { stdout: '', stderr: '' });
        } else if (cmdStr.includes('rev-list --left-right')) {
          cb(null, { stdout: '0\t1\n', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      const result = await manager.createWorktree({
        shortName: 'add-auth',
        installDeps: false,
      });

      expect(result.success).toBe(true);
      expect(result.worktree).toBeDefined();
      expect(result.worktree?.branch).toBe('feature/add-auth');
    });

    it('should fail on duplicate worktree', async () => {
      const mockExistsSync = vi.mocked(fs.existsSync);

      mockExistsSync.mockReturnValue(true);

      const result = await manager.createWorktree({
        shortName: 'existing',
        installDeps: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should include issue ID in naming', async () => {
      const mockExec = vi.mocked(exec);
      const mockExistsSync = vi.mocked(fs.existsSync);

      mockExistsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('bd-123-add-auth')) return false;
        return pathStr.includes('.git');
      });

      let capturedCmd = '';
      mockExec.mockImplementation((cmd: string, opts: any, callback?: any) => {
        const cb = typeof opts === 'function' ? opts : callback;
        const cmdStr = String(cmd);

        if (cmdStr.includes('worktree add')) {
          capturedCmd = cmdStr;
          cb(null, { stdout: '', stderr: '' });
        } else if (cmdStr.includes('rev-parse --verify feature/bd-123-add-auth')) {
          cb(new Error('not found'), '', '');
        } else if (cmdStr.includes('rev-parse --verify main')) {
          cb(null, { stdout: '', stderr: '' });
        } else if (cmdStr.includes('branch --show-current')) {
          cb(null, { stdout: 'feature/bd-123-add-auth\n', stderr: '' });
        } else if (cmdStr.includes('rev-parse --short HEAD')) {
          cb(null, { stdout: 'abc1234\n', stderr: '' });
        } else if (cmdStr.includes('status --porcelain')) {
          cb(null, { stdout: '', stderr: '' });
        } else if (cmdStr.includes('rev-list --left-right')) {
          cb(null, { stdout: '0\t0\n', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      await manager.createWorktree({
        shortName: 'add-auth',
        issueId: 'bd-123',
        installDeps: false,
      });

      expect(capturedCmd).toContain('feature/bd-123-add-auth');
      expect(capturedCmd).toContain('bd-123-add-auth');
    });
  });

  describe('listWorktrees', () => {
    it('should return empty list when no worktrees', async () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      mockExistsSync.mockReturnValue(false);

      const result = await manager.listWorktrees();

      expect(result.worktrees).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should list populated worktrees', async () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      const mockReaddirSync = vi.mocked(fs.readdirSync);
      const mockExec = vi.mocked(exec);

      mockExistsSync.mockReturnValue(true);
      (mockReaddirSync as any).mockReturnValue([
        { name: 'worktree-1', isDirectory: () => true },
        { name: 'worktree-2', isDirectory: () => true },
      ]);

      mockExec.mockImplementation((cmd: string, opts: any, callback?: any) => {
        const cb = typeof opts === 'function' ? opts : callback;
        const cmdStr = String(cmd);

        if (cmdStr.includes('branch --show-current')) {
          cb(null, { stdout: 'feature/test\n', stderr: '' });
        } else if (cmdStr.includes('rev-parse --short HEAD')) {
          cb(null, { stdout: 'abc1234\n', stderr: '' });
        } else if (cmdStr.includes('status --porcelain')) {
          cb(null, { stdout: '', stderr: '' });
        } else if (cmdStr.includes('rev-list --left-right')) {
          cb(null, { stdout: '0\t0\n', stderr: '' });
        } else if (cmdStr.includes('rev-parse --verify main')) {
          cb(null, { stdout: '', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      const result = await manager.listWorktrees();

      expect(result.count).toBe(2);
      expect(result.worktrees.length).toBe(2);
    });
  });

  describe('removeWorktree', () => {
    it('should fail on non-existent worktree', async () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      mockExistsSync.mockReturnValue(false);

      const result = await manager.removeWorktree({ name: 'nonexistent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should fail on dirty worktree without force', async () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      const mockExec = vi.mocked(exec);

      mockExistsSync.mockReturnValue(true);

      mockExec.mockImplementation((cmd: string, opts: any, callback?: any) => {
        const cb = typeof opts === 'function' ? opts : callback;
        const cmdStr = String(cmd);

        if (cmdStr.includes('branch --show-current')) {
          cb(null, { stdout: 'feature/test\n', stderr: '' });
        } else if (cmdStr.includes('rev-parse --short HEAD')) {
          cb(null, { stdout: 'abc1234\n', stderr: '' });
        } else if (cmdStr.includes('status --porcelain')) {
          // Return dirty status
          cb(null, { stdout: 'M file.ts\n', stderr: '' });
        } else if (cmdStr.includes('rev-list --left-right')) {
          cb(null, { stdout: '0\t0\n', stderr: '' });
        } else if (cmdStr.includes('rev-parse --verify main')) {
          cb(null, { stdout: '', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      const result = await manager.removeWorktree({ name: 'dirty-worktree' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('uncommitted changes');
    });

    it('should remove worktree and branch when requested', async () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      const mockExec = vi.mocked(exec);

      mockExistsSync.mockReturnValue(true);

      const executedCommands: string[] = [];
      mockExec.mockImplementation((cmd: string, opts: any, callback?: any) => {
        const cb = typeof opts === 'function' ? opts : callback;
        const cmdStr = String(cmd);
        executedCommands.push(cmdStr);

        if (cmdStr.includes('branch --show-current')) {
          cb(null, { stdout: 'feature/test\n', stderr: '' });
        } else if (cmdStr.includes('rev-parse --short HEAD')) {
          cb(null, { stdout: 'abc1234\n', stderr: '' });
        } else if (cmdStr.includes('status --porcelain')) {
          cb(null, { stdout: '', stderr: '' });
        } else if (cmdStr.includes('rev-list --left-right')) {
          cb(null, { stdout: '0\t0\n', stderr: '' });
        } else if (cmdStr.includes('rev-parse --verify main')) {
          cb(null, { stdout: '', stderr: '' });
        } else if (cmdStr.includes('worktree remove')) {
          cb(null, { stdout: '', stderr: '' });
        } else if (cmdStr.includes('branch -D')) {
          cb(null, { stdout: '', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      const result = await manager.removeWorktree({
        name: 'test-worktree',
        deleteBranch: true,
      });

      expect(result.success).toBe(true);
      expect(result.branchDeleted).toBe(true);
      expect(executedCommands.some((cmd) => cmd.includes('worktree remove'))).toBe(true);
      expect(executedCommands.some((cmd) => cmd.includes('branch -D'))).toBe(true);
    });
  });

  describe('detectPackageManager', () => {
    it('should detect bun from bun.lockb', async () => {
      const mockExistsSync = vi.mocked(fs.existsSync);

      mockExistsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('bun.lockb');
      });

      const result = await manager.detectPackageManager('/test/dir');
      expect(result).toBe('bun');
    });

    it('should detect pnpm from pnpm-lock.yaml', async () => {
      const mockExistsSync = vi.mocked(fs.existsSync);

      mockExistsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('pnpm-lock.yaml');
      });

      const result = await manager.detectPackageManager('/test/dir');
      expect(result).toBe('pnpm');
    });

    it('should detect yarn from yarn.lock', async () => {
      const mockExistsSync = vi.mocked(fs.existsSync);

      mockExistsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('yarn.lock');
      });

      const result = await manager.detectPackageManager('/test/dir');
      expect(result).toBe('yarn');
    });

    it('should detect npm from package-lock.json', async () => {
      const mockExistsSync = vi.mocked(fs.existsSync);

      mockExistsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('package-lock.json');
      });

      const result = await manager.detectPackageManager('/test/dir');
      expect(result).toBe('npm');
    });

    it('should return null when no package.json', async () => {
      const mockExistsSync = vi.mocked(fs.existsSync);
      mockExistsSync.mockReturnValue(false);

      const result = await manager.detectPackageManager('/test/dir');
      expect(result).toBe(null);
    });
  });
});

describe('formatWorktreeInfo', () => {
  it('should format worktree info correctly', () => {
    const info: WorktreeInfo = {
      name: 'test-worktree',
      path: '/project/.git/agent-worktrees/test-worktree',
      branch: 'feature/test',
      commit: 'abc1234',
      valid: true,
      dirty: false,
      ahead: 2,
      behind: 1,
      createdAt: new Date('2024-01-15T10:00:00Z'),
    };

    const formatted = formatWorktreeInfo(info);

    expect(formatted).toContain('## Worktree: test-worktree');
    expect(formatted).toContain('**Branch:** feature/test');
    expect(formatted).toContain('**Commit:** abc1234');
    expect(formatted).toContain('**Status:** clean');
    expect(formatted).toContain('**Ahead/Behind:** +2/-1');
  });

  it('should show dirty status', () => {
    const info: WorktreeInfo = {
      name: 'dirty-worktree',
      path: '/project/.git/agent-worktrees/dirty-worktree',
      branch: 'feature/dirty',
      commit: 'def5678',
      valid: true,
      dirty: true,
      ahead: 0,
      behind: 0,
    };

    const formatted = formatWorktreeInfo(info);

    expect(formatted).toContain('**Status:** dirty');
  });

  it('should show invalid status', () => {
    const info: WorktreeInfo = {
      name: 'invalid-worktree',
      path: '/project/.git/agent-worktrees/invalid-worktree',
      branch: '',
      commit: '',
      valid: false,
      dirty: false,
      ahead: 0,
      behind: 0,
    };

    const formatted = formatWorktreeInfo(info);

    expect(formatted).toContain('**Status:** invalid');
  });
});

describe('formatWorktreeList', () => {
  it('should show message for empty list', () => {
    const result: ListWorktreesResult = { worktrees: [], count: 0 };
    const formatted = formatWorktreeList(result);

    expect(formatted).toBe('No agent worktrees found.');
  });

  it('should format list of worktrees', () => {
    const result: ListWorktreesResult = {
      worktrees: [
        {
          name: 'wt-1',
          path: '/project/.git/agent-worktrees/wt-1',
          branch: 'feature/test-1',
          commit: 'abc1234',
          valid: true,
          dirty: false,
          ahead: 1,
          behind: 0,
        },
        {
          name: 'wt-2',
          path: '/project/.git/agent-worktrees/wt-2',
          branch: 'fix/bug',
          commit: 'def5678',
          valid: true,
          dirty: true,
          ahead: 0,
          behind: 2,
        },
      ],
      count: 2,
    };

    const formatted = formatWorktreeList(result);

    expect(formatted).toContain('Found 2 worktree(s)');
    expect(formatted).toContain('**wt-1** on `feature/test-1` (clean) [+1/-0]');
    expect(formatted).toContain('**wt-2** on `fix/bug` (dirty) [+0/-2]');
  });
});
