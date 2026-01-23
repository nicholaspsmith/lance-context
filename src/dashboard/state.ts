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
  | 'get_index_status'
  | 'clear_index'
  | 'get_project_instructions';

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
  get_index_status: 'Get Status',
  clear_index: 'Clear Index',
  get_project_instructions: 'Get Instructions',
};

export class DashboardStateManager extends EventEmitter {
  private indexer: CodeIndexer | null = null;
  private config: LanceContextConfig | null = null;
  private projectPath: string | null = null;
  private isIndexing = false;
  private lastProgress: IndexProgress | null = null;
  private commandUsage: Map<CommandName, number> = new Map();

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
      'index_codebase',
      'get_index_status',
      'clear_index',
      'get_project_instructions',
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
