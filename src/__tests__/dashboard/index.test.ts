import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('../../dashboard/state.js', async () => {
  const { EventEmitter } = await import('events');
  const mockState = Object.assign(new EventEmitter(), {
    setIndexer: vi.fn(),
    setConfig: vi.fn(),
    setProjectPath: vi.fn(),
  });
  return {
    dashboardState: mockState,
    DashboardStateManager: vi.fn(),
  };
});

vi.mock('../../dashboard/server.js', () => ({
  startServer: vi.fn(),
}));

// Must import after mocks are set up
import {
  startDashboard,
  stopDashboard,
  isDashboardRunning,
  getDashboardUrl,
} from '../../dashboard/index.js';
import { startServer } from '../../dashboard/server.js';
import { dashboardState } from '../../dashboard/state.js';

describe('dashboard/index', () => {
  const mockServer = {
    server: {} as never,
    port: 24300,
    url: 'http://localhost:24300',
    stop: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(startServer).mockResolvedValue(mockServer);
  });

  afterEach(async () => {
    // Clean up singleton state between tests
    await stopDashboard();
    vi.restoreAllMocks();
  });

  describe('startDashboard', () => {
    it('should start the server and return server instance', async () => {
      const result = await startDashboard({ port: 24300 });

      expect(startServer).toHaveBeenCalledWith(24300);
      expect(result).toBe(mockServer);
    });

    it('should return existing instance if already running', async () => {
      const first = await startDashboard({ port: 24300 });
      const second = await startDashboard({ port: 24301 });

      expect(startServer).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
    });

    it('should set indexer on dashboard state when provided', async () => {
      const mockIndexer = { search: vi.fn() };

      await startDashboard({ indexer: mockIndexer as never });

      expect(dashboardState.setIndexer).toHaveBeenCalledWith(mockIndexer);
    });

    it('should set config on dashboard state when provided', async () => {
      const mockConfig = { patterns: ['*.ts'] };

      await startDashboard({ config: mockConfig as never });

      expect(dashboardState.setConfig).toHaveBeenCalledWith(mockConfig);
    });

    it('should set project path on dashboard state when provided', async () => {
      await startDashboard({ projectPath: '/my/project' });

      expect(dashboardState.setProjectPath).toHaveBeenCalledWith('/my/project');
    });

    it('should work with no options', async () => {
      const result = await startDashboard();

      expect(startServer).toHaveBeenCalledWith(undefined);
      expect(result).toBe(mockServer);
    });
  });

  describe('stopDashboard', () => {
    it('should stop the server when running', async () => {
      await startDashboard();
      await stopDashboard();

      expect(mockServer.stop).toHaveBeenCalled();
    });

    it('should do nothing when server is not running', async () => {
      await stopDashboard();

      expect(mockServer.stop).not.toHaveBeenCalled();
    });

    it('should allow starting a new server after stopping', async () => {
      await startDashboard({ port: 24300 });
      await stopDashboard();

      vi.clearAllMocks();
      await startDashboard({ port: 24301 });

      expect(startServer).toHaveBeenCalledWith(24301);
    });
  });

  describe('isDashboardRunning', () => {
    it('should return false when server is not running', () => {
      expect(isDashboardRunning()).toBe(false);
    });

    it('should return true when server is running', async () => {
      await startDashboard();

      expect(isDashboardRunning()).toBe(true);
    });

    it('should return false after server is stopped', async () => {
      await startDashboard();
      await stopDashboard();

      expect(isDashboardRunning()).toBe(false);
    });
  });

  describe('getDashboardUrl', () => {
    it('should return null when server is not running', () => {
      expect(getDashboardUrl()).toBeNull();
    });

    it('should return URL when server is running', async () => {
      await startDashboard();

      expect(getDashboardUrl()).toBe('http://localhost:24300');
    });

    it('should return null after server is stopped', async () => {
      await startDashboard();
      await stopDashboard();

      expect(getDashboardUrl()).toBeNull();
    });
  });
});
