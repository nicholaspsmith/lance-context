import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type { CodeIndexer, IndexStatus, IndexProgress } from '../search/indexer.js';
import type { GlanceyConfig } from '../config.js';
import type { BackendFallbackInfo } from '../embeddings/types.js';
import { tokenTracker, type TokenSavingsStats } from './token-tracking.js';

/**
 * Command names that can be tracked
 */
export type CommandName =
  | 'index_codebase'
  | 'search_code'
  | 'search_similar'
  | 'get_index_status'
  | 'clear_index'
  | 'get_project_instructions'
  | 'commit'
  // Symbolic analysis tools
  | 'get_symbols_overview'
  | 'find_symbol'
  | 'find_referencing_symbols'
  | 'search_for_pattern'
  | 'replace_symbol_body'
  | 'insert_before_symbol'
  | 'insert_after_symbol'
  | 'rename_symbol'
  // Memory tools
  | 'write_memory'
  | 'read_memory'
  | 'list_memories'
  | 'delete_memory'
  | 'edit_memory'
  // Worktree tools
  | 'create_worktree'
  | 'list_worktrees'
  | 'remove_worktree'
  | 'worktree_status'
  // Clustering tools
  | 'list_concepts'
  | 'search_by_concept'
  | 'summarize_codebase'
  // Dashboard tools
  | 'open_dashboard'
  // Project setup tools
  | 'init_project';

/**
 * Command usage statistics
 */
export interface CommandUsage {
  command: CommandName;
  count: number;
  label: string;
}

/**
 * Events emitted by the DashboardStateManager
 */
export interface DashboardStateEvents {
  progress: (progress: IndexProgress) => void;
  'indexing:start': () => void;
  'indexing:complete': (result: { filesIndexed: number; chunksCreated: number }) => void;
  'status:change': (status: IndexStatus) => void;
  'usage:update': (usage: CommandUsage[]) => void;
}

/**
 * Manages the shared state for the dashboard.
 * Acts as a bridge between the indexer and the dashboard.
 */
/**
 * Human-readable labels for commands
 */
const COMMAND_LABELS: Record<CommandName, string> = {
  index_codebase: 'Index Codebase',
  search_code: 'Search Code',
  search_similar: 'Search Similar',
  get_index_status: 'Get Status',
  clear_index: 'Clear Index',
  get_project_instructions: 'Get Instructions',
  commit: 'Commit',
  // Symbolic analysis tools
  get_symbols_overview: 'Symbols Overview',
  find_symbol: 'Find Symbol',
  find_referencing_symbols: 'Find References',
  search_for_pattern: 'Pattern Search',
  replace_symbol_body: 'Replace Symbol',
  insert_before_symbol: 'Insert Before',
  insert_after_symbol: 'Insert After',
  rename_symbol: 'Rename Symbol',
  // Memory tools
  write_memory: 'Write Memory',
  read_memory: 'Read Memory',
  list_memories: 'List Memories',
  delete_memory: 'Delete Memory',
  edit_memory: 'Edit Memory',
  // Worktree tools
  create_worktree: 'Create Worktree',
  list_worktrees: 'List Worktrees',
  remove_worktree: 'Remove Worktree',
  worktree_status: 'Worktree Status',
  // Clustering tools
  list_concepts: 'List Concepts',
  search_by_concept: 'Search by Concept',
  summarize_codebase: 'Summarize Codebase',
  // Dashboard tools
  open_dashboard: 'Open Dashboard',
  // Project setup tools
  init_project: 'Init Project',
};

/** Maximum number of event listeners to prevent memory leaks */
const MAX_LISTENERS = 20;

/** Directory name where agent worktrees are stored */
const AGENT_WORKTREES_DIR = 'agent-worktrees';

export class DashboardStateManager extends EventEmitter {
  private indexer: CodeIndexer | null = null;
  private config: GlanceyConfig | null = null;
  private projectPath: string | null = null;
  private version: string | null = null;
  private isIndexing = false;
  private lastProgress: IndexProgress | null = null;
  private commandUsage: Map<CommandName, number> = new Map();
  private backendFallback: BackendFallbackInfo | null = null;

  constructor() {
    super();
    // Set max listeners to prevent memory leak warnings and enforce bounds
    this.setMaxListeners(MAX_LISTENERS);
  }

  /**
   * Get the path to the usage file
   */
  private getUsageFilePath(): string | null {
    if (!this.projectPath) return null;
    return path.join(this.projectPath, '.glancey', 'usage.json');
  }

  /**
   * Load command usage from disk
   */
  private loadUsageFromDisk(): void {
    const filePath = this.getUsageFilePath();
    if (!filePath) return;

    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.commandUsage.clear();
        for (const [cmd, count] of Object.entries(data)) {
          if (typeof count === 'number') {
            this.commandUsage.set(cmd as CommandName, count);
          }
        }
      }
    } catch {
      // Ignore errors, start with empty usage
    }
  }

  /**
   * Save command usage to disk
   */
  private saveUsageToDisk(): void {
    const filePath = this.getUsageFilePath();
    if (!filePath) return;

    try {
      const data: Record<string, number> = {};
      for (const [cmd, count] of this.commandUsage) {
        data[cmd] = count;
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch {
      // Ignore errors
    }
  }

  /**
   * Scan agent worktree directories for their usage.json files
   * and return aggregated counts.
   */
  private loadWorktreeUsage(): Map<CommandName, number> {
    const aggregated = new Map<CommandName, number>();
    if (!this.projectPath) return aggregated;

    const worktreesDir = path.join(this.projectPath, '.git', AGENT_WORKTREES_DIR);
    if (!fs.existsSync(worktreesDir)) return aggregated;

    try {
      const entries = fs.readdirSync(worktreesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const usagePath = path.join(worktreesDir, entry.name, '.glancey', 'usage.json');
        try {
          if (fs.existsSync(usagePath)) {
            const data = JSON.parse(fs.readFileSync(usagePath, 'utf-8'));
            for (const [cmd, count] of Object.entries(data)) {
              if (typeof count === 'number') {
                const current = aggregated.get(cmd as CommandName) || 0;
                aggregated.set(cmd as CommandName, current + count);
              }
            }
          }
        } catch {
          // Skip unreadable worktree usage files
        }
      }
    } catch {
      // Ignore errors scanning worktrees directory
    }

    return aggregated;
  }

  /**
   * Set the indexer instance for the dashboard to use
   */
  setIndexer(indexer: CodeIndexer): void {
    this.indexer = indexer;
  }

  /**
   * Set the configuration for the dashboard to display
   */
  setConfig(config: GlanceyConfig): void {
    this.config = config;
  }

  /**
   * Set the project path
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
    this.loadUsageFromDisk();
    tokenTracker.setProjectPath(projectPath);
  }

  /**
   * Set the package version
   */
  setVersion(version: string): void {
    this.version = version;
  }

  /**
   * Get the package version
   */
  getVersion(): string | null {
    return this.version;
  }

  /**
   * Set backend fallback info when a fallback occurred during initialization
   */
  setBackendFallback(fallback: BackendFallbackInfo): void {
    this.backendFallback = fallback;
  }

  /**
   * Clear backend fallback info (when backend is successfully reinitialized)
   */
  clearBackendFallback(): void {
    this.backendFallback = null;
  }

  /**
   * Get backend fallback info if a fallback occurred
   */
  getBackendFallback(): BackendFallbackInfo | null {
    return this.backendFallback;
  }

  /**
   * Get the current index status
   */
  async getStatus(): Promise<IndexStatus | null> {
    if (!this.indexer) {
      return null;
    }
    return this.indexer.getStatus();
  }

  /**
   * Get the current configuration
   */
  getConfig(): GlanceyConfig | null {
    return this.config;
  }

  /**
   * Get the project path
   */
  getProjectPath(): string | null {
    return this.projectPath;
  }

  /**
   * Check if indexing is in progress
   */
  isIndexingInProgress(): boolean {
    return this.isIndexing;
  }

  /**
   * Get the last progress update
   */
  getLastProgress(): IndexProgress | null {
    return this.lastProgress;
  }

  /**
   * Called when indexing starts
   */
  onIndexingStart(): void {
    this.isIndexing = true;
    this.lastProgress = null;
    this.emit('indexing:start');
  }

  /**
   * Called with progress updates during indexing
   */
  onProgress(progress: IndexProgress): void {
    this.lastProgress = progress;
    this.emit('progress', progress);
  }

  /**
   * Update just the message portion of the current progress.
   * Useful for sub-progress updates (e.g., Ollama batch progress).
   */
  updateProgressMessage(message: string): void {
    if (this.lastProgress) {
      this.lastProgress = { ...this.lastProgress, message };
      this.emit('progress', this.lastProgress);
    }
  }

  /**
   * Update sub-progress within the current phase.
   * Allows embedding backends to report their own progress with percentage.
   * The current/total values represent sub-progress within the phase.
   */
  updateSubProgress(current: number, total: number, message: string): void {
    if (this.lastProgress) {
      this.lastProgress = { ...this.lastProgress, current, total, message };
      this.emit('progress', this.lastProgress);
    }
  }

  /**
   * Called when indexing completes
   */
  onIndexingComplete(result: { filesIndexed: number; chunksCreated: number }): void {
    this.isIndexing = false;
    this.lastProgress = null;
    this.emit('indexing:complete', result);
  }

  /**
   * Called when status changes
   */
  onStatusChange(status: IndexStatus): void {
    this.emit('status:change', status);
  }

  /**
   * Trigger a reindex of the codebase.
   * Returns a promise that resolves when indexing completes.
   */
  async triggerReindex(
    forceReindex: boolean = false
  ): Promise<{ filesIndexed: number; chunksCreated: number } | null> {
    if (!this.indexer || !this.config) {
      return null;
    }

    if (this.isIndexing) {
      throw new Error('Indexing is already in progress');
    }

    this.onIndexingStart();

    try {
      const result = await this.indexer.indexCodebase(
        this.config.patterns,
        this.config.excludePatterns,
        forceReindex,
        (progress) => this.onProgress(progress)
      );
      this.onIndexingComplete(result);
      return result;
    } catch (error) {
      this.isIndexing = false;
      this.lastProgress = null;
      throw error;
    }
  }

  /**
   * Record a command usage
   */
  recordCommandUsage(command: CommandName): void {
    // Reload from disk to get latest counts (in case another process updated)
    this.loadUsageFromDisk();
    const current = this.commandUsage.get(command) || 0;
    this.commandUsage.set(command, current + 1);
    this.saveUsageToDisk();
    this.emit('usage:update', this.getCommandUsage());
  }

  /**
   * Get the full list of tracked command names
   */
  private getAllCommandNames(): CommandName[] {
    return [
      'search_code',
      'search_similar',
      'index_codebase',
      'get_index_status',
      'clear_index',
      'get_project_instructions',
      'commit',
      // Symbolic analysis
      'get_symbols_overview',
      'find_symbol',
      'find_referencing_symbols',
      'search_for_pattern',
      'replace_symbol_body',
      'insert_before_symbol',
      'insert_after_symbol',
      'rename_symbol',
      // Memory
      'write_memory',
      'read_memory',
      'list_memories',
      'delete_memory',
      'edit_memory',
      // Worktree
      'create_worktree',
      'list_worktrees',
      'remove_worktree',
      'worktree_status',
      // Clustering
      'list_concepts',
      'search_by_concept',
      'summarize_codebase',
      // Dashboard
      'open_dashboard',
    ];
  }

  /**
   * Get command usage statistics (main project + agent worktrees combined)
   */
  getCommandUsage(): CommandUsage[] {
    // Reload from disk to get latest counts (in case another process updated)
    this.loadUsageFromDisk();
    const worktreeUsage = this.loadWorktreeUsage();

    return this.getAllCommandNames().map((command) => ({
      command,
      count: (this.commandUsage.get(command) || 0) + (worktreeUsage.get(command) || 0),
      label: COMMAND_LABELS[command],
    }));
  }

  /**
   * Get usage breakdown: main project vs agent worktrees.
   * Useful for dashboard to show where usage is coming from.
   */
  getUsageBreakdown(): { main: CommandUsage[]; agents: CommandUsage[]; total: CommandUsage[] } {
    this.loadUsageFromDisk();
    const worktreeUsage = this.loadWorktreeUsage();
    const allCommands = this.getAllCommandNames();

    return {
      main: allCommands.map((command) => ({
        command,
        count: this.commandUsage.get(command) || 0,
        label: COMMAND_LABELS[command],
      })),
      agents: allCommands.map((command) => ({
        command,
        count: worktreeUsage.get(command) || 0,
        label: COMMAND_LABELS[command],
      })),
      total: allCommands.map((command) => ({
        command,
        count: (this.commandUsage.get(command) || 0) + (worktreeUsage.get(command) || 0),
        label: COMMAND_LABELS[command],
      })),
    };
  }

  /**
   * Get total command count for percentage calculations (includes agent worktrees)
   */
  getTotalCommandCount(): number {
    this.loadUsageFromDisk();
    const worktreeUsage = this.loadWorktreeUsage();

    let total = 0;
    for (const count of this.commandUsage.values()) {
      total += count;
    }
    for (const count of worktreeUsage.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Get token savings statistics (main project only)
   */
  getTokenSavings(): TokenSavingsStats {
    return tokenTracker.getStats();
  }

  /**
   * Get token savings with worktree breakdown
   */
  getTokenSavingsWithWorktrees() {
    return tokenTracker.getStatsWithWorktrees();
  }

  /**
   * Get the token tracker for recording savings
   */
  getTokenTracker() {
    return tokenTracker;
  }

  /**
   * Emit token savings update event for real-time dashboard updates
   */
  emitTokenSavingsUpdate(): void {
    this.emit('tokenSavings:update', tokenTracker.getStats());
  }
}

/**
 * Singleton instance of the dashboard state manager
 */
export const dashboardState = new DashboardStateManager();

// Wire up token savings updates to emit SSE events
tokenTracker.setOnUpdate(() => {
  dashboardState.emitTokenSavingsUpdate();
});
