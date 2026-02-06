import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { join, basename } from 'path';
import { dashboardState } from './state.js';
import { sseManager } from './events.js';
import { getDashboardHTML } from './ui.js';
import { getBeadsStatus } from './beads.js';
import {
  saveEmbeddingSettings,
  getEmbeddingSettings,
  saveDashboardSettings,
  getDashboardSettings,
  saveSearchWeights,
  getSearchWeights,
  addPattern,
  removePattern,
  type EmbeddingSettings,
  type DashboardSettings,
  type SearchWeightsSettings,
} from '../config.js';

/**
 * Get the project name from package.json or directory name
 */
function getProjectName(projectPath: string): string {
  try {
    const packageJsonPath = join(projectPath, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (packageJson.name && typeof packageJson.name === 'string') {
      return packageJson.name;
    }
  } catch {
    // package.json doesn't exist or is invalid, fall back to directory name
  }
  return basename(projectPath) || projectPath;
}

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
      version: dashboardState.getVersion(),
      backendFallback: dashboardState.getBackendFallback(),
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

  const projectName = projectPath ? getProjectName(projectPath) : null;

  sendJSON(res, {
    projectPath,
    projectName,
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
 * Handle GET /api/usage - Command usage statistics (includes agent worktree data)
 */
function handleUsage(_req: IncomingMessage, res: ServerResponse): void {
  const usage = dashboardState.getCommandUsage();
  const total = dashboardState.getTotalCommandCount();
  const breakdown = dashboardState.getUsageBreakdown();
  sendJSON(res, { usage, total, breakdown });
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
 * Handle GET /api/settings/embedding - Get current embedding settings
 */
async function handleGetEmbeddingSettings(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const projectPath = dashboardState.getProjectPath();
  if (!projectPath) {
    sendJSON(res, { error: 'Project path not set' }, 503);
    return;
  }

  try {
    const settings = await getEmbeddingSettings(projectPath);

    // Include running backend and fallback info so UI can show actual state
    const status = await dashboardState.getStatus();
    const fallback = dashboardState.getBackendFallback();

    sendJSON(res, {
      ...settings,
      runningBackend: status?.embeddingBackend ?? null,
      fallback,
    });
  } catch (error) {
    sendJSON(res, { error: String(error) }, 500);
  }
}

/**
 * Parse JSON body from request
 */
async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handle POST /api/settings/embedding - Save embedding settings
 */
async function handleSaveEmbeddingSettings(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const projectPath = dashboardState.getProjectPath();
  if (!projectPath) {
    sendJSON(res, { error: 'Project path not set' }, 503);
    return;
  }

  try {
    const body = (await parseJsonBody(req)) as EmbeddingSettings;

    if (!body.backend || !['ollama', 'gemini'].includes(body.backend)) {
      sendJSON(res, { error: 'Invalid backend. Must be "ollama" or "gemini".' }, 400);
      return;
    }

    await saveEmbeddingSettings(projectPath, body);
    sendJSON(res, {
      success: true,
      message: `Embedding backend set to ${body.backend}. Config will auto-reload.`,
    });
  } catch (error) {
    sendJSON(res, { error: String(error) }, 500);
  }
}

/**
 * Handle GET /api/settings/dashboard - Get current dashboard settings
 */
async function handleGetDashboardSettings(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const projectPath = dashboardState.getProjectPath();
  if (!projectPath) {
    sendJSON(res, { error: 'Project path not set' }, 503);
    return;
  }

  try {
    const settings = await getDashboardSettings(projectPath);
    sendJSON(res, settings);
  } catch (error) {
    sendJSON(res, { error: String(error) }, 500);
  }
}

/**
 * Handle POST /api/reindex - Trigger a reindex of the codebase
 */
async function handleReindex(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    // Check if already indexing
    if (dashboardState.isIndexingInProgress()) {
      sendJSON(res, { error: 'Indexing is already in progress' }, 409);
      return;
    }

    // Parse optional forceReindex flag from body
    let forceReindex = false;
    try {
      const body = (await parseJsonBody(req)) as { force?: boolean };
      forceReindex = body.force === true;
    } catch {
      // If no body or invalid JSON, use defaults
    }

    // Trigger reindex asynchronously - don't wait for completion
    // The dashboard will receive progress updates via SSE
    dashboardState.triggerReindex(forceReindex).catch((error) => {
      console.error('[glancey] Reindex failed:', error);
    });

    sendJSON(res, {
      success: true,
      message: forceReindex
        ? 'Force reindex started. Progress will be shown in the dashboard.'
        : 'Reindex started. Progress will be shown in the dashboard.',
    });
  } catch (error) {
    sendJSON(res, { error: String(error) }, 500);
  }
}

/**
 * Handle POST /api/settings/dashboard - Save dashboard settings
 */
async function handleSaveDashboardSettings(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const projectPath = dashboardState.getProjectPath();
  if (!projectPath) {
    sendJSON(res, { error: 'Project path not set' }, 503);
    return;
  }

  try {
    const body = (await parseJsonBody(req)) as DashboardSettings;

    if (typeof body.enabled !== 'boolean') {
      sendJSON(res, { error: 'enabled must be a boolean' }, 400);
      return;
    }

    await saveDashboardSettings(projectPath, body);

    const message = body.enabled
      ? 'Dashboard enabled. Config will auto-reload.'
      : 'Dashboard disabled. Config will auto-reload. Use the open_dashboard MCP tool to start manually.';

    sendJSON(res, {
      success: true,
      message,
    });
  } catch (error) {
    sendJSON(res, { error: String(error) }, 500);
  }
}

/**
 * Handle GET /api/token-savings - Get token savings statistics (includes agent worktree data)
 */
function handleTokenSavings(_req: IncomingMessage, res: ServerResponse): void {
  const breakdown = dashboardState.getTokenSavingsWithWorktrees();
  sendJSON(res, { ...breakdown.total, breakdown });
}

/**
 * Handle GET /api/settings/search-weights - Get current search weights
 */
async function handleGetSearchWeights(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const projectPath = dashboardState.getProjectPath();
  if (!projectPath) {
    sendJSON(res, { error: 'Project path not set' }, 503);
    return;
  }

  try {
    const weights = await getSearchWeights(projectPath);
    sendJSON(res, weights);
  } catch (error) {
    sendJSON(res, { error: String(error) }, 500);
  }
}

/**
 * Handle PUT /api/search-weights - Update search weights
 */
async function handleUpdateSearchWeights(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const projectPath = dashboardState.getProjectPath();
  if (!projectPath) {
    sendJSON(res, { error: 'Project path not set' }, 503);
    return;
  }

  try {
    const body = (await parseJsonBody(req)) as SearchWeightsSettings;

    if (
      typeof body.semanticWeight !== 'number' ||
      typeof body.keywordWeight !== 'number' ||
      body.semanticWeight < 0 ||
      body.semanticWeight > 1 ||
      body.keywordWeight < 0 ||
      body.keywordWeight > 1
    ) {
      sendJSON(res, { error: 'Invalid weights. Both must be numbers between 0 and 1.' }, 400);
      return;
    }

    await saveSearchWeights(projectPath, body);
    sendJSON(res, {
      success: true,
      message: 'Search weights updated. Config will auto-reload.',
    });
  } catch (error) {
    sendJSON(res, { error: String(error) }, 500);
  }
}

/**
 * Handle POST /api/patterns - Add a pattern
 */
async function handleAddPattern(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const projectPath = dashboardState.getProjectPath();
  if (!projectPath) {
    sendJSON(res, { error: 'Project path not set' }, 503);
    return;
  }

  try {
    const body = (await parseJsonBody(req)) as { pattern: string; type: 'include' | 'exclude' };

    if (!body.pattern || typeof body.pattern !== 'string') {
      sendJSON(res, { error: 'Pattern is required' }, 400);
      return;
    }

    if (body.type !== 'include' && body.type !== 'exclude') {
      sendJSON(res, { error: 'Type must be "include" or "exclude"' }, 400);
      return;
    }

    await addPattern(projectPath, body.pattern, body.type);
    sendJSON(res, {
      success: true,
      message: `Pattern added to ${body.type} patterns. Config will auto-reload.`,
    });
  } catch (error) {
    sendJSON(res, { error: String(error) }, 500);
  }
}

/**
 * Handle DELETE /api/patterns - Remove a pattern
 */
async function handleRemovePattern(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const projectPath = dashboardState.getProjectPath();
  if (!projectPath) {
    sendJSON(res, { error: 'Project path not set' }, 503);
    return;
  }

  try {
    const body = (await parseJsonBody(req)) as { pattern: string; type: 'include' | 'exclude' };

    if (!body.pattern || typeof body.pattern !== 'string') {
      sendJSON(res, { error: 'Pattern is required' }, 400);
      return;
    }

    if (body.type !== 'include' && body.type !== 'exclude') {
      sendJSON(res, { error: 'Type must be "include" or "exclude"' }, 400);
      return;
    }

    await removePattern(projectPath, body.pattern, body.type);
    sendJSON(res, {
      success: true,
      message: `Pattern removed from ${body.type} patterns. Config will auto-reload.`,
    });
  } catch (error) {
    sendJSON(res, { error: String(error) }, 500);
  }
}

/**
 * Route dispatcher
 */
export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const routePath = url.pathname;
  const method = req.method ?? 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // POST routes
    if (method === 'POST') {
      switch (routePath) {
        case '/api/settings/embedding':
          await handleSaveEmbeddingSettings(req, res);
          return;
        case '/api/settings/dashboard':
          await handleSaveDashboardSettings(req, res);
          return;
        case '/api/reindex':
          await handleReindex(req, res);
          return;
        case '/api/patterns':
          await handleAddPattern(req, res);
          return;
        default:
          sendJSON(res, { error: 'Method not allowed' }, 405);
          return;
      }
    }

    // PUT routes
    if (method === 'PUT') {
      switch (routePath) {
        case '/api/search-weights':
          await handleUpdateSearchWeights(req, res);
          return;
        default:
          sendJSON(res, { error: 'Method not allowed' }, 405);
          return;
      }
    }

    // DELETE routes
    if (method === 'DELETE') {
      switch (routePath) {
        case '/api/patterns':
          await handleRemovePattern(req, res);
          return;
        default:
          sendJSON(res, { error: 'Method not allowed' }, 405);
          return;
      }
    }

    // GET routes
    if (method !== 'GET') {
      sendJSON(res, { error: 'Method not allowed' }, 405);
      return;
    }

    switch (routePath) {
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
      case '/api/settings/embedding':
        await handleGetEmbeddingSettings(req, res);
        break;
      case '/api/settings/dashboard':
        await handleGetDashboardSettings(req, res);
        break;
      case '/api/token-savings':
        handleTokenSavings(req, res);
        break;
      case '/api/search-weights':
        await handleGetSearchWeights(req, res);
        break;
      default:
        send404(res);
    }
  } catch (error) {
    console.error('[glancey] Dashboard error:', error);
    sendJSON(res, { error: 'Internal server error' }, 500);
  }
}
