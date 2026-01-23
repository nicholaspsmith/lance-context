import { vi } from 'vitest';
import type { EmbeddingBackend } from '../../embeddings/types.js';

/**
 * Creates a mock EmbeddingBackend for testing
 */
export function createMockEmbeddingBackend(
  overrides: Partial<EmbeddingBackend> = {}
): EmbeddingBackend {
  const dimensions = overrides.getDimensions?.() ?? 1536;

  return {
    name: 'mock',
    initialize: vi.fn().mockResolvedValue(undefined),
    embed: vi.fn().mockImplementation(async () => {
      return Array(dimensions)
        .fill(0)
        .map(() => Math.random());
    }),
    embedBatch: vi.fn().mockImplementation(async (texts: string[]) => {
      return texts.map(() =>
        Array(dimensions)
          .fill(0)
          .map(() => Math.random())
      );
    }),
    getDimensions: vi.fn().mockReturnValue(dimensions),
    ...overrides,
  };
}

/**
 * Creates a mock EmbeddingBackend that fails initialization
 */
export function createFailingMockEmbeddingBackend(error: Error): EmbeddingBackend {
  return {
    name: 'failing-mock',
    initialize: vi.fn().mockRejectedValue(error),
    embed: vi.fn().mockRejectedValue(error),
    embedBatch: vi.fn().mockRejectedValue(error),
    getDimensions: vi.fn().mockReturnValue(1536),
  };
}
