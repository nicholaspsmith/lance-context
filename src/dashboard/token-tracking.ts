/**
 * Token tracking module for estimating tokens saved by lance-context operations.
 *
 * Token estimation is based on the common approximation that 1 token ≈ 4 characters.
 * This provides a rough estimate for understanding the efficiency gains from using
 * semantic search vs. reading entire files.
 */

/**
 * Approximate characters per token (industry standard estimate)
 */
const CHARS_PER_TOKEN = 4;

/**
 * Average lines per file in a typical codebase
 */
const AVG_LINES_PER_FILE = 200;

/**
 * Average characters per line of code
 */
const AVG_CHARS_PER_LINE = 60;

/**
 * Token savings event types
 */
export type TokenSavingsEventType =
  | 'search_code'
  | 'search_similar'
  | 'get_symbols_overview'
  | 'find_symbol'
  | 'summarize_codebase'
  | 'list_concepts'
  | 'search_by_concept';

/**
 * Record of a single token savings event
 */
export interface TokenSavingsEvent {
  type: TokenSavingsEventType;
  timestamp: number;
  /** Characters returned to the agent */
  charsReturned: number;
  /** Estimated characters that would have been read without lance-context */
  charsAvoided: number;
  /** Number of files that would have been read */
  filesAvoided: number;
  /** Additional context about the operation */
  context?: string;
}

/**
 * Aggregated token savings statistics
 */
export interface TokenSavingsStats {
  /** Total estimated tokens saved */
  tokensSaved: number;
  /** Total characters returned */
  charsReturned: number;
  /** Total characters avoided (not sent to agent) */
  charsAvoided: number;
  /** Total files avoided reading */
  filesAvoided: number;
  /** Number of operations tracked */
  operationCount: number;
  /** Savings breakdown by operation type */
  byType: Record<
    TokenSavingsEventType,
    {
      count: number;
      tokensSaved: number;
      charsReturned: number;
      charsAvoided: number;
    }
  >;
  /** Efficiency percentage (chars avoided / total chars) */
  efficiencyPercent: number;
  /** Session start time */
  sessionStart: number;
}

/**
 * Token savings tracker for a session
 */
export class TokenSavingsTracker {
  private events: TokenSavingsEvent[] = [];
  private sessionStart: number = Date.now();

  /**
   * Record a search_code operation
   * @param charsReturned Characters in the search results
   * @param matchedFiles Number of files that matched
   * @param totalFilesSearched Total files in the index
   */
  recordSearchCode(charsReturned: number, matchedFiles: number, totalFilesSearched: number): void {
    // Without semantic search, agent might read ~5-10 files to find what they need
    const filesAvoided = Math.max(0, Math.min(10, totalFilesSearched) - matchedFiles);
    const charsAvoided = filesAvoided * AVG_LINES_PER_FILE * AVG_CHARS_PER_LINE;

    this.events.push({
      type: 'search_code',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Searched ${totalFilesSearched} files, returned ${matchedFiles} matches`,
    });
  }

  /**
   * Record a search_similar operation
   * @param charsReturned Characters in the similar code results
   * @param matchedChunks Number of similar chunks found
   */
  recordSearchSimilar(charsReturned: number, matchedChunks: number): void {
    // Without search_similar, agent would read multiple files to find patterns
    const filesAvoided = Math.max(3, matchedChunks);
    const charsAvoided = filesAvoided * AVG_LINES_PER_FILE * AVG_CHARS_PER_LINE;

    this.events.push({
      type: 'search_similar',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Found ${matchedChunks} similar code chunks`,
    });
  }

  /**
   * Record a get_symbols_overview operation
   * @param charsReturned Characters in the symbols overview
   * @param fileLines Total lines in the file
   */
  recordSymbolsOverview(charsReturned: number, fileLines: number): void {
    // Without symbols overview, agent would read the entire file
    const charsAvoided = Math.max(0, fileLines * AVG_CHARS_PER_LINE - charsReturned);

    this.events.push({
      type: 'get_symbols_overview',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided: 0, // Same file, just more efficient
      context: `File has ${fileLines} lines`,
    });
  }

  /**
   * Record a find_symbol operation
   * @param charsReturned Characters in the symbol results
   * @param filesSearched Number of files searched
   */
  recordFindSymbol(charsReturned: number, filesSearched: number): void {
    // Without find_symbol, agent would grep and read multiple files
    const filesAvoided = Math.max(0, Math.min(filesSearched, 5) - 1);
    const charsAvoided = filesAvoided * AVG_LINES_PER_FILE * AVG_CHARS_PER_LINE;

    this.events.push({
      type: 'find_symbol',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Searched ${filesSearched} files`,
    });
  }

  /**
   * Record a summarize_codebase operation
   * @param charsReturned Characters in the summary
   * @param totalFiles Total files in codebase
   */
  recordSummarizeCodebase(charsReturned: number, totalFiles: number): void {
    // Without summarize, agent would explore many files to understand structure
    const filesAvoided = Math.min(totalFiles, 20); // Agent would read ~20 files
    const charsAvoided = filesAvoided * AVG_LINES_PER_FILE * AVG_CHARS_PER_LINE;

    this.events.push({
      type: 'summarize_codebase',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Summarized ${totalFiles} files`,
    });
  }

  /**
   * Record a list_concepts operation
   * @param charsReturned Characters in the concepts list
   * @param clusterCount Number of concept clusters
   */
  recordListConcepts(charsReturned: number, clusterCount: number): void {
    // Without concepts, agent would explore files to understand organization
    const filesAvoided = Math.min(clusterCount * 3, 15);
    const charsAvoided = filesAvoided * AVG_LINES_PER_FILE * AVG_CHARS_PER_LINE;

    this.events.push({
      type: 'list_concepts',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Found ${clusterCount} concept clusters`,
    });
  }

  /**
   * Record a search_by_concept operation
   * @param charsReturned Characters in the concept search results
   * @param matchedChunks Number of chunks in the concept
   */
  recordSearchByConcept(charsReturned: number, matchedChunks: number): void {
    const filesAvoided = Math.max(2, Math.floor(matchedChunks / 2));
    const charsAvoided = filesAvoided * AVG_LINES_PER_FILE * AVG_CHARS_PER_LINE;

    this.events.push({
      type: 'search_by_concept',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Explored concept with ${matchedChunks} chunks`,
    });
  }

  /**
   * Get aggregated statistics
   */
  getStats(): TokenSavingsStats {
    const byType: TokenSavingsStats['byType'] = {
      search_code: { count: 0, tokensSaved: 0, charsReturned: 0, charsAvoided: 0 },
      search_similar: { count: 0, tokensSaved: 0, charsReturned: 0, charsAvoided: 0 },
      get_symbols_overview: { count: 0, tokensSaved: 0, charsReturned: 0, charsAvoided: 0 },
      find_symbol: { count: 0, tokensSaved: 0, charsReturned: 0, charsAvoided: 0 },
      summarize_codebase: { count: 0, tokensSaved: 0, charsReturned: 0, charsAvoided: 0 },
      list_concepts: { count: 0, tokensSaved: 0, charsReturned: 0, charsAvoided: 0 },
      search_by_concept: { count: 0, tokensSaved: 0, charsReturned: 0, charsAvoided: 0 },
    };

    let totalCharsReturned = 0;
    let totalCharsAvoided = 0;
    let totalFilesAvoided = 0;

    for (const event of this.events) {
      totalCharsReturned += event.charsReturned;
      totalCharsAvoided += event.charsAvoided;
      totalFilesAvoided += event.filesAvoided;

      const typeStats = byType[event.type];
      typeStats.count++;
      typeStats.charsReturned += event.charsReturned;
      typeStats.charsAvoided += event.charsAvoided;
      typeStats.tokensSaved += Math.floor(event.charsAvoided / CHARS_PER_TOKEN);
    }

    const totalTokensSaved = Math.floor(totalCharsAvoided / CHARS_PER_TOKEN);
    const totalChars = totalCharsReturned + totalCharsAvoided;
    const efficiencyPercent =
      totalChars > 0 ? Math.round((totalCharsAvoided / totalChars) * 100) : 0;

    return {
      tokensSaved: totalTokensSaved,
      charsReturned: totalCharsReturned,
      charsAvoided: totalCharsAvoided,
      filesAvoided: totalFilesAvoided,
      operationCount: this.events.length,
      byType,
      efficiencyPercent,
      sessionStart: this.sessionStart,
    };
  }

  /**
   * Reset the tracker for a new session
   */
  reset(): void {
    this.events = [];
    this.sessionStart = Date.now();
  }

  /**
   * Get recent events (for debugging/display)
   */
  getRecentEvents(limit: number = 10): TokenSavingsEvent[] {
    return this.events.slice(-limit);
  }
}

/**
 * Global token savings tracker instance
 */
export const tokenTracker = new TokenSavingsTracker();
