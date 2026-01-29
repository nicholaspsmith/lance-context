import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '../../embeddings/retry.js';

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('immediate success', () => {
    it('should return response on first successful call', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const response = await fetchWithRetry('https://api.test.com', {});

      expect(response).toBe(mockResponse);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should pass options to fetch', async () => {
      const mockResponse = { ok: true, status: 200 };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      };

      await fetchWithRetry('https://api.test.com', options);

      expect(fetch).toHaveBeenCalledWith('https://api.test.com', expect.objectContaining(options));
    });
  });

  describe('retryable status codes', () => {
    it('should retry on 429 status code', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry('https://api.test.com', {}, { maxRetries: 3 });

      // First call returns 429
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Wait for retry delay (2000ms base for 429 rate limit errors)
      await vi.advanceTimersByTimeAsync(2000);

      const response = await responsePromise;
      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 500 status code', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry('https://api.test.com', {});

      await vi.advanceTimersByTimeAsync(1000);

      const response = await responsePromise;
      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 503 status code', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry('https://api.test.com', {});

      await vi.advanceTimersByTimeAsync(1000);

      const response = await responsePromise;
      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 408 status code', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 408, statusText: 'Request Timeout' })
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry('https://api.test.com', {});

      await vi.advanceTimersByTimeAsync(1000);

      const response = await responsePromise;
      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('exponential backoff', () => {
    it('should use exponential backoff timing for server errors', async () => {
      // Use 500 status to test standard exponential backoff (429 has special handling)
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry(
        'https://api.test.com',
        {},
        {
          maxRetries: 3,
          baseDelayMs: 1000,
        }
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // First retry: 1000ms (1000 * 2^0)
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second retry: 2000ms (1000 * 2^1)
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Third retry: 4000ms (1000 * 2^2)
      await vi.advanceTimersByTimeAsync(4000);
      expect(mockFetch).toHaveBeenCalledTimes(4);

      const response = await responsePromise;
      expect(response.ok).toBe(true);
    });

    it('should use longer backoff for 429 rate limit errors', async () => {
      // 429 errors use 2x base delay (min 2000ms) for more graceful rate limiting
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry(
        'https://api.test.com',
        {},
        {
          maxRetries: 3,
          baseDelayMs: 1000,
        }
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // First retry: 2000ms (2x base delay for rate limits)
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second retry: 4000ms (2000 * 2^1)
      await vi.advanceTimersByTimeAsync(4000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      const response = await responsePromise;
      expect(response.ok).toBe(true);
    });

    it('should respect maxDelayMs for server errors', async () => {
      // Use 500 status to test standard maxDelayMs behavior
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry(
        'https://api.test.com',
        {},
        {
          maxRetries: 3,
          baseDelayMs: 5000,
          maxDelayMs: 8000,
        }
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // First retry: 5000ms (5000 * 2^0)
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second retry: capped at 8000ms (would be 10000 = 5000 * 2^1)
      await vi.advanceTimersByTimeAsync(8000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Third retry: capped at 8000ms (would be 20000 = 5000 * 2^2)
      await vi.advanceTimersByTimeAsync(8000);
      expect(mockFetch).toHaveBeenCalledTimes(4);

      await responsePromise;
    });
  });

  describe('max retries exhaustion', () => {
    it('should return error response after max retries', async () => {
      const errorResponse = { ok: false, status: 429, statusText: 'Too Many Requests' };
      const mockFetch = vi.fn().mockResolvedValue(errorResponse);
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry('https://api.test.com', {}, { maxRetries: 2 });

      // Process all retries (429 uses 2x base delay, min 2000ms)
      await vi.advanceTimersByTimeAsync(2000); // First retry
      await vi.advanceTimersByTimeAsync(4000); // Second retry

      const response = await responsePromise;
      expect(response.ok).toBe(false);
      expect(response.status).toBe(429);
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('non-retryable errors', () => {
    it('should not retry on 400 status code', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' });
      vi.stubGlobal('fetch', mockFetch);

      const response = await fetchWithRetry('https://api.test.com', {});

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 401 status code', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
      vi.stubGlobal('fetch', mockFetch);

      const response = await fetchWithRetry('https://api.test.com', {});

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 403 status code', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
      vi.stubGlobal('fetch', mockFetch);

      const response = await fetchWithRetry('https://api.test.com', {});

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 404 status code', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
      vi.stubGlobal('fetch', mockFetch);

      const response = await fetchWithRetry('https://api.test.com', {});

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('network errors', () => {
    it('should retry on fetch network error', async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry('https://api.test.com', {});

      await vi.advanceTimersByTimeAsync(1000);

      const response = await responsePromise;
      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on ECONNREFUSED error', async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry('https://api.test.com', {});

      await vi.advanceTimersByTimeAsync(1000);

      const response = await responsePromise;
      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('fetch failed'));
      vi.stubGlobal('fetch', mockFetch);

      // Wrap in try-catch to properly handle the rejection
      let error: unknown = null;
      const responsePromise = fetchWithRetry('https://api.test.com', {}, { maxRetries: 2 }).catch(
        (e) => {
          error = e;
        }
      );

      // Need to flush all timers to let the retries complete
      await vi.runAllTimersAsync();
      await responsePromise;

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('fetch failed');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-network errors', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('some other error'));
      vi.stubGlobal('fetch', mockFetch);

      await expect(fetchWithRetry('https://api.test.com', {})).rejects.toThrow('some other error');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('default options', () => {
    it('should use default maxRetries of 5', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry('https://api.test.com', {});

      // Process all retries (429 uses 2x base delay, min 2000ms for rate limits)
      // Delays: 2s, 4s, 8s, 16s, 32s (but capped at 60s maxDelay)
      await vi.advanceTimersByTimeAsync(2000); // Retry 1
      await vi.advanceTimersByTimeAsync(4000); // Retry 2
      await vi.advanceTimersByTimeAsync(8000); // Retry 3
      await vi.advanceTimersByTimeAsync(16000); // Retry 4
      await vi.advanceTimersByTimeAsync(32000); // Retry 5

      await responsePromise;
      expect(mockFetch).toHaveBeenCalledTimes(6); // Initial + 5 retries
    });
  });

  describe('Retry-After header', () => {
    it('should respect Retry-After header in seconds', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'retry-after' ? '5' : null),
        },
      };
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry('https://api.test.com', {}, { maxRetries: 3 });

      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should wait ~5 seconds (5000ms) plus small jitter (up to 1000ms)
      await vi.advanceTimersByTimeAsync(6000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const response = await responsePromise;
      expect(response.ok).toBe(true);
    });

    it('should cap Retry-After at maxDelayMs', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'retry-after' ? '120' : null),
        },
      };
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce({ ok: true, status: 200 });
      vi.stubGlobal('fetch', mockFetch);

      const responsePromise = fetchWithRetry(
        'https://api.test.com',
        {},
        { maxRetries: 3, maxDelayMs: 10000 }
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should be capped at maxDelayMs (10000ms) even though Retry-After says 120s
      await vi.advanceTimersByTimeAsync(10000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const response = await responsePromise;
      expect(response.ok).toBe(true);
    });
  });
});
