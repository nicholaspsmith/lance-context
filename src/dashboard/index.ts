export { dashboardState, DashboardStateManager } from './state.js';
export type { CommandName, CommandUsage } from './state.js';
export { sseManager, SSEManager } from './events.js';
export { startServer, findAvailablePort, isPortAvailable, type DashboardServer } from './server.js';
export type { IndexProgress } from '../search/indexer.js';

import { startServer, type DashboardServer } from './server.js';
import { dashboardState } from './state.js';
import type { CodeIndexer } from '../search/indexer.js';
import type { LanceContextConfig } from '../config.js';

export interface DashboardOptions {
  /** Port to use (default: auto-discover from 24300) */
  port?: number;
  /** The indexer instance to share with the dashboard */
  indexer?: CodeIndexer;
  /** The configuration to display */
  config?: LanceContextConfig;
  /** The project path */
  projectPath?: string;
}

/**
 * DashboardManager - Encapsulates dashboard server state for testability.
 *
 * This class allows creating isolated instances for testing while maintaining
 * backward compatibility through the default instance and module-level functions.
 */
export class DashboardManager {
  private serverInstance: DashboardServer | null = null;

  /**
   * Start the dashboard server.
   * Returns the server instance with URL and stop function.
   */
  async start(options: DashboardOptions = {}): Promise<DashboardServer> {
    if (this.serverInstance) {
      return this.serverInstance;
    }

    // Set up dashboard state if provided
    if (options.indexer) {
      dashboardState.setIndexer(options.indexer);
    }
    if (options.config) {
      dashboardState.setConfig(options.config);
    }
    if (options.projectPath) {
      dashboardState.setProjectPath(options.projectPath);
    }

    this.serverInstance = await startServer(options.port);
    return this.serverInstance;
  }

  /**
   * Stop the dashboard server.
   */
  async stop(): Promise<void> {
    if (this.serverInstance) {
      await this.serverInstance.stop();
      this.serverInstance = null;
    }
  }

  /**
   * Check if the dashboard is running.
   */
  isRunning(): boolean {
    return this.serverInstance !== null;
  }

  /**
   * Get the dashboard URL if running.
   */
  getUrl(): string | null {
    return this.serverInstance?.url ?? null;
  }

  /**
   * Get the current server instance (for testing).
   */
  getServerInstance(): DashboardServer | null {
    return this.serverInstance;
  }
}

// Default instance for backward compatibility
export const defaultDashboardManager = new DashboardManager();

/**
 * Start the dashboard server.
 * Returns the server instance with URL and stop function.
 */
export async function startDashboard(options: DashboardOptions = {}): Promise<DashboardServer> {
  return defaultDashboardManager.start(options);
}

/**
 * Stop the dashboard server.
 */
export async function stopDashboard(): Promise<void> {
  return defaultDashboardManager.stop();
}

/**
 * Check if the dashboard is running.
 */
export function isDashboardRunning(): boolean {
  return defaultDashboardManager.isRunning();
}

/**
 * Get the dashboard URL if running.
 */
export function getDashboardUrl(): string | null {
  return defaultDashboardManager.getUrl();
}
