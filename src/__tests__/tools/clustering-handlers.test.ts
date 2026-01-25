import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleSummarizeCodebase,
  handleListConcepts,
  handleSearchByConcept,
  parseSummarizeCodebaseArgs,
  parseListConceptsArgs,
  parseSearchByConceptArgs,
  formatCodebaseSummary,
  formatConceptClusters,
  formatConceptSearchResults,
  type ClusteringToolContext,
} from '../../tools/clustering-handlers.js';
import type { CodeIndexer, CodebaseSummary, CodeChunk } from '../../search/indexer.js';
import type { ConceptCluster } from '../../search/clustering.js';
import { LanceContextError } from '../../utils/errors.js';

// Helper to create a valid ConceptCluster
function createConceptCluster(overrides: Partial<ConceptCluster> = {}): ConceptCluster {
  return {
    id: 0,
    label: 'Test Cluster',
    size: 10,
    keywords: ['test', 'keyword'],
    representativeChunks: ['test.ts:1-10'],
    centroid: [0.1, 0.2, 0.3],
    ...overrides,
  };
}

describe('clustering-handlers', () => {
  let mockIndexer: Partial<CodeIndexer>;
  let context: ClusteringToolContext;

  beforeEach(() => {
    mockIndexer = {
      summarizeCodebase: vi.fn(),
      listConcepts: vi.fn(),
      searchByConcept: vi.fn(),
    };

    context = {
      indexer: mockIndexer as CodeIndexer,
      toolGuidance: '\n---\nGuidance',
    };
  });

  describe('parseSummarizeCodebaseArgs', () => {
    it('should return defaults when no args provided', () => {
      const result = parseSummarizeCodebaseArgs(undefined);
      expect(result.numClusters).toBeUndefined();
    });

    it('should parse numClusters', () => {
      const result = parseSummarizeCodebaseArgs({ numClusters: 5 });
      expect(result.numClusters).toBe(5);
    });

    it('should ignore invalid numClusters', () => {
      const result = parseSummarizeCodebaseArgs({ numClusters: 'invalid' });
      expect(result.numClusters).toBeUndefined();
    });
  });

  describe('formatCodebaseSummary', () => {
    it('should format summary correctly', () => {
      const summary: CodebaseSummary = {
        totalFiles: 100,
        totalChunks: 500,
        languages: [
          { language: 'typescript', fileCount: 80, chunkCount: 400 },
          { language: 'javascript', fileCount: 20, chunkCount: 100 },
        ],
        concepts: [
          createConceptCluster({
            id: 0,
            label: 'Authentication',
            size: 50,
            keywords: ['auth', 'login', 'token', 'jwt', 'session'],
            representativeChunks: ['auth.ts:1-20'],
          }),
        ],
        clusteringQuality: 0.75,
        generatedAt: '2024-01-15T00:00:00.000Z',
      };

      const formatted = formatCodebaseSummary(summary);

      expect(formatted).toContain('# Codebase Summary');
      expect(formatted).toContain('**Total Files**: 100');
      expect(formatted).toContain('**Total Chunks**: 500');
      expect(formatted).toContain('75.0% (silhouette score)');
      expect(formatted).toContain('**typescript**: 80 files');
      expect(formatted).toContain('**Cluster 0: Authentication**');
      expect(formatted).toContain('auth, login, token, jwt, session');
    });
  });

  describe('handleSummarizeCodebase', () => {
    it('should call indexer.summarizeCodebase', async () => {
      const summary: CodebaseSummary = {
        totalFiles: 10,
        totalChunks: 50,
        languages: [],
        concepts: [],
        clusteringQuality: 0.8,
        generatedAt: '2024-01-15T00:00:00.000Z',
      };
      vi.mocked(mockIndexer.summarizeCodebase!).mockResolvedValue(summary);

      await handleSummarizeCodebase({}, context);

      expect(mockIndexer.summarizeCodebase).toHaveBeenCalledWith(undefined);
    });

    it('should pass numClusters option when provided', async () => {
      const summary: CodebaseSummary = {
        totalFiles: 10,
        totalChunks: 50,
        languages: [],
        concepts: [],
        clusteringQuality: 0.8,
        generatedAt: '2024-01-15T00:00:00.000Z',
      };
      vi.mocked(mockIndexer.summarizeCodebase!).mockResolvedValue(summary);

      await handleSummarizeCodebase({ numClusters: 5 }, context);

      expect(mockIndexer.summarizeCodebase).toHaveBeenCalledWith({ numClusters: 5 });
    });

    it('should append tool guidance', async () => {
      const summary: CodebaseSummary = {
        totalFiles: 10,
        totalChunks: 50,
        languages: [],
        concepts: [],
        clusteringQuality: 0.8,
        generatedAt: '2024-01-15T00:00:00.000Z',
      };
      vi.mocked(mockIndexer.summarizeCodebase!).mockResolvedValue(summary);

      const result = await handleSummarizeCodebase({}, context);

      expect(result.content[0].text).toContain('Guidance');
    });
  });

  describe('parseListConceptsArgs', () => {
    it('should return defaults when no args provided', () => {
      const result = parseListConceptsArgs(undefined);
      expect(result.forceRecluster).toBe(false);
    });

    it('should parse forceRecluster', () => {
      const result = parseListConceptsArgs({ forceRecluster: true });
      expect(result.forceRecluster).toBe(true);
    });

    it('should default forceRecluster to false for invalid value', () => {
      const result = parseListConceptsArgs({ forceRecluster: 'true' });
      expect(result.forceRecluster).toBe(false);
    });
  });

  describe('formatConceptClusters', () => {
    it('should return message for empty list', () => {
      expect(formatConceptClusters([])).toContain('No concept clusters found');
    });

    it('should format concepts correctly', () => {
      const concepts: ConceptCluster[] = [
        createConceptCluster({
          id: 0,
          label: 'API Handlers',
          size: 25,
          keywords: ['api', 'handler', 'request', 'response', 'route'],
          representativeChunks: ['api.ts:1-20', 'handler.ts:1-15', 'routes.ts:1-30'],
        }),
        createConceptCluster({
          id: 1,
          label: 'Database',
          size: 15,
          keywords: ['db', 'query', 'model'],
          representativeChunks: ['db.ts:1-50'],
        }),
      ];

      const formatted = formatConceptClusters(concepts);

      expect(formatted).toContain('# Concept Clusters');
      expect(formatted).toContain('## Cluster 0: API Handlers');
      expect(formatted).toContain('**Size**: 25 code chunks');
      expect(formatted).toContain('api, handler, request, response, route');
      expect(formatted).toContain('api.ts:1-20, handler.ts:1-15, routes.ts:1-30');
      expect(formatted).toContain('## Cluster 1: Database');
    });
  });

  describe('handleListConcepts', () => {
    it('should call indexer.listConcepts', async () => {
      vi.mocked(mockIndexer.listConcepts!).mockResolvedValue([]);

      await handleListConcepts({ forceRecluster: true }, context);

      expect(mockIndexer.listConcepts).toHaveBeenCalledWith(true);
    });

    it('should return formatted concepts', async () => {
      const concepts: ConceptCluster[] = [
        createConceptCluster({
          id: 0,
          label: 'Test',
          size: 10,
          keywords: ['test'],
          representativeChunks: ['test.ts:1-10'],
        }),
      ];
      vi.mocked(mockIndexer.listConcepts!).mockResolvedValue(concepts);

      const result = await handleListConcepts({ forceRecluster: false }, context);

      expect(result.content[0].text).toContain('Cluster 0: Test');
    });

    it('should append tool guidance', async () => {
      vi.mocked(mockIndexer.listConcepts!).mockResolvedValue([]);

      const result = await handleListConcepts({ forceRecluster: false }, context);

      expect(result.content[0].text).toContain('Guidance');
    });
  });

  describe('parseSearchByConceptArgs', () => {
    it('should throw when conceptId is missing', () => {
      expect(() => parseSearchByConceptArgs({})).toThrow(LanceContextError);
      expect(() => parseSearchByConceptArgs({})).toThrow('conceptId is required');
    });

    it('should throw when conceptId is negative', () => {
      expect(() => parseSearchByConceptArgs({ conceptId: -1 })).toThrow(LanceContextError);
    });

    it('should parse valid conceptId', () => {
      const result = parseSearchByConceptArgs({ conceptId: 5 });
      expect(result.conceptId).toBe(5);
    });

    it('should use default limit of 10', () => {
      const result = parseSearchByConceptArgs({ conceptId: 0 });
      expect(result.limit).toBe(10);
    });

    it('should parse custom limit', () => {
      const result = parseSearchByConceptArgs({ conceptId: 0, limit: 20 });
      expect(result.limit).toBe(20);
    });

    it('should parse optional query', () => {
      const result = parseSearchByConceptArgs({ conceptId: 0, query: 'authentication' });
      expect(result.query).toBe('authentication');
    });
  });

  describe('formatConceptSearchResults', () => {
    it('should return message for empty results', () => {
      const formatted = formatConceptSearchResults([], 5);
      expect(formatted).toContain('No code found in concept cluster 5');
      expect(formatted).toContain('list_concepts');
    });

    it('should format results with symbol info', () => {
      const results: CodeChunk[] = [
        {
          id: 'test.ts:1-20',
          filepath: 'test.ts',
          content: 'function authenticate() {}',
          startLine: 1,
          endLine: 20,
          language: 'typescript',
          symbolName: 'authenticate',
          symbolType: 'function',
        },
      ];

      const formatted = formatConceptSearchResults(results, 0);

      expect(formatted).toContain('## Result 1: test.ts:1-20');
      expect(formatted).toContain('**Symbol:** `authenticate`');
      expect(formatted).toContain('(function)');
      expect(formatted).toContain('```typescript');
      expect(formatted).toContain('function authenticate()');
    });

    it('should format results without symbol info', () => {
      const results: CodeChunk[] = [
        {
          id: 'config.json:1-10',
          filepath: 'config.json',
          content: '{ "key": "value" }',
          startLine: 1,
          endLine: 10,
          language: 'json',
        },
      ];

      const formatted = formatConceptSearchResults(results, 0);

      expect(formatted).toContain('## Result 1: config.json:1-10');
      expect(formatted).not.toContain('**Symbol:**');
    });
  });

  describe('handleSearchByConcept', () => {
    it('should call indexer.searchByConcept with correct options', async () => {
      vi.mocked(mockIndexer.searchByConcept!).mockResolvedValue([]);

      await handleSearchByConcept({ conceptId: 3, query: 'auth', limit: 5 }, context);

      expect(mockIndexer.searchByConcept).toHaveBeenCalledWith(3, 'auth', 5);
    });

    it('should use default limit when not provided', async () => {
      vi.mocked(mockIndexer.searchByConcept!).mockResolvedValue([]);

      await handleSearchByConcept({ conceptId: 0 }, context);

      expect(mockIndexer.searchByConcept).toHaveBeenCalledWith(0, undefined, 10);
    });

    it('should return formatted results', async () => {
      const results: CodeChunk[] = [
        {
          id: 'result.ts:1-10',
          filepath: 'result.ts',
          content: 'code here',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
      ];
      vi.mocked(mockIndexer.searchByConcept!).mockResolvedValue(results);

      const result = await handleSearchByConcept({ conceptId: 0 }, context);

      expect(result.content[0].text).toContain('result.ts:1-10');
    });

    it('should append tool guidance', async () => {
      vi.mocked(mockIndexer.searchByConcept!).mockResolvedValue([]);

      const result = await handleSearchByConcept({ conceptId: 0 }, context);

      expect(result.content[0].text).toContain('Guidance');
    });
  });
});
