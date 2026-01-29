import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type { CodeIndexer, IndexStatus, IndexProgress } from '../search/indexer.js';
import type { LanceContextConfig } from '../config.js';

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
  | 'open_dashboard';

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
};

/** Maximum number of event listeners to prevent memory leaks */
const MAX_LISTENERS = 20;

export class DashboardStateManager extends EventEmitter {
  private indexer: CodeIndexer | null = null;
  private config: LanceContextConfig | null = null;
  private projectPath: string | null = null;
  private version: string | null = null;
  private isIndexing = false;
  private lastProgress: IndexProgress | null = null;
  private commandUsage: Map<CommandName, number> = new Map();

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
    return path.join(this.projectPath, '.lance-context', 'usage.json');
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
   * Set the indexer instance for the dashboard to use
   */
  setIndexer(indexer: CodeIndexer): void {
    this.indexer = indexer;
  }

  /**
   * Set the configuration for the dashboard to display
   */
  setConfig(config: LanceContextConfig): void {
    this.config = config;
  }

  /**
   * Set the project path
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
    this.loadUsageFromDisk();
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
  getConfig(): LanceContextConfig | null {
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
   * Get command usage statistics
   */
  getCommandUsage(): CommandUsage[] {
    // Reload from disk to get latest counts (in case another process updated)
    this.loadUsageFromDisk();

    const allCommands: CommandName[] = [
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

    return allCommands.map((command) => ({
      command,
      count: this.commandUsage.get(command) || 0,
      label: COMMAND_LABELS[command],
    }));
  }

  /**
   * Get total command count for percentage calculations
   */
  getTotalCommandCount(): number {
    let total = 0;
    for (const count of this.commandUsage.values()) {
      total += count;
    }
    return total;
  }
}

/**
 * Singleton instance of the dashboard state manager
 */
export const dashboardState = new DashboardStateManager();
