import * as http from 'http';
import * as net from 'net';
import { handleRequest } from './routes.js';
import { sseManager } from './events.js';

const DEFAULT_PORT = 24300;
const PORT_RANGE = 100;

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find an available port starting from the given port
 */
export async function findAvailablePort(startPort: number = DEFAULT_PORT): Promise<number> {
  for (let port = startPort; port < startPort + PORT_RANGE; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + PORT_RANGE - 1}`);
}

/**
 * Dashboard server instance
 */
export interface DashboardServer {
  /** The HTTP server instance */
  server: http.Server;
  /** The port the server is listening on */
  port: number;
  /** The URL to access the dashboard */
  url: string;
  /** Stop the server */
  stop: () => Promise<void>;
}

/**
 * Start the dashboard HTTP server
 */
export async function startServer(port?: number): Promise<DashboardServer> {
  const actualPort = port ?? (await findAvailablePort());

  const server = http.createServer((req, res) => {
    handleRequest(req, res);
  });

  // Start the SSE heartbeat
  sseManager.startHeartbeat();

  return new Promise((resolve, reject) => {
    server.once('error', (err) => {
      reject(err);
    });

    server.listen(actualPort, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${actualPort}`;
      resolve({
        server,
        port: actualPort,
        url,
        stop: async () => {
          sseManager.closeAll();
          return new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) rejectClose(err);
              else resolveClose();
            });
          });
        },
      });
    });
  });
}
