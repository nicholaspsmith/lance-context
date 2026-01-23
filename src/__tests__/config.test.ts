import { describe, it, expect } from 'vitest';
import {
  getDefaultPatterns,
  getDefaultExcludePatterns,
  getInstructions,
  LanceContextConfig,
} from '../config.js';

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
});
