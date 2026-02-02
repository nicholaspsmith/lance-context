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
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
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
  const prefixedMsg = `[glancey] ${message}`;
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
 * Check if a 429 error is a quota exhaustion (not retryable) vs temporary rate limit (retryable)
 * Quota exhaustion means daily/monthly limits exceeded - retrying won't help
 */
async function isQuotaExhausted(
  response: Response
): Promise<{ exhausted: boolean; message: string }> {
  if (response.status !== 429) {
    return { exhausted: false, message: '' };
  }

  try {
    const text = await response.text();
    const lowerText = text.toLowerCase();

    // Check for quota exhaustion indicators in the response
    const quotaIndicators = [
      'exceeded your current quota',
      'resource_exhausted',
      'quota exceeded',
      'quotafailure',
      'daily limit',
      'monthly limit',
      'billing',
    ];

    for (const indicator of quotaIndicators) {
      if (lowerText.includes(indicator)) {
        return { exhausted: true, message: text };
      }
    }

    return { exhausted: false, message: text };
  } catch {
    // If we can't read the body, assume it's a temporary rate limit
    return { exhausted: false, message: '' };
  }
}

/**
 * Parse Retry-After header value
 * Returns delay in milliseconds, or null if not present/parseable
 */
function parseRetryAfter(response: Response): number | null {
  const retryAfter = response.headers?.get?.('retry-after');
  if (!retryAfter) {
    return null;
  }

  // Try parsing as number of seconds
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = Date.parse(retryAfter);
  if (!isNaN(date)) {
    const delayMs = date - Date.now();
    return delayMs > 0 ? delayMs : null;
  }

  return null;
}

/**
 * Calculate retry delay, respecting Retry-After header for 429 errors
 */
function calculateRetryDelay(
  response: Response,
  attempt: number,
  opts: Required<RetryOptions>
): number {
  // For 429 errors, check Retry-After header first
  if (response.status === 429) {
    const retryAfter = parseRetryAfter(response);
    if (retryAfter !== null) {
      // Use Retry-After value, but cap at maxDelayMs and add small jitter
      const jitter = Math.random() * 1000;
      return Math.min(retryAfter + jitter, opts.maxDelayMs);
    }
    // No Retry-After header - use longer base delay for rate limits
    const rateLimitBaseDelay = Math.max(opts.baseDelayMs * 2, 2000);
    return Math.min(rateLimitBaseDelay * Math.pow(2, attempt), opts.maxDelayMs);
  }

  // Standard exponential backoff for other errors
  return Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
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

      // For 429 errors, check if it's quota exhaustion (not retryable)
      if (response.status === 429) {
        const { exhausted, message } = await isQuotaExhausted(response);
        if (exhausted) {
          logRetry('error', 'API quota exhausted (daily/monthly limit reached). Skipping retries.');
          // Create a new Response with the same status but the body we already read
          const errorResponse = new Response(message, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
          return errorResponse;
        }
      }

      // Retryable status code
      if (attempt < opts.maxRetries) {
        const delay = calculateRetryDelay(response, attempt, opts);
        const retryAfterInfo = response.status === 429 ? ' (rate limited)' : '';
        logRetry(
          'warn',
          `Request failed with status ${response.status}${retryAfterInfo}, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${opts.maxRetries})`
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
