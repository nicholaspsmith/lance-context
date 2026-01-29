/**
 * Token bucket rate limiter for API requests
 * Implements a classic token bucket algorithm with configurable rate and burst capacity
 */

/**
 * Configuration options for the rate limiter
 */
export interface RateLimiterConfig {
  /** Maximum requests per second (tokens added per second) */
  requestsPerSecond: number;
  /** Maximum burst capacity (bucket size) */
  burstCapacity?: number;
}

/**
 * Default rate limiter configuration
 * Conservative default suitable for most API rate limits
 */
export const DEFAULT_RATE_LIMITER_CONFIG: Required<RateLimiterConfig> = {
  requestsPerSecond: 5,
  burstCapacity: 10,
};

/**
 * Token bucket rate limiter
 *
 * The token bucket algorithm works as follows:
 * - Tokens are added to the bucket at a fixed rate (requestsPerSecond)
 * - Each request consumes one token
 * - If no tokens are available, the request waits until one becomes available
 * - The bucket has a maximum capacity (burstCapacity) to allow short bursts
 */
export class RateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private readonly requestsPerSecond: number;
  private readonly burstCapacity: number;
  private pendingQueue: Array<() => void> = [];
  private scheduledTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config?: RateLimiterConfig) {
    const opts = { ...DEFAULT_RATE_LIMITER_CONFIG, ...config };
    this.requestsPerSecond = opts.requestsPerSecond;
    this.burstCapacity = opts.burstCapacity;
    this.tokens = this.burstCapacity; // Start with full bucket
    this.lastRefillTime = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = elapsedSeconds * this.requestsPerSecond;

    this.tokens = Math.min(this.burstCapacity, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  /**
   * Calculate wait time until a token is available
   */
  private getWaitTimeMs(): number {
    if (this.tokens >= 1) {
      return 0;
    }

    // Calculate time until we have at least 1 token
    const tokensNeeded = 1 - this.tokens;
    const secondsToWait = tokensNeeded / this.requestsPerSecond;
    return Math.ceil(secondsToWait * 1000);
  }

  /**
   * Schedule processing of the queue if not already scheduled
   */
  private scheduleProcessing(): void {
    if (this.scheduledTimeout !== null || this.pendingQueue.length === 0) {
      return;
    }

    const waitTime = this.getWaitTimeMs();
    this.scheduledTimeout = setTimeout(() => {
      this.scheduledTimeout = null;
      this.refillTokens();
      this.processQueue();
      // If there are still pending requests, schedule another processing
      if (this.pendingQueue.length > 0) {
        this.scheduleProcessing();
      }
    }, waitTime);
  }

  /**
   * Process the pending queue
   */
  private processQueue(): void {
    while (this.pendingQueue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const resolve = this.pendingQueue.shift()!;
      resolve();
    }
  }

  /**
   * Acquire a token, waiting if necessary
   * Returns a promise that resolves when a token is acquired
   */
  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Need to wait for a token
    return new Promise<void>((resolve) => {
      this.pendingQueue.push(resolve);
      this.scheduleProcessing();
    });
  }

  /**
   * Try to acquire a token without waiting
   * Returns true if a token was acquired, false otherwise
   */
  tryAcquire(): boolean {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Get the current number of available tokens
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }

  /**
   * Get the current queue length
   */
  getQueueLength(): number {
    return this.pendingQueue.length;
  }

  /**
   * Reset the rate limiter to initial state
   */
  reset(): void {
    this.tokens = this.burstCapacity;
    this.lastRefillTime = Date.now();
    // Clear any scheduled timeout
    if (this.scheduledTimeout !== null) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
    // Clear pending queue
    while (this.pendingQueue.length > 0) {
      const resolve = this.pendingQueue.shift()!;
      resolve();
    }
  }
}
