import { beforeEach, vi } from 'vitest';

// Reset all mocks before each test
beforeEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

// Suppress console.error in tests unless debugging
if (!process.env.DEBUG_TESTS) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
}
