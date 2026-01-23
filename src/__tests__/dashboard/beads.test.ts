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
        issues: [],
      });
    });

    it('should return status with issues when beads is available', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const mockIssues = [
        { id: 'issue-1', title: 'Test Issue 1', status: 'open' },
        { id: 'issue-2', title: 'Test Issue 2', status: 'open' },
      ];

      vi.mocked(exec).mockImplementation((cmd: string, _opts: unknown, callback: unknown) => {
        const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
        if (cmd.includes('bd ready')) {
          cb(null, JSON.stringify(mockIssues), '');
        } else if (cmd.includes('bd list')) {
          cb(null, JSON.stringify(mockIssues), '');
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
      expect(status.issues).toHaveLength(2);
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
      expect(status.issues).toEqual([]);
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
      expect(status.issues).toEqual([]);
    });

    it('should limit issues to 10 for display', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const manyIssues = Array.from({ length: 15 }, (_, i) => ({
        id: `issue-${i}`,
        title: `Test Issue ${i}`,
        status: 'open',
      }));

      vi.mocked(exec).mockImplementation((cmd: string, _opts: unknown, callback: unknown) => {
        const cb = callback as (error: Error | null, stdout: string, stderr: string) => void;
        if (cmd.includes('bd ready')) {
          cb(null, JSON.stringify(manyIssues), '');
        } else if (cmd.includes('bd list')) {
          cb(null, JSON.stringify(manyIssues), '');
        } else if (cmd.includes('bd info')) {
          cb(null, '{}', '');
        } else if (cmd.includes('bd count')) {
          cb(null, '15', '');
        } else {
          cb(null, '', '');
        }
        return {} as ReturnType<typeof exec>;
      });

      const status = await getBeadsStatus('/project');

      expect(status.issues).toHaveLength(10);
    });
  });
});
