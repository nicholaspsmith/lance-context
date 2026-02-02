import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleGetProjectInstructions,
  type InstructionsToolContext,
  type IConfigLoader,
} from '../../tools/instructions-handlers.js';

describe('instructions-handlers', () => {
  let mockConfigLoader: IConfigLoader;
  let context: InstructionsToolContext;

  beforeEach(() => {
    mockConfigLoader = {
      loadConfig: vi.fn(),
      getInstructions: vi.fn(),
    };

    context = {
      projectPath: '/test/project',
      priorityInstructions: '# Priority Instructions\n\n',
      configLoader: mockConfigLoader,
    };
  });

  describe('handleGetProjectInstructions', () => {
    it('should load config and get instructions', async () => {
      const mockConfig = { instructions: 'Test instructions' };
      vi.mocked(mockConfigLoader.loadConfig).mockResolvedValue(mockConfig);
      vi.mocked(mockConfigLoader.getInstructions).mockReturnValue('Test instructions');

      await handleGetProjectInstructions(context);

      expect(mockConfigLoader.loadConfig).toHaveBeenCalledWith('/test/project');
      expect(mockConfigLoader.getInstructions).toHaveBeenCalledWith(mockConfig);
    });

    it('should combine priority and project instructions', async () => {
      vi.mocked(mockConfigLoader.loadConfig).mockResolvedValue({});
      vi.mocked(mockConfigLoader.getInstructions).mockReturnValue('Project instructions here');

      const result = await handleGetProjectInstructions(context);

      expect(result.content[0].text).toContain('# Priority Instructions');
      expect(result.content[0].text).toContain('Project instructions here');
    });

    it('should return default message when no instructions configured', async () => {
      const contextNoInstructions: InstructionsToolContext = {
        ...context,
        priorityInstructions: '',
      };
      vi.mocked(mockConfigLoader.loadConfig).mockResolvedValue({});
      vi.mocked(mockConfigLoader.getInstructions).mockReturnValue(undefined);

      const result = await handleGetProjectInstructions(contextNoInstructions);

      expect(result.content[0].text).toContain('No project instructions configured');
      expect(result.content[0].text).toContain('.glancey.json');
    });

    it('should handle undefined project instructions gracefully', async () => {
      vi.mocked(mockConfigLoader.loadConfig).mockResolvedValue({});
      vi.mocked(mockConfigLoader.getInstructions).mockReturnValue(undefined);

      const result = await handleGetProjectInstructions(context);

      // Should still include priority instructions
      expect(result.content[0].text).toContain('# Priority Instructions');
    });
  });
});
