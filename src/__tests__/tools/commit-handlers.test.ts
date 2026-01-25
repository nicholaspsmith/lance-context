import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleCommit,
  parseCommitArgs,
  validateCommit,
  formatValidationErrors,
  formatCommitSuccess,
  COMMIT_RULES,
  type CommitToolContext,
  type IGitOperations,
} from '../../tools/commit-handlers.js';
import { LanceContextError } from '../../utils/errors.js';

describe('commit-handlers', () => {
  let mockGitOperations: IGitOperations;
  let context: CommitToolContext;

  beforeEach(() => {
    mockGitOperations = {
      getCurrentBranch: vi.fn().mockResolvedValue('feature/test'),
      stageFiles: vi.fn().mockResolvedValue(undefined),
      getStagedFiles: vi.fn().mockResolvedValue(['file.ts']),
      commit: vi.fn().mockResolvedValue('[feature/test abc123] Test commit'),
      unstageFiles: vi.fn().mockResolvedValue(undefined),
      writeMarkerFile: vi.fn(),
    };

    context = {
      projectPath: '/test/project',
      gitOperations: mockGitOperations,
    };
  });

  describe('parseCommitArgs', () => {
    it('should throw when message is missing', () => {
      expect(() => parseCommitArgs({})).toThrow(LanceContextError);
      expect(() => parseCommitArgs({})).toThrow('message is required');
    });

    it('should throw when message is empty', () => {
      expect(() => parseCommitArgs({ message: '' })).toThrow(LanceContextError);
    });

    it('should parse valid message', () => {
      const result = parseCommitArgs({ message: 'feat: add feature' });
      expect(result.message).toBe('feat: add feature');
    });

    it('should parse files array', () => {
      const result = parseCommitArgs({ message: 'test', files: ['a.ts', 'b.ts'] });
      expect(result.files).toEqual(['a.ts', 'b.ts']);
    });

    it('should default files to empty array', () => {
      const result = parseCommitArgs({ message: 'test' });
      expect(result.files).toEqual([]);
    });
  });

  describe('validateCommit', () => {
    it('should pass for valid commit on feature branch', async () => {
      const result = await validateCommit('feat: add feature', context);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when on main branch', async () => {
      vi.mocked(mockGitOperations.getCurrentBranch).mockResolvedValue('main');

      const result = await validateCommit('feat: add feature', context);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Cannot commit directly to main');
    });

    it('should fail when on master branch', async () => {
      vi.mocked(mockGitOperations.getCurrentBranch).mockResolvedValue('master');

      const result = await validateCommit('feat: add feature', context);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Cannot commit directly to master');
    });

    it('should fail for subject line over 72 characters', async () => {
      const longMessage = 'a'.repeat(73);

      const result = await validateCommit(longMessage, context);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('73 characters'));
    });

    it('should warn for past tense in message', async () => {
      const result = await validateCommit('Added new feature', context);

      expect(result.valid).toBe(true); // warnings don't block
      expect(result.warnings[0]).toContain('imperative mood');
    });

    it('should fail for multi-responsibility message', async () => {
      const result = await validateCommit('feat: add feature and fix bug', context);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('multiple responsibilities');
    });

    it('should handle getCurrentBranch error', async () => {
      vi.mocked(mockGitOperations.getCurrentBranch).mockRejectedValue(new Error('git error'));

      const result = await validateCommit('feat: add feature', context);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Failed to determine current branch');
    });
  });

  describe('formatValidationErrors', () => {
    it('should format errors only', () => {
      const formatted = formatValidationErrors(['Error 1', 'Error 2'], []);

      expect(formatted).toContain('## Commit Blocked');
      expect(formatted).toContain('- Error 1');
      expect(formatted).toContain('- Error 2');
      expect(formatted).not.toContain('**Warnings:**');
      expect(formatted).toContain(COMMIT_RULES);
    });

    it('should format errors and warnings', () => {
      const formatted = formatValidationErrors(['Error'], ['Warning']);

      expect(formatted).toContain('**Errors:**');
      expect(formatted).toContain('- Error');
      expect(formatted).toContain('**Warnings:**');
      expect(formatted).toContain('- Warning');
    });
  });

  describe('formatCommitSuccess', () => {
    it('should format success without warnings', () => {
      const formatted = formatCommitSuccess('[abc123] Test commit', []);

      expect(formatted).toContain('## Commit Successful');
      expect(formatted).toContain('[abc123] Test commit');
      expect(formatted).not.toContain('**Warnings:**');
      expect(formatted).toContain(COMMIT_RULES);
    });

    it('should include warnings if present', () => {
      const formatted = formatCommitSuccess('[abc123] Test', ['Warning here']);

      expect(formatted).toContain('**Warnings:**');
      expect(formatted).toContain('- Warning here');
    });
  });

  describe('handleCommit', () => {
    it('should return error for invalid commit', async () => {
      vi.mocked(mockGitOperations.getCurrentBranch).mockResolvedValue('main');

      const result = await handleCommit({ message: 'test' }, context);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Commit Blocked');
    });

    it('should stage files if provided', async () => {
      await handleCommit({ message: 'test', files: ['a.ts', 'b.ts'] }, context);

      expect(mockGitOperations.stageFiles).toHaveBeenCalledWith('/test/project', ['a.ts', 'b.ts']);
    });

    it('should check for staged changes', async () => {
      await handleCommit({ message: 'test' }, context);

      expect(mockGitOperations.getStagedFiles).toHaveBeenCalledWith('/test/project');
    });

    it('should throw if no staged changes', async () => {
      vi.mocked(mockGitOperations.getStagedFiles).mockResolvedValue([]);

      await expect(handleCommit({ message: 'test' }, context)).rejects.toThrow(
        'No staged changes to commit'
      );
    });

    it('should write marker file before commit', async () => {
      await handleCommit({ message: 'test' }, context);

      expect(mockGitOperations.writeMarkerFile).toHaveBeenCalledWith('/test/project');
    });

    it('should execute commit with message', async () => {
      await handleCommit({ message: 'feat: test' }, context);

      expect(mockGitOperations.commit).toHaveBeenCalledWith('/test/project', 'feat: test');
    });

    it('should return success response', async () => {
      const result = await handleCommit({ message: 'feat: test' }, context);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Commit Successful');
    });

    it('should unstage files on commit failure', async () => {
      vi.mocked(mockGitOperations.commit).mockRejectedValue(new Error('commit failed'));

      await expect(
        handleCommit({ message: 'test', files: ['staged.ts'] }, context)
      ).rejects.toThrow();

      expect(mockGitOperations.unstageFiles).toHaveBeenCalledWith('/test/project', ['staged.ts']);
    });
  });
});
