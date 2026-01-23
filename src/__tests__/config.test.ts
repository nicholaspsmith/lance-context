import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  loadConfig,
  getDefaultPatterns,
  getDefaultExcludePatterns,
  getInstructions,
  getChunkingConfig,
  getSearchConfig,
  getDashboardConfig,
  LanceContextConfig,
} from '../config.js';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('config', () => {
  describe('getDefaultPatterns', () => {
    it('should return an array of patterns', () => {
      const patterns = getDefaultPatterns();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should include common code file patterns', () => {
      const patterns = getDefaultPatterns();
      expect(patterns).toContain('**/*.ts');
      expect(patterns).toContain('**/*.js');
      expect(patterns).toContain('**/*.py');
    });

    it('should return a new array each time', () => {
      const patterns1 = getDefaultPatterns();
      const patterns2 = getDefaultPatterns();
      expect(patterns1).not.toBe(patterns2);
      expect(patterns1).toEqual(patterns2);
    });
  });

  describe('getDefaultExcludePatterns', () => {
    it('should return an array of exclude patterns', () => {
      const patterns = getDefaultExcludePatterns();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should include common exclude patterns', () => {
      const patterns = getDefaultExcludePatterns();
      expect(patterns).toContain('**/node_modules/**');
      expect(patterns).toContain('**/.git/**');
      expect(patterns).toContain('**/dist/**');
    });
  });

  describe('getInstructions', () => {
    it('should return instructions when present in config', () => {
      const config: LanceContextConfig = {
        instructions: 'Use semantic search for this codebase.',
      };
      expect(getInstructions(config)).toBe('Use semantic search for this codebase.');
    });

    it('should return undefined when instructions not set', () => {
      const config: LanceContextConfig = {};
      expect(getInstructions(config)).toBeUndefined();
    });
  });

  describe('loadConfig', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return default config when no config file exists', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const config = await loadConfig('/nonexistent');

      expect(config.patterns).toBeDefined();
      expect(config.excludePatterns).toBeDefined();
    });

    it('should load config from .lance-context.json', async () => {
      const customConfig = {
        patterns: ['**/*.custom'],
        instructions: 'Custom instructions',
      };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(customConfig));

      const config = await loadConfig('/project');

      expect(config.patterns).toEqual(['**/*.custom']);
      expect(config.instructions).toBe('Custom instructions');
    });

    it('should try lance-context.config.json if .lance-context.json fails', async () => {
      const customConfig = {
        patterns: ['**/*.alt'],
      };
      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(JSON.stringify(customConfig));

      const config = await loadConfig('/project');

      expect(config.patterns).toEqual(['**/*.alt']);
    });

    it('should use defaults when config has invalid fields', async () => {
      const invalidConfig = {
        patterns: 'not an array', // should be array
      };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(invalidConfig));

      const config = await loadConfig('/project');

      // Should fall back to defaults
      expect(Array.isArray(config.patterns)).toBe(true);
    });

    it('should merge user config with defaults for nested objects', async () => {
      const customConfig = {
        chunking: { maxLines: 100 },
        search: { semanticWeight: 0.9 },
      };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(customConfig));

      const config = await loadConfig('/project');

      expect(config.chunking?.maxLines).toBe(100);
      // Should have default overlap
      expect(config.chunking?.overlap).toBeDefined();
    });
  });

  describe('getChunkingConfig', () => {
    it('should return defaults when config has no chunking', () => {
      const config: LanceContextConfig = {};
      const chunking = getChunkingConfig(config);

      expect(chunking.maxLines).toBeDefined();
      expect(chunking.overlap).toBeDefined();
    });

    it('should merge user config with defaults', () => {
      const config: LanceContextConfig = {
        chunking: { maxLines: 200 },
      };
      const chunking = getChunkingConfig(config);

      expect(chunking.maxLines).toBe(200);
      expect(chunking.overlap).toBeDefined();
    });
  });

  describe('getSearchConfig', () => {
    it('should return defaults when config has no search', () => {
      const config: LanceContextConfig = {};
      const search = getSearchConfig(config);

      expect(search.semanticWeight).toBeDefined();
      expect(search.keywordWeight).toBeDefined();
    });

    it('should merge user config with defaults', () => {
      const config: LanceContextConfig = {
        search: { semanticWeight: 0.8 },
      };
      const search = getSearchConfig(config);

      expect(search.semanticWeight).toBe(0.8);
      expect(search.keywordWeight).toBeDefined();
    });
  });

  describe('getDashboardConfig', () => {
    it('should return defaults when config has no dashboard', () => {
      const config: LanceContextConfig = {};
      const dashboard = getDashboardConfig(config);

      expect(dashboard.enabled).toBeDefined();
      expect(dashboard.port).toBeDefined();
    });

    it('should merge user config with defaults', () => {
      const config: LanceContextConfig = {
        dashboard: { enabled: false, port: 9000 },
      };
      const dashboard = getDashboardConfig(config);

      expect(dashboard.enabled).toBe(false);
      expect(dashboard.port).toBe(9000);
    });
  });
});
