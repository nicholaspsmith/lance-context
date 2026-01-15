/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (network errors, rate limits, server errors)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on network errors
    if (message.includes('fetch') || message.includes('network') || message.includes('econnrefused')) {
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
    try {
      const response = await fetch(url, options);

      // If response is ok or non-retryable error, return it
      if (response.ok || !isRetryableStatus(response.status)) {
        return response;
      }

      // Retryable status code
      if (attempt < opts.maxRetries) {
        const delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
        console.error(
          `[lance-context] Request failed with status ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${opts.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // Last attempt, return the response even if it's an error
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < opts.maxRetries && isRetryableError(error)) {
        const delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
        console.error(
          `[lance-context] Request failed: ${lastError.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${opts.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error('Request failed after retries');
}
