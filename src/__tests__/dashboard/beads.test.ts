import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isBeadsAvailable, getBeadsStatus } from '../../dashboard/beads.js';
import { access } from 'fs/promises';
import { exec } from 'child_process';

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  constants: { F_OK: 0 },
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: (fn: typeof exec) => {
    return (cmd: string, opts: { cwd: string; timeout: number }) => {
      return new Promise((resolve, reject) => {
        fn(cmd, opts, (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        });
      });
    };
  },
}));

describe('beads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isBeadsAvailable', () => {
    it('should return true when .beads directory exists', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const result = await isBeadsAvailable('/project');

      expect(result).toBe(true);
      expect(access).toHaveBeenCalledWith('/project/.beads', expect.anything());
    });

    it('should return false when .beads directory does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      const result = await isBeadsAvailable('/project');

      expect(result).toBe(false);
    });
  });

  describe('getBeadsStatus', () => {
    it('should return unavailable status when beads is not available', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      const status = await getBeadsStatus('/project');

      expect(status).toEqual({
        available: false,
        issueCount: 0,
        openCount: 0,
        readyCount: 0,
        readyIssues: [],
        openIssues: [],
        allIssues: [],
      });
    });

    it('should return status with issues when beads is available', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const readyIssues = [
        { id: 'issue-1', title: 'Test Issue 1', status: 'open' },
        { id: 'issue-2', title: 'Test Issue 2', status: 'open' },
      ];
      const allIssues = [
        ...readyIssues,
        { id: 'issue-3', title: 'Closed Issue', status: 'closed' },
      ];

      vi.mocked(exec).mockImplementation((cmd: string, _opts: unknown, callback: unknown) => {
        const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
        if (cmd.includes('bd ready')) {
          cb(null, JSON.stringify(readyIssues), '');
        } else if (cmd.includes('--all')) {
          cb(null, JSON.stringify(allIssues), '');
        } else if (cmd.includes('bd list')) {
          cb(null, JSON.stringify(readyIssues), '');
        } else if (cmd.includes('bd info')) {
          cb(null, JSON.stringify({ syncBranch: 'beads', daemonConnected: true }), '');
        } else if (cmd.includes('bd count')) {
          cb(null, '5', '');
        } else {
          cb(null, '', '');
        }
        return {} as ReturnType<typeof exec>;
      });

      const status = await getBeadsStatus('/project');

      expect(status.available).toBe(true);
      expect(status.readyCount).toBe(2);
      expect(status.openCount).toBe(2);
      expect(status.issueCount).toBe(5);
      expect(status.readyIssues).toHaveLength(2);
      expect(status.openIssues).toHaveLength(2);
      expect(status.allIssues).toHaveLength(3);
      expect(status.syncBranch).toBe('beads');
      expect(status.daemonRunning).toBe(true);
    });

    it('should handle invalid JSON from bd commands', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      vi.mocked(exec).mockImplementation((cmd: string, _opts: unknown, callback: unknown) => {
        const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
        cb(null, 'not valid json', '');
        return {} as ReturnType<typeof exec>;
      });

      const status = await getBeadsStatus('/project');

      expect(status.available).toBe(true);
      expect(status.readyIssues).toEqual([]);
      expect(status.openIssues).toEqual([]);
      expect(status.allIssues).toEqual([]);
      expect(status.readyCount).toBe(0);
    });

    it('should handle bd command errors gracefully', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      vi.mocked(exec).mockImplementation((_cmd: string, _opts: unknown, callback: unknown) => {
        const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
        cb(new Error('Command failed'), '', 'error');
        return {} as ReturnType<typeof exec>;
      });

      const status = await getBeadsStatus('/project');

      expect(status.available).toBe(true);
      expect(status.issueCount).toBe(0);
      expect(status.openCount).toBe(0);
      expect(status.readyCount).toBe(0);
      expect(status.readyIssues).toEqual([]);
      expect(status.openIssues).toEqual([]);
      expect(status.allIssues).toEqual([]);
    });

    it('should return all issues across all three views', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const readyIssues = Array.from({ length: 5 }, (_, i) => ({
        id: `ready-${i}`,
        title: `Ready Issue ${i}`,
        status: 'open',
      }));
      const openIssues = Array.from({ length: 15 }, (_, i) => ({
        id: `open-${i}`,
        title: `Open Issue ${i}`,
        status: 'open',
      }));
      const allIssues = Array.from({ length: 20 }, (_, i) => ({
        id: `all-${i}`,
        title: `Issue ${i}`,
        status: i < 15 ? 'open' : 'closed',
      }));

      vi.mocked(exec).mockImplementation((cmd: string, _opts: unknown, callback: unknown) => {
        const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
        if (cmd.includes('bd ready')) {
          cb(null, JSON.stringify(readyIssues), '');
        } else if (cmd.includes('--all')) {
          cb(null, JSON.stringify(allIssues), '');
        } else if (cmd.includes('bd list')) {
          cb(null, JSON.stringify(openIssues), '');
        } else if (cmd.includes('bd info')) {
          cb(null, '{}', '');
        } else if (cmd.includes('bd count')) {
          cb(null, '20', '');
        } else {
          cb(null, '', '');
        }
        return {} as ReturnType<typeof exec>;
      });

      const status = await getBeadsStatus('/project');

      expect(status.readyIssues).toHaveLength(5);
      expect(status.openIssues).toHaveLength(15);
      expect(status.allIssues).toHaveLength(20);
    });
  });
});
