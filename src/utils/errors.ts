/**
 * Error handling utilities for lance-context MCP server.
 *
 * Provides structured error types, server-side logging, and debug mode support.
 */

/**
 * Error categories for different failure modes
 */
export type ErrorCategory =
  | 'validation' // Invalid input or arguments
  | 'indexing' // Errors during indexing operations
  | 'search' // Errors during search operations
  | 'embedding' // Embedding generation failures
  | 'config' // Configuration errors
  | 'git' // Git operation failures
  | 'worktree' // Git worktree operation failures
  | 'internal'; // Unexpected internal errors

/**
 * Structured error with category and context
 */
export class LanceContextError extends Error {
  readonly category: ErrorCategory;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    category: ErrorCategory,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message);
    this.name = 'LanceContextError';
    this.category = category;
    this.context = context;
    if (cause) {
      this.cause = cause;
      // Preserve original stack if available
      if (cause.stack) {
        this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
      }
    }
  }
}

/**
 * Check if debug mode is enabled via environment variable
 */
export function isDebugMode(): boolean {
  return process.env.LANCE_CONTEXT_DEBUG === '1' || process.env.LANCE_CONTEXT_DEBUG === 'true';
}

/**
 * Log an error server-side with full context.
 * Always logs to stderr for debugging purposes.
 */
export function logError(error: unknown, toolName?: string): void {
  const prefix = toolName ? `[lance-context] [${toolName}]` : '[lance-context]';

  if (error instanceof LanceContextError) {
    console.error(`${prefix} ${error.category} error: ${error.message}`);
    if (error.context) {
      console.error(`${prefix} Context:`, JSON.stringify(error.context, null, 2));
    }
    if (error.stack) {
      console.error(`${prefix} Stack trace:\n${error.stack}`);
    }
  } else if (error instanceof Error) {
    console.error(`${prefix} Error: ${error.message}`);
    if (error.stack) {
      console.error(`${prefix} Stack trace:\n${error.stack}`);
    }
  } else {
    console.error(`${prefix} Unknown error:`, error);
  }
}

/**
 * Format an error for client response.
 * In debug mode, includes stack traces. Otherwise, just the message.
 */
export function formatErrorResponse(error: unknown): string {
  const debug = isDebugMode();

  if (error instanceof LanceContextError) {
    let response = `Error [${error.category}]: ${error.message}`;
    if (debug) {
      if (error.context) {
        response += `\n\nContext: ${JSON.stringify(error.context, null, 2)}`;
      }
      if (error.stack) {
        response += `\n\nStack trace:\n${error.stack}`;
      }
    }
    return response;
  }

  if (error instanceof Error) {
    let response = `Error: ${error.message}`;
    if (debug && error.stack) {
      response += `\n\nStack trace:\n${error.stack}`;
    }
    return response;
  }

  return `Error: ${String(error)}`;
}

/**
 * Wrap an error with additional context, preserving the original error.
 */
export function wrapError(
  message: string,
  category: ErrorCategory,
  cause: unknown,
  context?: Record<string, unknown>
): LanceContextError {
  const causeError = cause instanceof Error ? cause : new Error(String(cause));
  return new LanceContextError(message, category, context, causeError);
}
