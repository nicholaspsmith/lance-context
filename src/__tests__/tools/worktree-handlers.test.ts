import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleCreateWorktree,
  handleListWorktrees,
  handleRemoveWorktree,
  handleWorktreeStatus,
  parseCreateWorktreeArgs,
  parseRemoveWorktreeArgs,
  parseWorktreeStatusArgs,
  formatWorktreeCreationResult,
  formatWorktreeRemovalResult,
  type WorktreeToolContext,
  type IWorktreeManager,
} from '../../tools/worktree-handlers.js';
import type {
  WorktreeInfo,
  CreateWorktreeResult,
  RemoveWorktreeResult,
} from '../../worktree/index.js';
import { LanceContextError } from '../../utils/errors.js';

// Helper to create a valid WorktreeInfo
function createWorktreeInfo(overrides: Partial<WorktreeInfo> = {}): WorktreeInfo {
  return {
    name: 'test',
    path: '/path/to/test',
    branch: 'feature/test',
    commit: 'abc123',
    valid: true,
    dirty: false,
    ahead: 0,
    behind: 0,
    ...overrides,
  };
}

describe('worktree-handlers', () => {
  let mockWorktreeManager: IWorktreeManager;
  let context: WorktreeToolContext;

  beforeEach(() => {
    mockWorktreeManager = {
      createWorktree: vi.fn(),
      listWorktrees: vi.fn(),
      removeWorktree: vi.fn(),
      getWorktreeInfo: vi.fn(),
    };

    context = {
      projectPath: '/test/project',
      toolGuidance: '\n---\nGuidance',
      worktreeManager: mockWorktreeManager,
    };
  });

  describe('parseCreateWorktreeArgs', () => {
    it('should throw when short_name is missing', () => {
      expect(() => parseCreateWorktreeArgs({})).toThrow(LanceContextError);
      expect(() => parseCreateWorktreeArgs({})).toThrow('short_name is required');
    });

    it('should parse valid short_name', () => {
      const result = parseCreateWorktreeArgs({ short_name: 'my-feature' });
      expect(result.shortName).toBe('my-feature');
    });

    it('should default installDeps to true', () => {
      const result = parseCreateWorktreeArgs({ short_name: 'test' });
      expect(result.installDeps).toBe(true);
    });

    it('should parse installDeps as false', () => {
      const result = parseCreateWorktreeArgs({ short_name: 'test', install_deps: false });
      expect(result.installDeps).toBe(false);
    });

    it('should parse optional issue_id', () => {
      const result = parseCreateWorktreeArgs({ short_name: 'test', issue_id: 'PROJ-123' });
      expect(result.issueId).toBe('PROJ-123');
    });

    it('should parse valid prefix', () => {
      const result = parseCreateWorktreeArgs({ short_name: 'test', prefix: 'fix' });
      expect(result.prefix).toBe('fix');
    });

    it('should throw for invalid prefix', () => {
      expect(() => parseCreateWorktreeArgs({ short_name: 'test', prefix: 'invalid' })).toThrow(
        LanceContextError
      );
      expect(() => parseCreateWorktreeArgs({ short_name: 'test', prefix: 'invalid' })).toThrow(
        'prefix must be one of'
      );
    });

    it('should parse valid package_manager', () => {
      const result = parseCreateWorktreeArgs({ short_name: 'test', package_manager: 'pnpm' });
      expect(result.packageManager).toBe('pnpm');
    });

    it('should throw for invalid package_manager', () => {
      expect(() =>
        parseCreateWorktreeArgs({ short_name: 'test', package_manager: 'invalid' })
      ).toThrow(LanceContextError);
    });

    it('should parse base_branch', () => {
      const result = parseCreateWorktreeArgs({ short_name: 'test', base_branch: 'develop' });
      expect(result.baseBranch).toBe('develop');
    });
  });

  describe('formatWorktreeCreationResult', () => {
    it('should format error result', () => {
      const result: CreateWorktreeResult = { success: false, error: 'Branch already exists' };
      expect(formatWorktreeCreationResult(result)).toContain('Failed to create worktree');
      expect(formatWorktreeCreationResult(result)).toContain('Branch already exists');
    });

    it('should format success result', () => {
      const worktree = createWorktreeInfo({
        name: 'feature-auth',
        path: '/path/to/worktree',
        branch: 'feature/auth',
      });
      const result: CreateWorktreeResult = {
        success: true,
        worktree,
        depsInstalled: true,
        depsInstallTime: 5000,
      };

      const formatted = formatWorktreeCreationResult(result);

      expect(formatted).toContain('## Worktree Created');
      expect(formatted).toContain('**Name:** feature-auth');
      expect(formatted).toContain('**Path:** /path/to/worktree');
      expect(formatted).toContain('**Branch:** feature/auth');
      expect(formatted).toContain('**Dependencies:** installed (5000ms)');
      expect(formatted).toContain('Spawn agent with `cwd:');
    });

    it('should show deps skipped/failed when not installed', () => {
      const result: CreateWorktreeResult = {
        success: true,
        worktree: createWorktreeInfo(),
        depsInstalled: false,
      };

      const formatted = formatWorktreeCreationResult(result);
      expect(formatted).toContain('**Dependencies:** skipped/failed');
    });
  });

  describe('handleCreateWorktree', () => {
    it('should call worktreeManager.createWorktree with correct options', async () => {
      vi.mocked(mockWorktreeManager.createWorktree).mockResolvedValue({
        success: true,
        worktree: createWorktreeInfo(),
      });

      await handleCreateWorktree(
        {
          shortName: 'test',
          issueId: 'PROJ-123',
          prefix: 'feature',
          baseBranch: 'main',
          installDeps: true,
          packageManager: 'npm',
        },
        context
      );

      expect(mockWorktreeManager.createWorktree).toHaveBeenCalledWith({
        shortName: 'test',
        issueId: 'PROJ-123',
        prefix: 'feature',
        baseBranch: 'main',
        installDeps: true,
        packageManager: 'npm',
      });
    });

    it('should return error response for failed creation', async () => {
      vi.mocked(mockWorktreeManager.createWorktree).mockResolvedValue({
        success: false,
        error: 'Already exists',
      });

      const result = await handleCreateWorktree({ shortName: 'test' }, context);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to create worktree');
    });

    it('should return success response with worktree info', async () => {
      vi.mocked(mockWorktreeManager.createWorktree).mockResolvedValue({
        success: true,
        worktree: createWorktreeInfo({
          name: 'test',
          path: '/path/to/test',
          branch: 'feature/test',
        }),
      });

      const result = await handleCreateWorktree({ shortName: 'test' }, context);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Worktree Created');
      expect(result.content[0].text).toContain('Guidance');
    });
  });

  describe('handleListWorktrees', () => {
    it('should call worktreeManager.listWorktrees', async () => {
      vi.mocked(mockWorktreeManager.listWorktrees).mockResolvedValue({
        worktrees: [],
        count: 0,
      });

      await handleListWorktrees(context);

      expect(mockWorktreeManager.listWorktrees).toHaveBeenCalled();
    });

    it('should append tool guidance', async () => {
      vi.mocked(mockWorktreeManager.listWorktrees).mockResolvedValue({
        worktrees: [],
        count: 0,
      });

      const result = await handleListWorktrees(context);

      expect(result.content[0].text).toContain('Guidance');
    });
  });

  describe('parseRemoveWorktreeArgs', () => {
    it('should throw when name is missing', () => {
      expect(() => parseRemoveWorktreeArgs({})).toThrow(LanceContextError);
      expect(() => parseRemoveWorktreeArgs({})).toThrow('name is required');
    });

    it('should parse valid name', () => {
      const result = parseRemoveWorktreeArgs({ name: 'my-worktree' });
      expect(result.name).toBe('my-worktree');
    });

    it('should default deleteBranch to false', () => {
      const result = parseRemoveWorktreeArgs({ name: 'test' });
      expect(result.deleteBranch).toBe(false);
    });

    it('should parse deleteBranch as true', () => {
      const result = parseRemoveWorktreeArgs({ name: 'test', delete_branch: true });
      expect(result.deleteBranch).toBe(true);
    });

    it('should default force to false', () => {
      const result = parseRemoveWorktreeArgs({ name: 'test' });
      expect(result.force).toBe(false);
    });

    it('should parse force as true', () => {
      const result = parseRemoveWorktreeArgs({ name: 'test', force: true });
      expect(result.force).toBe(true);
    });
  });

  describe('formatWorktreeRemovalResult', () => {
    it('should format error result', () => {
      const result: RemoveWorktreeResult = {
        success: false,
        error: 'Worktree has uncommitted changes',
      };
      expect(formatWorktreeRemovalResult('test', result)).toContain('Failed to remove worktree');
      expect(formatWorktreeRemovalResult('test', result)).toContain('uncommitted changes');
    });

    it('should format success result with branch info', () => {
      const result: RemoveWorktreeResult = {
        success: true,
        branch: 'feature/test',
        branchDeleted: true,
      };

      const formatted = formatWorktreeRemovalResult('test', result);

      expect(formatted).toContain('## Worktree Removed');
      expect(formatted).toContain('**Name:** test');
      expect(formatted).toContain('**Branch:** feature/test');
      expect(formatted).toContain('**Branch deleted:** yes');
    });

    it('should format success result without branch deletion', () => {
      const result: RemoveWorktreeResult = {
        success: true,
        branch: 'feature/test',
        branchDeleted: false,
      };

      const formatted = formatWorktreeRemovalResult('test', result);
      expect(formatted).toContain('**Branch deleted:** no');
    });
  });

  describe('handleRemoveWorktree', () => {
    it('should call worktreeManager.removeWorktree with correct options', async () => {
      vi.mocked(mockWorktreeManager.removeWorktree).mockResolvedValue({
        success: true,
        branch: 'feature/test',
        branchDeleted: true,
      });

      await handleRemoveWorktree({ name: 'test', deleteBranch: true, force: false }, context);

      expect(mockWorktreeManager.removeWorktree).toHaveBeenCalledWith({
        name: 'test',
        deleteBranch: true,
        force: false,
      });
    });

    it('should return error response for failed removal', async () => {
      vi.mocked(mockWorktreeManager.removeWorktree).mockResolvedValue({
        success: false,
        error: 'Has uncommitted changes',
      });

      const result = await handleRemoveWorktree({ name: 'test' }, context);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to remove worktree');
    });

    it('should return success response', async () => {
      vi.mocked(mockWorktreeManager.removeWorktree).mockResolvedValue({
        success: true,
        branch: 'feature/test',
        branchDeleted: false,
      });

      const result = await handleRemoveWorktree({ name: 'test' }, context);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Worktree Removed');
    });
  });

  describe('parseWorktreeStatusArgs', () => {
    it('should throw when name is missing', () => {
      expect(() => parseWorktreeStatusArgs({})).toThrow(LanceContextError);
      expect(() => parseWorktreeStatusArgs({})).toThrow('name is required');
    });

    it('should parse valid name', () => {
      const result = parseWorktreeStatusArgs({ name: 'my-worktree' });
      expect(result.name).toBe('my-worktree');
    });
  });

  describe('handleWorktreeStatus', () => {
    it('should call worktreeManager.getWorktreeInfo', async () => {
      vi.mocked(mockWorktreeManager.getWorktreeInfo).mockResolvedValue(createWorktreeInfo());

      await handleWorktreeStatus({ name: 'test' }, context);

      expect(mockWorktreeManager.getWorktreeInfo).toHaveBeenCalledWith('test');
    });

    it('should return error response when worktree not found', async () => {
      vi.mocked(mockWorktreeManager.getWorktreeInfo).mockResolvedValue(null);

      const result = await handleWorktreeStatus({ name: 'nonexistent' }, context);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Worktree "nonexistent" not found');
    });

    it('should return worktree info when found', async () => {
      vi.mocked(mockWorktreeManager.getWorktreeInfo).mockResolvedValue(createWorktreeInfo());

      const result = await handleWorktreeStatus({ name: 'test' }, context);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Guidance');
    });
  });
});
