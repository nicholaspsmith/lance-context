/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxResponseSizeBytes?: number;
  /** Request timeout in milliseconds (default: 60000 = 60 seconds) */
  timeoutMs?: number;
}

/**
 * Default maximum response size (10MB)
 */
const DEFAULT_MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

/**
 * Default request timeout (60 seconds)
 */
const DEFAULT_TIMEOUT_MS = 60000;

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  maxResponseSizeBytes: DEFAULT_MAX_RESPONSE_SIZE,
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Optional callback for logging retry attempts to external systems (e.g., dashboard)
 */
let retryLogCallback: ((level: 'info' | 'warn' | 'error', message: string) => void) | null = null;

/**
 * Set a callback function to receive retry log messages
 */
export function setRetryLogCallback(
  callback: ((level: 'info' | 'warn' | 'error', message: string) => void) | null
): void {
  retryLogCallback = callback;
}

/**
 * Log a retry message to console and optional callback
 */
function logRetry(level: 'info' | 'warn' | 'error', message: string): void {
  const prefixedMsg = `[lance-context] ${message}`;
  if (level === 'error') {
    console.error(prefixedMsg);
  } else if (level === 'warn') {
    console.warn(prefixedMsg);
  } else {
    console.error(prefixedMsg); // Use stderr for all server logs
  }
  if (retryLogCallback) {
    retryLogCallback(level, message);
  }
}

/**
 * Check if response size exceeds the maximum allowed
 */
function checkResponseSize(response: Response, maxSize: number): void {
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > maxSize) {
      throw new Error(`Response size ${size} bytes exceeds maximum allowed ${maxSize} bytes`);
    }
  }
}

/**
 * Check if an error is retryable (network errors, rate limits, server errors, timeouts)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on network errors and timeouts
    if (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('timeout') ||
      message.includes('aborted')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a response status is retryable
 */
function isRetryableStatus(status: number): boolean {
  // Retry on rate limits (429), server errors (5xx), and some specific cases
  return status === 429 || status === 408 || (status >= 500 && status < 600);
}

/**
 * Execute a fetch request with exponential backoff retry
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Check response size before processing
      checkResponseSize(response, opts.maxResponseSizeBytes);

      // If response is ok or non-retryable error, return it
      if (response.ok || !isRetryableStatus(response.status)) {
        return response;
      }

      // Retryable status code
      if (attempt < opts.maxRetries) {
        const delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
        logRetry(
          'warn',
          `Request failed with status ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${opts.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // Last attempt, return the response even if it's an error
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Convert abort errors to timeout errors for clarity
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(`Request timeout after ${opts.timeoutMs}ms`);
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < opts.maxRetries && isRetryableError(error)) {
        const delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
        logRetry(
          'warn',
          `Request failed: ${lastError.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${opts.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error('Request failed after retries');
}
