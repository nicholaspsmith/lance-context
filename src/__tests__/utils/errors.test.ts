import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GlanceyError,
  isDebugMode,
  logError,
  formatErrorResponse,
  wrapError,
} from '../../utils/errors.js';

describe('errors', () => {
  describe('GlanceyError', () => {
    it('should create error with message and category', () => {
      const error = new GlanceyError('Test error', 'validation');

      expect(error.message).toBe('Test error');
      expect(error.category).toBe('validation');
      expect(error.name).toBe('GlanceyError');
    });

    it('should include context when provided', () => {
      const error = new GlanceyError('Test error', 'search', { query: 'test' });

      expect(error.context).toEqual({ query: 'test' });
    });

    it('should preserve cause error and stack', () => {
      const cause = new Error('Original error');
      const error = new GlanceyError('Wrapped error', 'internal', undefined, cause);

      expect(error.cause).toBe(cause);
      expect(error.stack).toContain('Caused by:');
    });
  });

  describe('isDebugMode', () => {
    const originalEnv = process.env.GLANCEY_DEBUG;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.GLANCEY_DEBUG;
      } else {
        process.env.GLANCEY_DEBUG = originalEnv;
      }
    });

    it('should return false when env var is not set', () => {
      delete process.env.GLANCEY_DEBUG;
      expect(isDebugMode()).toBe(false);
    });

    it('should return true when env var is "1"', () => {
      process.env.GLANCEY_DEBUG = '1';
      expect(isDebugMode()).toBe(true);
    });

    it('should return true when env var is "true"', () => {
      process.env.GLANCEY_DEBUG = 'true';
      expect(isDebugMode()).toBe(true);
    });

    it('should return false for other values', () => {
      process.env.GLANCEY_DEBUG = 'false';
      expect(isDebugMode()).toBe(false);
    });
  });

  describe('logError', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log GlanceyError with category and stack', () => {
      const error = new GlanceyError('Test error', 'validation', { key: 'value' });
      logError(error, 'test_tool');

      expect(consoleSpy).toHaveBeenCalledWith('[glancey] [test_tool] validation error: Test error');
      expect(consoleSpy).toHaveBeenCalledWith('[glancey] [test_tool] Context:', expect.any(String));
    });

    it('should log regular Error with message and stack', () => {
      const error = new Error('Regular error');
      logError(error);

      expect(consoleSpy).toHaveBeenCalledWith('[glancey] Error: Regular error');
    });

    it('should log unknown errors', () => {
      logError('string error');

      expect(consoleSpy).toHaveBeenCalledWith('[glancey] Unknown error:', 'string error');
    });
  });

  describe('formatErrorResponse', () => {
    const originalEnv = process.env.GLANCEY_DEBUG;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.GLANCEY_DEBUG;
      } else {
        process.env.GLANCEY_DEBUG = originalEnv;
      }
    });

    it('should format GlanceyError with category', () => {
      delete process.env.GLANCEY_DEBUG;
      const error = new GlanceyError('Test error', 'validation');

      const response = formatErrorResponse(error);

      expect(response).toBe('Error [validation]: Test error');
    });

    it('should include stack trace in debug mode', () => {
      process.env.GLANCEY_DEBUG = '1';
      const error = new GlanceyError('Test error', 'validation');

      const response = formatErrorResponse(error);

      expect(response).toContain('Error [validation]: Test error');
      expect(response).toContain('Stack trace:');
    });

    it('should include context in debug mode', () => {
      process.env.GLANCEY_DEBUG = '1';
      const error = new GlanceyError('Test error', 'validation', { tool: 'search' });

      const response = formatErrorResponse(error);

      expect(response).toContain('Context:');
      expect(response).toContain('"tool": "search"');
    });

    it('should format regular Error', () => {
      delete process.env.GLANCEY_DEBUG;
      const error = new Error('Regular error');

      const response = formatErrorResponse(error);

      expect(response).toBe('Error: Regular error');
    });

    it('should format unknown errors', () => {
      const response = formatErrorResponse('string error');

      expect(response).toBe('Error: string error');
    });
  });

  describe('wrapError', () => {
    it('should wrap Error with message and category', () => {
      const cause = new Error('Original error');
      const wrapped = wrapError('Wrapped message', 'internal', cause);

      expect(wrapped).toBeInstanceOf(GlanceyError);
      expect(wrapped.message).toBe('Wrapped message');
      expect(wrapped.category).toBe('internal');
      expect(wrapped.cause).toBe(cause);
    });

    it('should wrap non-Error with message and category', () => {
      const wrapped = wrapError('Wrapped message', 'internal', 'string cause');

      expect(wrapped).toBeInstanceOf(GlanceyError);
      expect(wrapped.message).toBe('Wrapped message');
      expect(wrapped.cause).toBeInstanceOf(Error);
    });

    it('should include context when provided', () => {
      const cause = new Error('Original error');
      const wrapped = wrapError('Wrapped message', 'git', cause, { command: 'git add' });

      expect(wrapped.context).toEqual({ command: 'git add' });
    });
  });
});
