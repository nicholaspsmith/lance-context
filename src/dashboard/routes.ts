import type { IncomingMessage, ServerResponse } from 'http';
import { dashboardState } from './state.js';
import { sseManager } from './events.js';
import { getDashboardHTML } from './ui.js';
import { getBeadsStatus } from './beads.js';

/**
 * Send a JSON response
 */
function sendJSON(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

/**
 * Send an HTML response
 */
function sendHTML(res: ServerResponse, html: string, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'text/html',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(html);
}

/**
 * Send a 404 Not Found response
 */
function send404(res: ServerResponse): void {
  sendJSON(res, { error: 'Not found' }, 404);
}

/**
 * Handle GET / - Dashboard HTML page
 */
async function handleDashboard(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const html = getDashboardHTML();
  sendHTML(res, html);
}

/**
 * Handle GET /api/status - Index status
 */
async function handleStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const status = await dashboardState.getStatus();
    if (!status) {
      sendJSON(res, { error: 'Indexer not initialized' }, 503);
      return;
    }
    sendJSON(res, {
      ...status,
      isIndexing: dashboardState.isIndexingInProgress(),
    });
  } catch (error) {
    sendJSON(res, { error: String(error) }, 500);
  }
}

/**
 * Handle GET /api/config - Effective configuration
 */
async function handleConfig(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const config = dashboardState.getConfig();
  const projectPath = dashboardState.getProjectPath();

  if (!config) {
    sendJSON(res, { error: 'Configuration not loaded' }, 503);
    return;
  }

  sendJSON(res, {
    projectPath,
    ...config,
  });
}

/**
 * Handle GET /api/events - SSE stream
 */
function handleEvents(_req: IncomingMessage, res: ServerResponse): void {
  sseManager.addClient(res);
}

/**
 * Handle GET /api/heartbeat - Health check
 */
function handleHeartbeat(_req: IncomingMessage, res: ServerResponse): void {
  sendJSON(res, {
    ok: true,
    timestamp: new Date().toISOString(),
    clients: sseManager.getClientCount(),
  });
}

/**
 * Handle GET /api/usage - Command usage statistics
 */
function handleUsage(_req: IncomingMessage, res: ServerResponse): void {
  const usage = dashboardState.getCommandUsage();
  const total = dashboardState.getTotalCommandCount();
  sendJSON(res, { usage, total });
}

/**
 * Handle GET /api/beads - Beads issue tracker status
 */
async function handleBeads(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const projectPath = dashboardState.getProjectPath();
  if (!projectPath) {
    sendJSON(res, { available: false, issueCount: 0, openCount: 0, readyCount: 0, issues: [] });
    return;
  }

  try {
    const status = await getBeadsStatus(projectPath);
    sendJSON(res, status);
  } catch (error) {
    sendJSON(res, { available: false, error: String(error) }, 500);
  }
}

/**
 * Route dispatcher
 */
export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  // Only support GET requests
  if (method !== 'GET') {
    sendJSON(res, { error: 'Method not allowed' }, 405);
    return;
  }

  try {
    switch (path) {
      case '/':
        await handleDashboard(req, res);
        break;
      case '/api/status':
        await handleStatus(req, res);
        break;
      case '/api/config':
        await handleConfig(req, res);
        break;
      case '/api/events':
        handleEvents(req, res);
        break;
      case '/api/heartbeat':
        handleHeartbeat(req, res);
        break;
      case '/api/usage':
        handleUsage(req, res);
        break;
      case '/api/beads':
        await handleBeads(req, res);
        break;
      default:
        send404(res);
    }
  } catch (error) {
    console.error('[lance-context] Dashboard error:', error);
    sendJSON(res, { error: 'Internal server error' }, 500);
  }
}
