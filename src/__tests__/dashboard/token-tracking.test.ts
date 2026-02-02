import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { TokenSavingsTracker, type TokenSavingsEvent } from '../../dashboard/token-tracking.js';

// Mock fs module
vi.mock('fs');

describe('TokenSavingsTracker', () => {
  let tracker: TokenSavingsTracker;
  const mockProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new TokenSavingsTracker();
    // Default: file doesn't exist
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('setProjectPath', () => {
    it('should load persisted data when file exists', () => {
      const persistedData = {
        events: [
          {
            type: 'search_code',
            timestamp: 1234567890,
            charsReturned: 100,
            charsAvoided: 500,
            filesAvoided: 2,
          },
        ],
        sessionStart: 1234567800,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(persistedData));

      tracker.setProjectPath(mockProjectPath);
      const stats = tracker.getStats();

      expect(stats.operationCount).toBe(1);
      expect(stats.sessionStart).toBe(1234567800);
    });

    it('should validate events on load and filter invalid ones', () => {
      const persistedData = {
        events: [
          // Valid event
          {
            type: 'search_code',
            timestamp: 1234567890,
            charsReturned: 100,
            charsAvoided: 500,
            filesAvoided: 2,
          },
          // Invalid: missing type
          {
            timestamp: 1234567891,
            charsReturned: 50,
            charsAvoided: 250,
            filesAvoided: 1,
          },
          // Invalid: wrong type
          {
            type: 'invalid_type',
            timestamp: 1234567892,
            charsReturned: 50,
            charsAvoided: 250,
            filesAvoided: 1,
          },
          // Invalid: missing required field
          {
            type: 'search_code',
            timestamp: 1234567893,
            charsReturned: 50,
            // missing charsAvoided and filesAvoided
          },
        ],
        sessionStart: 1234567800,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(persistedData));

      tracker.setProjectPath(mockProjectPath);
      const stats = tracker.getStats();

      // Only the first valid event should be loaded
      expect(stats.operationCount).toBe(1);
    });

    it('should handle missing file gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      tracker.setProjectPath(mockProjectPath);
      const stats = tracker.getStats();

      expect(stats.operationCount).toBe(0);
    });

    it('should handle corrupted JSON gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json');

      tracker.setProjectPath(mockProjectPath);
      const stats = tracker.getStats();

      expect(stats.operationCount).toBe(0);
    });
  });

  describe('event recording', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      tracker.setProjectPath(mockProjectPath);
    });

    it('should record search_code events with correct estimates', () => {
      tracker.recordSearchCode(1000, 3, 50);

      const stats = tracker.getStats();
      expect(stats.operationCount).toBe(1);
      expect(stats.byType.search_code.count).toBe(1);
      expect(stats.byType.search_code.charsReturned).toBe(1000);
      // charsAvoided = max(0, 100 * 60 - 1000) = 5000
      expect(stats.byType.search_code.charsAvoided).toBe(5000);
    });

    it('should record search_similar events', () => {
      tracker.recordSearchSimilar(500, 5);

      const stats = tracker.getStats();
      expect(stats.byType.search_similar.count).toBe(1);
      expect(stats.byType.search_similar.charsReturned).toBe(500);
    });

    it('should record get_symbols_overview events', () => {
      tracker.recordSymbolsOverview(200, 100);

      const stats = tracker.getStats();
      expect(stats.byType.get_symbols_overview.count).toBe(1);
      // charsAvoided = max(0, 100 * 60 - 200) = 5800
      expect(stats.byType.get_symbols_overview.charsAvoided).toBe(5800);
    });

    it('should record find_symbol events', () => {
      tracker.recordFindSymbol(300, 20);

      const stats = tracker.getStats();
      expect(stats.byType.find_symbol.count).toBe(1);
    });

    it('should record summarize_codebase events', () => {
      tracker.recordSummarizeCodebase(1500, 100);

      const stats = tracker.getStats();
      expect(stats.byType.summarize_codebase.count).toBe(1);
    });

    it('should record list_concepts events', () => {
      tracker.recordListConcepts(400, 5);

      const stats = tracker.getStats();
      expect(stats.byType.list_concepts.count).toBe(1);
    });

    it('should record search_by_concept events', () => {
      tracker.recordSearchByConcept(600, 10);

      const stats = tracker.getStats();
      expect(stats.byType.search_by_concept.count).toBe(1);
    });

    it('should not record negative charsAvoided', () => {
      // Return more chars than estimated, should clamp to 0
      tracker.recordSearchCode(10000, 1, 10);

      const stats = tracker.getStats();
      expect(stats.byType.search_code.charsAvoided).toBe(0);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      tracker.setProjectPath(mockProjectPath);
    });

    it('should calculate correct totals', () => {
      tracker.recordSearchCode(100, 2, 50);
      tracker.recordFindSymbol(200, 30);

      const stats = tracker.getStats();

      expect(stats.operationCount).toBe(2);
      expect(stats.charsReturned).toBe(300);
    });

    it('should calculate efficiency percentage correctly', () => {
      // Record event where we return 1000 chars and avoid 5000
      tracker.recordSearchCode(1000, 2, 50);

      const stats = tracker.getStats();
      // Total chars = 1000 + 5000 = 6000
      // Efficiency = 5000 / 6000 = 83.33% -> rounds to 83%
      expect(stats.efficiencyPercent).toBe(83);
    });

    it('should return 0% efficiency when no events', () => {
      const stats = tracker.getStats();
      expect(stats.efficiencyPercent).toBe(0);
    });

    it('should calculate tokens saved correctly', () => {
      // 4 chars per token
      tracker.recordSearchCode(1000, 2, 50);

      const stats = tracker.getStats();
      // charsAvoided = 5000, tokens = 5000 / 4 = 1250
      expect(stats.tokensSaved).toBe(1250);
    });
  });

  describe('event rotation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      tracker.setProjectPath(mockProjectPath);
    });

    it('should rotate events when exceeding MAX_EVENTS', () => {
      // Record more than 1000 events
      for (let i = 0; i < 1005; i++) {
        tracker.recordSearchCode(100, 1, 10);
      }

      const stats = tracker.getStats();
      // Should be capped at 1000
      expect(stats.operationCount).toBe(1000);
    });

    it('should keep most recent events when rotating', () => {
      // Load persisted data with 1005 events
      const events: TokenSavingsEvent[] = [];
      for (let i = 0; i < 1005; i++) {
        events.push({
          type: 'search_code',
          timestamp: 1000 + i,
          charsReturned: 100,
          charsAvoided: 500,
          filesAvoided: 1,
        });
      }

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ events, sessionStart: 1000 }));

      tracker.setProjectPath(mockProjectPath);
      const recentEvents = tracker.getRecentEvents(5);

      // Should have the most recent events (highest timestamps)
      expect(recentEvents[0].timestamp).toBeGreaterThan(1000);
    });
  });

  describe('debounced saving', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      tracker.setProjectPath(mockProjectPath);
    });

    it('should debounce multiple rapid saves', () => {
      tracker.recordSearchCode(100, 1, 10);
      tracker.recordSearchCode(200, 2, 20);
      tracker.recordSearchCode(300, 3, 30);

      // Should not have saved yet
      expect(fs.writeFileSync).not.toHaveBeenCalled();

      // Advance past debounce delay
      vi.advanceTimersByTime(1500);

      // Should have saved once with all events
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const savedData = JSON.parse(
        (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string
      );
      expect(savedData.events.length).toBe(3);
    });
  });

  describe('onUpdate callback', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      tracker.setProjectPath(mockProjectPath);
    });

    it('should call onUpdate callback when events are recorded', () => {
      const callback = vi.fn();
      tracker.setOnUpdate(callback);

      tracker.recordSearchCode(100, 1, 10);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call onUpdate for each event recorded', () => {
      const callback = vi.fn();
      tracker.setOnUpdate(callback);

      tracker.recordSearchCode(100, 1, 10);
      tracker.recordFindSymbol(200, 20);

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRecentEvents', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      tracker.setProjectPath(mockProjectPath);
    });

    it('should return last N events', () => {
      for (let i = 0; i < 20; i++) {
        tracker.recordSearchCode(100 + i, 1, 10);
      }

      const recent = tracker.getRecentEvents(5);

      expect(recent.length).toBe(5);
      // Should be the last 5 (highest charsReturned values)
      expect(recent[0].charsReturned).toBe(115);
      expect(recent[4].charsReturned).toBe(119);
    });

    it('should return all events if fewer than limit', () => {
      tracker.recordSearchCode(100, 1, 10);
      tracker.recordSearchCode(200, 2, 20);

      const recent = tracker.getRecentEvents(10);

      expect(recent.length).toBe(2);
    });

    it('should default to 10 events', () => {
      for (let i = 0; i < 20; i++) {
        tracker.recordSearchCode(100, 1, 10);
      }

      const recent = tracker.getRecentEvents();

      expect(recent.length).toBe(10);
    });
  });

  describe('filesAvoided estimates', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      tracker.setProjectPath(mockProjectPath);
    });

    it('should estimate filesAvoided for search_code based on files searched', () => {
      // 50 files searched, 3 matched -> avoided ~7 files (min(10, 50) - 3)
      tracker.recordSearchCode(100, 3, 50);

      const events = tracker.getRecentEvents(1);
      expect(events[0].filesAvoided).toBe(7);
    });

    it('should estimate filesAvoided for search_similar as at least 3', () => {
      tracker.recordSearchSimilar(100, 2);

      const events = tracker.getRecentEvents(1);
      expect(events[0].filesAvoided).toBe(3);
    });

    it('should estimate filesAvoided for summarize_codebase capped at 20', () => {
      tracker.recordSummarizeCodebase(100, 100);

      const events = tracker.getRecentEvents(1);
      expect(events[0].filesAvoided).toBe(20);
    });

    it('should estimate filesAvoided for list_concepts as 3x clusters capped at 15', () => {
      tracker.recordListConcepts(100, 10);

      const events = tracker.getRecentEvents(1);
      // 10 clusters * 3 = 30, capped at 15
      expect(events[0].filesAvoided).toBe(15);
    });
  });
});
