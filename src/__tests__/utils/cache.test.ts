import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTLCache } from '../../utils/cache.js';

describe('TTLCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      const cache = new TTLCache<string>();
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      const cache = new TTLCache<string>();
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should delete values', () => {
      const cache = new TTLCache<string>();
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should clear all values', () => {
      const cache = new TTLCache<string>();
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('should check if key exists', () => {
      const cache = new TTLCache<string>();
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      const cache = new TTLCache<string>({ ttlMs: 1000 });
      cache.set('key1', 'value1');

      // Before expiration
      expect(cache.get('key1')).toBe('value1');

      // After expiration
      vi.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should refresh TTL on access', () => {
      const cache = new TTLCache<string>({ ttlMs: 1000 });
      cache.set('key1', 'value1');

      // Access at 500ms - should refresh TTL
      vi.advanceTimersByTime(500);
      expect(cache.get('key1')).toBe('value1');

      // 500ms later (1000ms from last access) - should still be valid
      vi.advanceTimersByTime(500);
      expect(cache.get('key1')).toBe('value1');

      // 1001ms from last access - should expire
      vi.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should report expired keys as not existing', () => {
      const cache = new TTLCache<string>({ ttlMs: 1000 });
      cache.set('key1', 'value1');

      vi.advanceTimersByTime(1001);
      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      const cache = new TTLCache<string>({ maxSize: 2 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3'); // Should evict key1

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });

    it('should update LRU order on access', () => {
      const cache = new TTLCache<string>({ maxSize: 2 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      // Access key1, making key2 the oldest
      cache.get('key1');

      cache.set('key3', 'value3'); // Should evict key2

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBe('value3');
    });

    it('should evict expired entries before size-based eviction', () => {
      const cache = new TTLCache<string>({ maxSize: 2, ttlMs: 1000 });
      cache.set('key1', 'value1');

      vi.advanceTimersByTime(1001); // key1 expires

      cache.set('key2', 'value2');
      cache.set('key3', 'value3'); // key1 already expired, no eviction of key2

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const cache = new TTLCache<string>({ maxSize: 50, ttlMs: 30000 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(50);
      expect(stats.ttlMs).toBe(30000);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries and return count', () => {
      const cache = new TTLCache<string>({ ttlMs: 1000 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      vi.advanceTimersByTime(1001);

      // Call cleanup directly without any other operations
      const removed = cache.cleanup();
      expect(removed).toBe(2);
      expect(cache.size).toBe(0);
    });

    it('should not affect non-expired entries', () => {
      const cache = new TTLCache<string>({ ttlMs: 1000 });
      cache.set('key1', 'value1');

      vi.advanceTimersByTime(500); // Only half the TTL

      const removed = cache.cleanup();
      expect(removed).toBe(0);
      expect(cache.size).toBe(1);
      expect(cache.get('key1')).toBe('value1');
    });
  });

  describe('default options', () => {
    it('should use default maxSize of 100', () => {
      const cache = new TTLCache<string>();
      const stats = cache.getStats();
      expect(stats.maxSize).toBe(100);
    });

    it('should use default TTL of 1 hour', () => {
      const cache = new TTLCache<string>();
      const stats = cache.getStats();
      expect(stats.ttlMs).toBe(60 * 60 * 1000);
    });
  });
});
