import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleWriteMemory,
  handleReadMemory,
  handleListMemories,
  handleDeleteMemory,
  handleEditMemory,
  parseWriteMemoryArgs,
  parseReadMemoryArgs,
  parseDeleteMemoryArgs,
  parseEditMemoryArgs,
  formatMemoryList,
  type MemoryToolContext,
  type IMemoryManager,
} from '../../tools/memory-handlers.js';
import type { MemoryInfo } from '../../memory/index.js';
import { GlanceyError } from '../../utils/errors.js';

describe('memory-handlers', () => {
  let mockMemoryManager: IMemoryManager;
  let context: MemoryToolContext;

  beforeEach(() => {
    mockMemoryManager = {
      writeMemory: vi.fn().mockResolvedValue(undefined),
      readMemory: vi.fn().mockResolvedValue('content'),
      listMemories: vi.fn().mockResolvedValue([]),
      deleteMemory: vi.fn().mockResolvedValue(undefined),
      editMemory: vi.fn().mockResolvedValue({ matchCount: 0 }),
    };

    context = {
      projectPath: '/test/project',
      toolGuidance: '\n---\nGuidance',
      memoryManager: mockMemoryManager,
    };
  });

  describe('parseWriteMemoryArgs', () => {
    it('should throw when memory_file_name is missing', () => {
      expect(() => parseWriteMemoryArgs({ content: 'test' })).toThrow(GlanceyError);
    });

    it('should throw when content is missing', () => {
      expect(() => parseWriteMemoryArgs({ memory_file_name: 'test' })).toThrow(GlanceyError);
    });

    it('should parse valid arguments', () => {
      const result = parseWriteMemoryArgs({ memory_file_name: 'test', content: 'hello' });
      expect(result.memoryFileName).toBe('test');
      expect(result.content).toBe('hello');
    });
  });

  describe('handleWriteMemory', () => {
    it('should call memoryManager.writeMemory', async () => {
      await handleWriteMemory({ memoryFileName: 'test', content: 'hello' }, context);

      expect(mockMemoryManager.writeMemory).toHaveBeenCalledWith('test', 'hello');
    });

    it('should return success message', async () => {
      const result = await handleWriteMemory({ memoryFileName: 'test', content: 'hello' }, context);

      expect(result.content[0].text).toContain('Memory "test" saved successfully');
    });

    it('should append tool guidance', async () => {
      const result = await handleWriteMemory({ memoryFileName: 'test', content: 'hello' }, context);

      expect(result.content[0].text).toContain('Guidance');
    });
  });

  describe('parseReadMemoryArgs', () => {
    it('should throw when memory_file_name is missing', () => {
      expect(() => parseReadMemoryArgs({})).toThrow(GlanceyError);
    });

    it('should parse valid arguments', () => {
      const result = parseReadMemoryArgs({ memory_file_name: 'test' });
      expect(result.memoryFileName).toBe('test');
    });
  });

  describe('handleReadMemory', () => {
    it('should call memoryManager.readMemory', async () => {
      await handleReadMemory({ memoryFileName: 'test' }, context);

      expect(mockMemoryManager.readMemory).toHaveBeenCalledWith('test');
    });

    it('should return formatted content', async () => {
      vi.mocked(mockMemoryManager.readMemory).mockResolvedValue('# Test Content');

      const result = await handleReadMemory({ memoryFileName: 'test' }, context);

      expect(result.content[0].text).toContain('## Memory: test');
      expect(result.content[0].text).toContain('# Test Content');
    });
  });

  describe('formatMemoryList', () => {
    it('should return message for empty list', () => {
      expect(formatMemoryList([])).toBe('No memories found.');
    });

    it('should format memory list with details', () => {
      const memories: MemoryInfo[] = [
        { name: 'memory1', size: 1024, lastModified: new Date('2024-01-15') },
        { name: 'memory2', size: 2048, lastModified: new Date('2024-01-10') },
      ];

      const formatted = formatMemoryList(memories);

      expect(formatted).toContain('Available Memories (2)');
      expect(formatted).toContain('**memory1**');
      expect(formatted).toContain('1.0 KB');
      expect(formatted).toContain('2024-01-15');
      expect(formatted).toContain('**memory2**');
    });
  });

  describe('handleListMemories', () => {
    it('should call memoryManager.listMemories', async () => {
      await handleListMemories(context);

      expect(mockMemoryManager.listMemories).toHaveBeenCalled();
    });

    it('should return formatted list', async () => {
      vi.mocked(mockMemoryManager.listMemories).mockResolvedValue([
        { name: 'test', size: 512, lastModified: new Date() },
      ]);

      const result = await handleListMemories(context);

      expect(result.content[0].text).toContain('**test**');
    });
  });

  describe('parseDeleteMemoryArgs', () => {
    it('should throw when memory_file_name is missing', () => {
      expect(() => parseDeleteMemoryArgs({})).toThrow(GlanceyError);
    });

    it('should parse valid arguments', () => {
      const result = parseDeleteMemoryArgs({ memory_file_name: 'test' });
      expect(result.memoryFileName).toBe('test');
    });
  });

  describe('handleDeleteMemory', () => {
    it('should call memoryManager.deleteMemory', async () => {
      await handleDeleteMemory({ memoryFileName: 'test' }, context);

      expect(mockMemoryManager.deleteMemory).toHaveBeenCalledWith('test');
    });

    it('should return success message', async () => {
      const result = await handleDeleteMemory({ memoryFileName: 'test' }, context);

      expect(result.content[0].text).toContain('Memory "test" deleted successfully');
    });
  });

  describe('parseEditMemoryArgs', () => {
    it('should throw when memory_file_name is missing', () => {
      expect(() => parseEditMemoryArgs({ needle: 'x', repl: 'y', mode: 'literal' })).toThrow(
        GlanceyError
      );
    });

    it('should throw when needle is missing', () => {
      expect(() =>
        parseEditMemoryArgs({ memory_file_name: 'test', repl: 'y', mode: 'literal' })
      ).toThrow(GlanceyError);
    });

    it('should throw when mode is missing', () => {
      expect(() =>
        parseEditMemoryArgs({ memory_file_name: 'test', needle: 'x', repl: 'y' })
      ).toThrow(GlanceyError);
    });

    it('should throw for invalid mode', () => {
      expect(() =>
        parseEditMemoryArgs({ memory_file_name: 'test', needle: 'x', repl: 'y', mode: 'invalid' })
      ).toThrow('mode must be "literal" or "regex"');
    });

    it('should parse valid literal mode arguments', () => {
      const result = parseEditMemoryArgs({
        memory_file_name: 'test',
        needle: 'old',
        repl: 'new',
        mode: 'literal',
      });

      expect(result.memoryFileName).toBe('test');
      expect(result.needle).toBe('old');
      expect(result.repl).toBe('new');
      expect(result.mode).toBe('literal');
    });

    it('should parse valid regex mode arguments', () => {
      const result = parseEditMemoryArgs({
        memory_file_name: 'test',
        needle: '\\d+',
        repl: 'NUM',
        mode: 'regex',
      });

      expect(result.mode).toBe('regex');
    });

    it('should allow empty replacement string', () => {
      const result = parseEditMemoryArgs({
        memory_file_name: 'test',
        needle: 'remove',
        repl: '',
        mode: 'literal',
      });

      expect(result.repl).toBe('');
    });
  });

  describe('handleEditMemory', () => {
    it('should call memoryManager.editMemory with correct args', async () => {
      vi.mocked(mockMemoryManager.editMemory).mockResolvedValue({ matchCount: 2 });

      await handleEditMemory(
        { memoryFileName: 'test', needle: 'old', repl: 'new', mode: 'literal' },
        context
      );

      expect(mockMemoryManager.editMemory).toHaveBeenCalledWith('test', 'old', 'new', 'literal');
    });

    it('should return result with match count', async () => {
      vi.mocked(mockMemoryManager.editMemory).mockResolvedValue({ matchCount: 3 });

      const result = await handleEditMemory(
        { memoryFileName: 'test', needle: 'old', repl: 'new', mode: 'literal' },
        context
      );

      expect(result.content[0].text).toContain('3 replacement(s) made');
    });
  });
});
