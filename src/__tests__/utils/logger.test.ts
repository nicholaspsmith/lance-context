import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../utils/logger.js';

describe('logger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('log levels', () => {
    it('should default to info level', () => {
      delete process.env.GLANCEY_LOG_LEVEL;
      delete process.env.GLANCEY_DEBUG;
      expect(logger.getLevel()).toBe('info');
    });

    it('should respect GLANCEY_LOG_LEVEL', () => {
      process.env.GLANCEY_LOG_LEVEL = 'debug';
      expect(logger.getLevel()).toBe('debug');
    });

    it('should respect GLANCEY_DEBUG for backward compatibility', () => {
      delete process.env.GLANCEY_LOG_LEVEL;
      process.env.GLANCEY_DEBUG = '1';
      expect(logger.getLevel()).toBe('debug');
    });

    it('should prefer LOG_LEVEL over DEBUG', () => {
      process.env.GLANCEY_LOG_LEVEL = 'warn';
      process.env.GLANCEY_DEBUG = '1';
      expect(logger.getLevel()).toBe('warn');
    });

    it('should ignore invalid log levels', () => {
      process.env.GLANCEY_LOG_LEVEL = 'invalid';
      delete process.env.GLANCEY_DEBUG;
      expect(logger.getLevel()).toBe('info');
    });
  });

  describe('debug()', () => {
    it('should not log when level is info', () => {
      process.env.GLANCEY_LOG_LEVEL = 'info';
      logger.debug('test message');
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should log when level is debug', () => {
      process.env.GLANCEY_LOG_LEVEL = 'debug';
      logger.debug('test message');
      expect(console.error).toHaveBeenCalled();
    });

    it('should include context when provided', () => {
      process.env.GLANCEY_LOG_LEVEL = 'debug';
      logger.debug('test message', 'indexer');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[indexer]'));
    });

    it('should log data object when provided', () => {
      process.env.GLANCEY_LOG_LEVEL = 'debug';
      logger.debug('test message', undefined, { key: 'value' });
      expect(console.error).toHaveBeenCalledTimes(2);
    });
  });

  describe('info()', () => {
    it('should log when level is info', () => {
      process.env.GLANCEY_LOG_LEVEL = 'info';
      logger.info('test message');
      expect(console.error).toHaveBeenCalled();
    });

    it('should not log when level is warn', () => {
      process.env.GLANCEY_LOG_LEVEL = 'warn';
      logger.info('test message');
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('warn()', () => {
    it('should log when level is warn', () => {
      process.env.GLANCEY_LOG_LEVEL = 'warn';
      logger.warn('test message');
      expect(console.error).toHaveBeenCalled();
    });

    it('should not log when level is error', () => {
      process.env.GLANCEY_LOG_LEVEL = 'error';
      logger.warn('test message');
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('error()', () => {
    it('should log when level is error', () => {
      process.env.GLANCEY_LOG_LEVEL = 'error';
      logger.error('test message');
      expect(console.error).toHaveBeenCalled();
    });

    it('should not log when level is silent', () => {
      process.env.GLANCEY_LOG_LEVEL = 'silent';
      logger.error('test message');
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should log Error object details', () => {
      process.env.GLANCEY_LOG_LEVEL = 'error';
      logger.error('test message', undefined, new Error('test error'));
      expect(console.error).toHaveBeenCalledTimes(2);
    });

    it('should include stack trace in debug mode', () => {
      process.env.GLANCEY_LOG_LEVEL = 'debug';
      const error = new Error('test error');
      logger.error('test message', undefined, error);
      expect(console.error).toHaveBeenCalledTimes(3);
    });
  });

  describe('isDebugEnabled()', () => {
    it('should return true when level is debug', () => {
      process.env.GLANCEY_LOG_LEVEL = 'debug';
      expect(logger.isDebugEnabled()).toBe(true);
    });

    it('should return false when level is info', () => {
      process.env.GLANCEY_LOG_LEVEL = 'info';
      expect(logger.isDebugEnabled()).toBe(false);
    });
  });

  describe('message formatting', () => {
    it('should include [glancey] prefix', () => {
      process.env.GLANCEY_LOG_LEVEL = 'info';
      logger.info('test message');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[glancey]'));
    });

    it('should include level tag', () => {
      process.env.GLANCEY_LOG_LEVEL = 'info';
      logger.info('test message');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('INFO'));
    });
  });
});
