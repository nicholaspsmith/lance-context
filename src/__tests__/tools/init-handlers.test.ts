/**
 * Tests for init-handlers.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { handleInitProject } from '../../tools/init-handlers.js';

// Mock fs module
vi.mock('fs');

describe('handleInitProject', () => {
  const mockProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CLAUDE.md handling', () => {
    it('should create new CLAUDE.md when it does not exist', async () => {
      // Mock: no CLAUDE.md exists, .git exists
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('CLAUDE.md')) return false;
        if (pathStr.includes('.git')) return true;
        if (pathStr.includes('.husky')) return false;
        if (pathStr.includes('hooks')) return true;
        return false;
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.chmodSync).mockImplementation(() => {});

      const result = await handleInitProject({ projectPath: mockProjectPath });

      expect(result.content[0].text).toContain('Created CLAUDE.md with glancey instructions');
    });

    it('should update existing CLAUDE.md without glancey section', async () => {
      // Mock: CLAUDE.md exists without glancey section
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('CLAUDE.md')) return true;
        if (pathStr.includes('.git')) return true;
        if (pathStr.includes('.husky')) return false;
        if (pathStr.includes('hooks')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('CLAUDE.md')) {
          return '# Project\n\nSome existing content';
        }
        return '';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.chmodSync).mockImplementation(() => {});

      const result = await handleInitProject({ projectPath: mockProjectPath });

      expect(result.content[0].text).toContain('Added glancey section to existing CLAUDE.md');
    });

    it('should skip CLAUDE.md when glancey section already exists', async () => {
      // Mock: CLAUDE.md exists with glancey section
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('CLAUDE.md')) return true;
        if (pathStr.includes('.git')) return true;
        if (pathStr.includes('.husky')) return false;
        if (pathStr.includes('hooks')) return true;
        if (pathStr.includes('post-commit')) return false;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('CLAUDE.md')) {
          return '# Project\n\n## Glancey\n\nAlready configured';
        }
        return '';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.chmodSync).mockImplementation(() => {});
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      const result = await handleInitProject({ projectPath: mockProjectPath });

      expect(result.content[0].text).toContain('CLAUDE.md already contains glancey instructions');
    });
  });

  describe('post-commit hook handling', () => {
    it('should skip hook when not a git repository', async () => {
      // Mock: no .git directory
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('CLAUDE.md')) return false;
        if (pathStr.includes('.git')) return false;
        return false;
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const result = await handleInitProject({ projectPath: mockProjectPath });

      expect(result.content[0].text).toContain('Not a git repository');
    });

    it('should install hook in .git/hooks when husky is not used', async () => {
      // Mock: .git exists but no husky
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('CLAUDE.md')) return false;
        if (pathStr.includes('.husky')) return false;
        if (pathStr.includes('post-commit')) return false;
        if (pathStr.includes('hooks')) return true;
        if (pathStr.includes('.git')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => '');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.chmodSync).mockImplementation(() => {});
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      const result = await handleInitProject({ projectPath: mockProjectPath });

      expect(result.content[0].text).toContain('.git/hooks/post-commit');
    });

    it('should install hook in .husky when husky is present', async () => {
      // Mock: husky directory exists
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('CLAUDE.md')) return false;
        if (pathStr.includes('post-commit')) return false;
        if (pathStr.includes('.husky')) return true;
        if (pathStr.includes('.git')) return true;
        return false;
      });
      vi.mocked(fs.statSync).mockImplementation(() => ({ isDirectory: () => true }) as fs.Stats);
      vi.mocked(fs.readFileSync).mockImplementation(() => '');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.chmodSync).mockImplementation(() => {});

      const result = await handleInitProject({ projectPath: mockProjectPath });

      expect(result.content[0].text).toContain('.husky/post-commit');
    });

    it('should skip hook when already contains glancey check', async () => {
      // Mock: hook exists with glancey content
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('CLAUDE.md')) return false;
        if (pathStr.includes('.git')) return true;
        if (pathStr.includes('.husky')) return false;
        if (pathStr.includes('hooks')) return true;
        if (pathStr.includes('post-commit')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('post-commit')) {
          return '#!/bin/sh\n# Existing hook with MCP_COMMIT_MARKER check';
        }
        return '';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      const result = await handleInitProject({ projectPath: mockProjectPath });

      expect(result.content[0].text).toContain('Hook already contains glancey check');
    });
  });

  describe('response format', () => {
    it('should include next steps when changes are made', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('CLAUDE.md')) return false;
        if (pathStr.includes('.git')) return true;
        if (pathStr.includes('.husky')) return false;
        if (pathStr.includes('hooks')) return true;
        if (pathStr.includes('post-commit')) return false;
        return false;
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.chmodSync).mockImplementation(() => {});
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      const result = await handleInitProject({ projectPath: mockProjectPath });

      expect(result.content[0].text).toContain('Next Steps');
      expect(result.content[0].text).toContain('Commit the CLAUDE.md changes');
    });
  });
});
