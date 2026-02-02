/**
 * Token tracking module for estimating tokens saved by lance-context operations.
 *
 * Token estimation is based on the common approximation that 1 token ≈ 4 characters.
 * This provides a rough estimate for understanding the efficiency gains from using
 * semantic search vs. reading entire files.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Approximate characters per token (industry standard estimate)
 */
const CHARS_PER_TOKEN = 4;

/**
 * Average characters per line of code
 */
const AVG_CHARS_PER_LINE = 60;

/**
 * Maximum number of events to keep in history (prevents unbounded growth)
 */
const MAX_EVENTS = 1000;

/**
 * Debounce delay for disk writes in milliseconds
 */
const SAVE_DEBOUNCE_MS = 1000;

/**
 * Estimated lines an agent would read via grep for different operations.
 * These are conservative estimates based on typical grep + read patterns:
 * - grep returns ~5-10 lines of context per match
 * - agent might read 2-3 additional snippets of ~20-30 lines
 */
const GREP_ESTIMATE = {
  /** search_code: grep + read a few snippets to understand context */
  SEARCH_CODE_LINES: 100,
  /** search_similar: would need to read multiple files to find patterns */
  SEARCH_SIMILAR_LINES: 150,
  /** find_symbol: grep for symbol name, read definition + usages */
  FIND_SYMBOL_LINES: 80,
  /** summarize_codebase: would read file headers, READMEs, key files */
  SUMMARIZE_LINES: 300,
  /** list_concepts: would explore directory structure, read samples */
  LIST_CONCEPTS_LINES: 200,
  /** search_by_concept: grep by keywords, read matching sections */
  SEARCH_BY_CONCEPT_LINES: 120,
};

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
 * Valid event types for validation
 */
const VALID_EVENT_TYPES: Set<string> = new Set([
  'search_code',
  'search_similar',
  'get_symbols_overview',
  'find_symbol',
  'summarize_codebase',
  'list_concepts',
  'search_by_concept',
]);

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
 * Validate that an object is a valid TokenSavingsEvent
 */
function isValidEvent(event: unknown): event is TokenSavingsEvent {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Record<string, unknown>;
  return (
    typeof e.type === 'string' &&
    VALID_EVENT_TYPES.has(e.type) &&
    typeof e.timestamp === 'number' &&
    typeof e.charsReturned === 'number' &&
    typeof e.charsAvoided === 'number' &&
    typeof e.filesAvoided === 'number'
  );
}

/**
 * Token savings tracker for a session
 */
export class TokenSavingsTracker {
  private events: TokenSavingsEvent[] = [];
  private sessionStart: number = Date.now();
  private onUpdate: (() => void) | null = null;
  private projectPath: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSave = false;

  /**
   * Set the project path and load persisted data
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
    this.loadFromDisk();
  }

  /**
   * Get the path to the token savings file
   */
  private getFilePath(): string | null {
    if (!this.projectPath) return null;
    return path.join(this.projectPath, '.glancey', 'token-savings.json');
  }

  /**
   * Load token savings from disk with validation
   */
  private loadFromDisk(): void {
    const filePath = this.getFilePath();
    if (!filePath) return;

    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (Array.isArray(data.events)) {
          // Validate each event and only keep valid ones
          this.events = data.events.filter(isValidEvent);
          // Apply event limit on load
          if (this.events.length > MAX_EVENTS) {
            this.events = this.events.slice(-MAX_EVENTS);
          }
        }
        if (typeof data.sessionStart === 'number') {
          this.sessionStart = data.sessionStart;
        }
      }
    } catch {
      // Ignore errors loading from disk
    }
  }

  /**
   * Save token savings to disk (debounced to avoid blocking on every event)
   */
  private saveToDisk(): void {
    const filePath = this.getFilePath();
    if (!filePath) return;

    // Mark that we have pending changes
    this.pendingSave = true;

    // If a save is already scheduled, let it handle the write
    if (this.saveTimer) return;

    // Schedule a debounced write
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (!this.pendingSave) return;
      this.pendingSave = false;

      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(
          filePath,
          JSON.stringify({ events: this.events, sessionStart: this.sessionStart }, null, 2)
        );
      } catch {
        // Ignore errors saving to disk
      }
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Set callback to be called when token savings are updated
   */
  setOnUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  /**
   * Notify that token savings have been updated
   */
  private notifyUpdate(): void {
    // Rotate events if we exceed the limit
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }

    this.saveToDisk();
    if (this.onUpdate) {
      this.onUpdate();
    }
  }

  /**
   * Record a search_code operation
   * @param charsReturned Characters in the search results
   * @param matchedFiles Number of files that matched
   * @param totalFilesSearched Total files in the index
   */
  recordSearchCode(charsReturned: number, matchedFiles: number, totalFilesSearched: number): void {
    // Estimate: agent would grep and read ~100 lines of context to find what semantic search found
    const charsAvoided = Math.max(
      0,
      GREP_ESTIMATE.SEARCH_CODE_LINES * AVG_CHARS_PER_LINE - charsReturned
    );
    // Estimate: agent would grep through ~5-10 files to find what semantic search found directly
    const filesAvoided = Math.max(0, Math.min(10, totalFilesSearched) - matchedFiles);

    this.events.push({
      type: 'search_code',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Searched ${totalFilesSearched} files, returned ${matchedFiles} matches`,
    });
    this.notifyUpdate();
  }

  /**
   * Record a search_similar operation
   * @param charsReturned Characters in the similar code results
   * @param matchedChunks Number of similar chunks found
   */
  recordSearchSimilar(charsReturned: number, matchedChunks: number): void {
    // Estimate: agent would grep patterns and read ~150 lines across files
    const charsAvoided = Math.max(
      0,
      GREP_ESTIMATE.SEARCH_SIMILAR_LINES * AVG_CHARS_PER_LINE - charsReturned
    );
    // Estimate: agent would read at least 3 files to find similar patterns
    const filesAvoided = Math.max(3, matchedChunks);

    this.events.push({
      type: 'search_similar',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Found ${matchedChunks} similar code chunks`,
    });
    this.notifyUpdate();
  }

  /**
   * Record a get_symbols_overview operation
   * @param charsReturned Characters in the symbols overview
   * @param fileLines Total lines in the file
   */
  recordSymbolsOverview(charsReturned: number, fileLines: number): void {
    // Without symbols overview, agent would read larger portions of the file
    const charsAvoided = Math.max(0, fileLines * AVG_CHARS_PER_LINE - charsReturned);

    this.events.push({
      type: 'get_symbols_overview',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided: 0,
      context: `File has ${fileLines} lines`,
    });
    this.notifyUpdate();
  }

  /**
   * Record a find_symbol operation
   * @param charsReturned Characters in the symbol results
   * @param filesSearched Number of files searched
   */
  recordFindSymbol(charsReturned: number, filesSearched: number): void {
    // Estimate: agent would grep for symbol and read ~80 lines of context
    const charsAvoided = Math.max(
      0,
      GREP_ESTIMATE.FIND_SYMBOL_LINES * AVG_CHARS_PER_LINE - charsReturned
    );
    // Estimate: agent would grep through multiple files to find symbol definition
    const filesAvoided = Math.max(0, Math.min(filesSearched, 5) - 1);

    this.events.push({
      type: 'find_symbol',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Searched ${filesSearched} files`,
    });
    this.notifyUpdate();
  }

  /**
   * Record a summarize_codebase operation
   * @param charsReturned Characters in the summary
   * @param totalFiles Total files in codebase
   */
  recordSummarizeCodebase(charsReturned: number, totalFiles: number): void {
    // Estimate: agent would read READMEs, directory listings, ~300 lines total
    const charsAvoided = Math.max(
      0,
      GREP_ESTIMATE.SUMMARIZE_LINES * AVG_CHARS_PER_LINE - charsReturned
    );
    // Estimate: agent would explore ~20 files to understand codebase structure
    const filesAvoided = Math.min(totalFiles, 20);

    this.events.push({
      type: 'summarize_codebase',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Summarized ${totalFiles} files`,
    });
    this.notifyUpdate();
  }

  /**
   * Record a list_concepts operation
   * @param charsReturned Characters in the concepts list
   * @param clusterCount Number of concept clusters
   */
  recordListConcepts(charsReturned: number, clusterCount: number): void {
    // Estimate: agent would explore directory structure, read ~200 lines
    const charsAvoided = Math.max(
      0,
      GREP_ESTIMATE.LIST_CONCEPTS_LINES * AVG_CHARS_PER_LINE - charsReturned
    );
    // Estimate: agent would explore ~3 files per concept cluster to understand organization
    const filesAvoided = Math.min(clusterCount * 3, 15);

    this.events.push({
      type: 'list_concepts',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Found ${clusterCount} concept clusters`,
    });
    this.notifyUpdate();
  }

  /**
   * Record a search_by_concept operation
   * @param charsReturned Characters in the concept search results
   * @param matchedChunks Number of chunks in the concept
   */
  recordSearchByConcept(charsReturned: number, matchedChunks: number): void {
    // Estimate: agent would grep by keywords and read ~120 lines
    const charsAvoided = Math.max(
      0,
      GREP_ESTIMATE.SEARCH_BY_CONCEPT_LINES * AVG_CHARS_PER_LINE - charsReturned
    );
    // Estimate: agent would grep and read ~half the matched chunks worth of files
    const filesAvoided = Math.max(2, Math.floor(matchedChunks / 2));

    this.events.push({
      type: 'search_by_concept',
      timestamp: Date.now(),
      charsReturned,
      charsAvoided,
      filesAvoided,
      context: `Explored concept with ${matchedChunks} chunks`,
    });
    this.notifyUpdate();
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
