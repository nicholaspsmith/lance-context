/**
 * Generic TTL-based LRU cache with configurable size and expiration.
 * Provides a reusable caching utility for embeddings, metadata, and other data.
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

export interface CacheOptions {
  /** Maximum number of entries (default: 100) */
  maxSize?: number;
  /** Time-to-live in milliseconds (default: 1 hour) */
  ttlMs?: number;
}

const DEFAULT_MAX_SIZE = 100;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * A generic LRU cache with TTL-based expiration.
 *
 * Features:
 * - Configurable max size with LRU eviction
 * - TTL-based expiration for entries
 * - Automatic cleanup of expired entries on access
 * - Thread-safe for single-threaded Node.js
 *
 * @example
 * ```typescript
 * const cache = new TTLCache<number[]>({ maxSize: 50, ttlMs: 30000 });
 * cache.set('key', [1, 2, 3]);
 * const value = cache.get('key'); // [1, 2, 3] or undefined if expired
 * ```
 */
export class TTLCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Get a value from the cache.
   * Returns undefined if not found or expired.
   * Updates access time for LRU tracking.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      // Entry expired
      this.cache.delete(key);
      return undefined;
    }

    // Move to end for LRU (delete and re-insert with updated timestamp)
    this.cache.delete(key);
    this.cache.set(key, { value: entry.value, timestamp: now });
    return entry.value;
  }

  /**
   * Set a value in the cache.
   * Evicts expired entries and oldest entry if at capacity.
   */
  set(key: string, value: T): void {
    const now = Date.now();

    // Remove existing entry if present (will be re-added at end)
    this.cache.delete(key);

    // Evict expired entries first
    this.evictExpired(now);

    // Evict oldest entry if still at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    // Add new entry
    this.cache.set(key, { value, timestamp: now });
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a specific key from the cache.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries (including potentially expired ones).
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics.
   */
  getStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }

  /**
   * Evict all expired entries.
   */
  private evictExpired(now: number = Date.now()): void {
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Force cleanup of all expired entries.
   * Useful for periodic maintenance.
   */
  cleanup(): number {
    const sizeBefore = this.cache.size;
    this.evictExpired();
    return sizeBefore - this.cache.size;
  }
}
