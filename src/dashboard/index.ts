export { dashboardState, DashboardStateManager } from './state.js';
export type { CommandName, CommandUsage } from './state.js';
export { sseManager, SSEManager } from './events.js';
export { startServer, findAvailablePort, isPortAvailable, type DashboardServer } from './server.js';
export type { IndexProgress } from '../search/indexer.js';

import { startServer, type DashboardServer } from './server.js';
import { dashboardState } from './state.js';
import type { CodeIndexer } from '../search/indexer.js';
import type { LanceContextConfig } from '../config.js';

let serverInstance: DashboardServer | null = null;

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
 * Start the dashboard server.
 * Returns the server instance with URL and stop function.
 */
export async function startDashboard(options: DashboardOptions = {}): Promise<DashboardServer> {
  if (serverInstance) {
    return serverInstance;
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

  serverInstance = await startServer(options.port);
  return serverInstance;
}

/**
 * Stop the dashboard server.
 */
export async function stopDashboard(): Promise<void> {
  if (serverInstance) {
    await serverInstance.stop();
    serverInstance = null;
  }
}

/**
 * Check if the dashboard is running.
 */
export function isDashboardRunning(): boolean {
  return serverInstance !== null;
}

/**
 * Get the dashboard URL if running.
 */
export function getDashboardUrl(): string | null {
  return serverInstance?.url ?? null;
}
