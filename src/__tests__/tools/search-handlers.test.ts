import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleSearchCode,
  handleSearchSimilar,
  parseSearchCodeArgs,
  parseSearchSimilarArgs,
  formatSearchResults,
} from '../../tools/search-handlers.js';
import type { ToolContext } from '../../tools/types.js';
import type { CodeIndexer, CodeChunk } from '../../search/indexer.js';
import { GlanceyError } from '../../utils/errors.js';

describe('search-handlers', () => {
  let mockIndexer: Partial<CodeIndexer>;
  let context: ToolContext;

  beforeEach(() => {
    mockIndexer = {
      search: vi.fn(),
      searchSimilar: vi.fn(),
    };

    context = {
      indexer: mockIndexer as CodeIndexer,
      projectPath: '/test/project',
      toolGuidance: '\n---\nGuidance',
    };
  });

  describe('parseSearchCodeArgs', () => {
    it('should throw when query is missing', () => {
      expect(() => parseSearchCodeArgs(undefined)).toThrow(GlanceyError);
      expect(() => parseSearchCodeArgs({})).toThrow('query is required');
    });

    it('should throw when query is empty string', () => {
      expect(() => parseSearchCodeArgs({ query: '' })).toThrow('query is required');
    });

    it('should parse valid query', () => {
      const result = parseSearchCodeArgs({ query: 'find function' });
      expect(result.query).toBe('find function');
    });

    it('should use default limit of 10', () => {
      const result = parseSearchCodeArgs({ query: 'test' });
      expect(result.limit).toBe(10);
    });

    it('should parse custom limit', () => {
      const result = parseSearchCodeArgs({ query: 'test', limit: 20 });
      expect(result.limit).toBe(20);
    });

    it('should ignore invalid limit', () => {
      const result = parseSearchCodeArgs({ query: 'test', limit: 'invalid' });
      expect(result.limit).toBe(10);
    });

    it('should parse pathPattern', () => {
      const result = parseSearchCodeArgs({ query: 'test', pathPattern: 'src/**/*.ts' });
      expect(result.pathPattern).toBe('src/**/*.ts');
    });

    it('should parse languages array', () => {
      const result = parseSearchCodeArgs({
        query: 'test',
        languages: ['typescript', 'javascript'],
      });
      expect(result.languages).toEqual(['typescript', 'javascript']);
    });

    it('should ignore invalid languages', () => {
      const result = parseSearchCodeArgs({ query: 'test', languages: 'typescript' });
      expect(result.languages).toBeUndefined();
    });
  });

  describe('formatSearchResults', () => {
    it('should return "No results found" for empty array', () => {
      expect(formatSearchResults([])).toBe('No results found.');
    });

    it('should format single result', () => {
      const results: CodeChunk[] = [
        {
          id: 'test.ts:1-10',
          filepath: 'test.ts',
          content: 'function hello() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
      ];

      const formatted = formatSearchResults(results);

      expect(formatted).toContain('## Result 1: test.ts:1-10');
      expect(formatted).toContain('```typescript');
      expect(formatted).toContain('function hello() {}');
    });

    it('should include symbol info when present', () => {
      const results: CodeChunk[] = [
        {
          id: 'test.ts:1-10',
          filepath: 'test.ts',
          content: 'function hello() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          symbolName: 'hello',
          symbolType: 'function',
        },
      ];

      const formatted = formatSearchResults(results);

      expect(formatted).toContain('**Symbol:** `hello`');
      expect(formatted).toContain('(function)');
    });

    it('should format multiple results', () => {
      const results: CodeChunk[] = [
        {
          id: 'a.ts:1-5',
          filepath: 'a.ts',
          content: 'code a',
          startLine: 1,
          endLine: 5,
          language: 'typescript',
        },
        {
          id: 'b.ts:1-5',
          filepath: 'b.ts',
          content: 'code b',
          startLine: 1,
          endLine: 5,
          language: 'typescript',
        },
      ];

      const formatted = formatSearchResults(results);

      expect(formatted).toContain('## Result 1: a.ts:1-5');
      expect(formatted).toContain('## Result 2: b.ts:1-5');
    });
  });

  describe('handleSearchCode', () => {
    it('should call indexer.search with correct options', async () => {
      vi.mocked(mockIndexer.search!).mockResolvedValue([]);

      await handleSearchCode(
        {
          query: 'find function',
          limit: 5,
          pathPattern: 'src/**/*.ts',
          languages: ['typescript'],
        },
        context
      );

      expect(mockIndexer.search).toHaveBeenCalledWith({
        query: 'find function',
        limit: 5,
        pathPattern: 'src/**/*.ts',
        languages: ['typescript'],
      });
    });

    it('should return formatted results', async () => {
      vi.mocked(mockIndexer.search!).mockResolvedValue([
        {
          id: 'test.ts:1-10',
          filepath: 'test.ts',
          content: 'function hello() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
      ]);

      const result = await handleSearchCode({ query: 'hello' }, context);

      expect(result.content[0].text).toContain('test.ts:1-10');
      expect(result.content[0].text).toContain('function hello()');
    });

    it('should return "No results found" for empty results', async () => {
      vi.mocked(mockIndexer.search!).mockResolvedValue([]);

      const result = await handleSearchCode({ query: 'nonexistent' }, context);

      expect(result.content[0].text).toContain('No results found');
    });

    it('should append tool guidance', async () => {
      vi.mocked(mockIndexer.search!).mockResolvedValue([]);

      const result = await handleSearchCode({ query: 'test' }, context);

      expect(result.content[0].text).toContain('Guidance');
    });
  });

  describe('parseSearchSimilarArgs', () => {
    it('should throw when neither code nor filepath provided', () => {
      expect(() => parseSearchSimilarArgs({})).toThrow(GlanceyError);
      expect(() => parseSearchSimilarArgs({})).toThrow('Either code or filepath must be provided');
    });

    it('should accept code', () => {
      const result = parseSearchSimilarArgs({ code: 'function test() {}' });
      expect(result.code).toBe('function test() {}');
    });

    it('should accept filepath', () => {
      const result = parseSearchSimilarArgs({ filepath: 'src/test.ts' });
      expect(result.filepath).toBe('src/test.ts');
    });

    it('should parse line range', () => {
      const result = parseSearchSimilarArgs({ filepath: 'test.ts', startLine: 10, endLine: 20 });
      expect(result.startLine).toBe(10);
      expect(result.endLine).toBe(20);
    });

    it('should default excludeSelf to true', () => {
      const result = parseSearchSimilarArgs({ code: 'test' });
      expect(result.excludeSelf).toBe(true);
    });

    it('should allow excludeSelf to be false', () => {
      const result = parseSearchSimilarArgs({ code: 'test', excludeSelf: false });
      expect(result.excludeSelf).toBe(false);
    });
  });

  describe('handleSearchSimilar', () => {
    it('should call indexer.searchSimilar with correct options', async () => {
      vi.mocked(mockIndexer.searchSimilar!).mockResolvedValue([]);

      await handleSearchSimilar(
        {
          code: 'function test() {}',
          limit: 5,
          threshold: 0.8,
          excludeSelf: true,
        },
        context
      );

      expect(mockIndexer.searchSimilar).toHaveBeenCalledWith({
        code: 'function test() {}',
        filepath: undefined,
        startLine: undefined,
        endLine: undefined,
        limit: 5,
        threshold: 0.8,
        excludeSelf: true,
      });
    });

    it('should return formatted results', async () => {
      vi.mocked(mockIndexer.searchSimilar!).mockResolvedValue([
        {
          id: 'similar.ts:1-10',
          filepath: 'similar.ts',
          content: 'function similar() {}',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          similarity: 0.85,
        },
      ]);

      const result = await handleSearchSimilar({ code: 'function test() {}' }, context);

      expect(result.content[0].text).toContain('similar.ts:1-10');
    });

    it('should append tool guidance', async () => {
      vi.mocked(mockIndexer.searchSimilar!).mockResolvedValue([]);

      const result = await handleSearchSimilar({ code: 'test' }, context);

      expect(result.content[0].text).toContain('Guidance');
    });
  });
});
