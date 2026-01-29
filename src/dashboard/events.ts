import type { ServerResponse } from 'http';
import { dashboardState } from './state.js';

/** Maximum number of concurrent SSE connections */
const MAX_SSE_CLIENTS = 100;

/**
 * Manages Server-Sent Events (SSE) connections for real-time updates.
 */
export class SSEManager {
  private clients = new Set<ServerResponse>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly maxClients = MAX_SSE_CLIENTS;

  constructor() {
    // Set up event listeners on dashboard state
    this.setupEventListeners();
  }

  /**
   * Set up listeners for dashboard state events.
   * Each listener is wrapped in try-catch to prevent unhandled rejections.
   */
  private setupEventListeners(): void {
    dashboardState.on('progress', (progress) => {
      try {
        this.broadcast('indexing:progress', progress);
      } catch {
        // Ignore broadcast failures - clients will reconnect
      }
    });

    dashboardState.on('indexing:start', () => {
      try {
        this.broadcast('indexing:start', { timestamp: new Date().toISOString() });
      } catch {
        // Ignore broadcast failures
      }
    });

    dashboardState.on('indexing:complete', (result) => {
      try {
        this.broadcast('indexing:complete', result);
      } catch {
        // Ignore broadcast failures
      }
    });

    dashboardState.on('status:change', (status) => {
      try {
        this.broadcast('status:change', status);
      } catch {
        // Ignore broadcast failures
      }
    });

    dashboardState.on('usage:update', (usage) => {
      try {
        this.broadcast('usage:update', usage);
      } catch {
        // Ignore broadcast failures
      }
    });
  }

  /**
   * Start sending heartbeat messages to keep connections alive
   */
  startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      this.broadcast('heartbeat', { timestamp: new Date().toISOString() });
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop the heartbeat interval
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Add a new SSE client connection.
   * Returns false if max clients reached.
   */
  addClient(res: ServerResponse): boolean {
    // Reject if at capacity
    if (this.clients.size >= this.maxClients) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many SSE connections' }));
      return false;
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Add to clients set
    this.clients.add(res);

    // Send initial connected event
    this.sendToClient(res, 'connected', {
      timestamp: new Date().toISOString(),
      clientCount: this.clients.size,
    });

    // Send current indexing progress if in progress
    if (dashboardState.isIndexingInProgress()) {
      const lastProgress = dashboardState.getLastProgress();
      if (lastProgress) {
        this.sendToClient(res, 'indexing:progress', lastProgress);
      }
    }

    // Handle client disconnect
    res.on('close', () => {
      this.clients.delete(res);
    });

    return true;
  }

  /**
   * Send a message to a specific client
   */
  private sendToClient(res: ServerResponse, event: string, data: unknown): void {
    if (res.writableEnded) return;

    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client likely disconnected
      this.clients.delete(res);
    }
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: string, data: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const client of this.clients) {
      if (client.writableEnded) {
        this.clients.delete(client);
        continue;
      }

      try {
        client.write(message);
      } catch {
        // Client likely disconnected
        this.clients.delete(client);
      }
    }
  }

  /**
   * Get the number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all client connections
   */
  closeAll(): void {
    this.stopHeartbeat();
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.clients.clear();
  }
}

/**
 * Broadcast a log message to all connected dashboard clients
 */
export function broadcastLog(level: 'info' | 'warn' | 'error', message: string): void {
  sseManager.broadcast('server:log', {
    level,
    message,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Update the progress message displayed in the dashboard.
 * This updates just the message text without changing the progress numbers.
 * Useful for showing sub-progress (e.g., Ollama batch progress).
 */
export function updateProgressMessage(message: string): void {
  dashboardState.updateProgressMessage(message);
}

/**
 * Update sub-progress within the current phase with percentage.
 * Allows embedding backends to report their own progress with a working progress bar.
 */
export function updateSubProgress(current: number, total: number, message: string): void {
  dashboardState.updateSubProgress(current, total, message);
}

/**
 * Singleton instance of the SSE manager
 */
export const sseManager = new SSEManager();
