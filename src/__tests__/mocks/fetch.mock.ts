import { vi } from 'vitest';

export interface MockFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

type FetchHandler = (url: string, options?: RequestInit) => Promise<MockFetchResponse>;

/**
 * Creates a mock fetch function
 */
export function createMockFetch(handler: FetchHandler) {
  return vi.fn().mockImplementation(handler);
}

/**
 * Creates a mock fetch that returns a successful JSON response
 */
export function createSuccessFetch(data: unknown): ReturnType<typeof createMockFetch> {
  return createMockFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }));
}

/**
 * Creates a mock fetch that returns an error response
 */
export function createErrorFetch(
  status: number,
  statusText: string = 'Error',
  body: string = ''
): ReturnType<typeof createMockFetch> {
  return createMockFetch(async () => ({
    ok: false,
    status,
    statusText,
    json: async () => ({ error: body }),
    text: async () => body,
  }));
}

/**
 * Creates a mock fetch that fails with a network error
 */
export function createNetworkErrorFetch(
  message: string = 'fetch failed'
): ReturnType<typeof createMockFetch> {
  return vi.fn().mockRejectedValue(new Error(message));
}

/**
 * Creates a mock fetch that returns different responses based on call count
 */
export function createSequentialFetch(
  responses: MockFetchResponse[]
): ReturnType<typeof createMockFetch> {
  let callCount = 0;
  return vi.fn().mockImplementation(async () => {
    const response = responses[Math.min(callCount, responses.length - 1)];
    callCount++;
    return response;
  });
}

/**
 * Creates Jina-style embedding response
 */
export function createJinaEmbeddingResponse(embeddings: number[][]): MockFetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: embeddings.map((embedding) => ({ embedding })),
    }),
    text: async () =>
      JSON.stringify({
        data: embeddings.map((embedding) => ({ embedding })),
      }),
  };
}

/**
 * Creates Ollama-style embedding response (legacy single embedding)
 */
export function createOllamaEmbeddingResponse(embedding: number[]): MockFetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({ embedding }),
    text: async () => JSON.stringify({ embedding }),
  };
}

/**
 * Creates Ollama-style batch embedding response (/api/embed)
 */
export function createOllamaBatchEmbeddingResponse(embeddings: number[][]): MockFetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({ embeddings }),
    text: async () => JSON.stringify({ embeddings }),
  };
}
