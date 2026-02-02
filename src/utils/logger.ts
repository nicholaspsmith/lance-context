/**
 * Structured logging utility for lance-context.
 *
 * Supports log levels (debug, info, warn, error) configured via environment variable.
 */

/** Available log levels in order of severity */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** Numeric values for log level comparison */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/** Default log level when not configured */
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/** Prefix used for all log messages */
const LOG_PREFIX = '[glancey]';

/**
 * Get the configured log level from environment.
 */
function getLogLevel(): LogLevel {
  const envLevel = process.env.GLANCEY_LOG_LEVEL?.toLowerCase();

  if (envLevel && envLevel in LOG_LEVEL_VALUES) {
    return envLevel as LogLevel;
  }

  // Support legacy debug mode
  if (process.env.GLANCEY_DEBUG === '1' || process.env.GLANCEY_DEBUG === 'true') {
    return 'debug';
  }

  return DEFAULT_LOG_LEVEL;
}

/**
 * Check if a log level should be output given current configuration.
 */
function shouldLog(level: LogLevel): boolean {
  const currentLevel = getLogLevel();
  return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[currentLevel];
}

/**
 * Format a log message with optional context.
 */
function formatMessage(level: LogLevel, message: string, context?: string): string {
  const levelTag = level.toUpperCase().padEnd(5);
  const contextTag = context ? `[${context}]` : '';
  return `${LOG_PREFIX} ${levelTag} ${contextTag} ${message}`.trim();
}

/**
 * Logger instance for structured logging.
 */
export const logger = {
  /**
   * Log debug information. Only shown when GLANCEY_LOG_LEVEL=debug.
   */
  debug(message: string, context?: string, data?: Record<string, unknown>): void {
    if (!shouldLog('debug')) return;
    console.error(formatMessage('debug', message, context));
    if (data) {
      console.error(`${LOG_PREFIX}       `, JSON.stringify(data, null, 2));
    }
  },

  /**
   * Log informational messages. Default level.
   */
  info(message: string, context?: string, data?: Record<string, unknown>): void {
    if (!shouldLog('info')) return;
    console.error(formatMessage('info', message, context));
    if (data) {
      console.error(`${LOG_PREFIX}       `, JSON.stringify(data, null, 2));
    }
  },

  /**
   * Log warning messages.
   */
  warn(message: string, context?: string, data?: Record<string, unknown>): void {
    if (!shouldLog('warn')) return;
    console.error(formatMessage('warn', message, context));
    if (data) {
      console.error(`${LOG_PREFIX}       `, JSON.stringify(data, null, 2));
    }
  },

  /**
   * Log error messages.
   */
  error(message: string, context?: string, error?: unknown): void {
    if (!shouldLog('error')) return;
    console.error(formatMessage('error', message, context));
    if (error instanceof Error) {
      console.error(`${LOG_PREFIX}       `, error.message);
      if (getLogLevel() === 'debug' && error.stack) {
        console.error(`${LOG_PREFIX}       `, error.stack);
      }
    } else if (error !== undefined) {
      console.error(`${LOG_PREFIX}       `, error);
    }
  },

  /**
   * Get current log level.
   */
  getLevel(): LogLevel {
    return getLogLevel();
  },

  /**
   * Check if debug logging is enabled.
   */
  isDebugEnabled(): boolean {
    return shouldLog('debug');
  },
};
