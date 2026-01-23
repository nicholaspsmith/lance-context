import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ASTChunker } from '../search/ast-chunker.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('ASTChunker', () => {
  describe('canParse', () => {
    it('should return true for TypeScript files', () => {
      expect(ASTChunker.canParse('file.ts')).toBe(true);
      expect(ASTChunker.canParse('file.tsx')).toBe(true);
      expect(ASTChunker.canParse('file.mts')).toBe(true);
    });

    it('should return true for JavaScript files', () => {
      expect(ASTChunker.canParse('file.js')).toBe(true);
      expect(ASTChunker.canParse('file.jsx')).toBe(true);
      expect(ASTChunker.canParse('file.mjs')).toBe(true);
      expect(ASTChunker.canParse('file.cjs')).toBe(true);
    });

    it('should return false for non-JS/TS files', () => {
      expect(ASTChunker.canParse('file.py')).toBe(false);
      expect(ASTChunker.canParse('file.go')).toBe(false);
      expect(ASTChunker.canParse('file.rs')).toBe(false);
      expect(ASTChunker.canParse('file.md')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(ASTChunker.canParse('file.TS')).toBe(true);
      expect(ASTChunker.canParse('file.JS')).toBe(true);
    });

    it('should handle .cts extension', () => {
      expect(ASTChunker.canParse('file.cts')).toBe(true);
    });
  });

  describe('chunkFile', () => {
    let fsPromises: typeof import('fs/promises');

    beforeEach(async () => {
      fsPromises = await import('fs/promises');
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    describe('function declarations', () => {
      it('should create chunk for function declaration', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        const funcChunk = chunks.find((c) => c.type === 'function');
        expect(funcChunk).toBeDefined();
        expect(funcChunk?.name).toBe('greet');
        expect(funcChunk?.content).toContain('function greet');
      });

      it('should include async functions', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
async function fetchData(): Promise<void> {
  await fetch('/api');
}
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        const funcChunk = chunks.find((c) => c.type === 'function');
        expect(funcChunk?.name).toBe('fetchData');
      });
    });

    describe('class declarations', () => {
      it('should create chunk for small class', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
class User {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        const classChunk = chunks.find((c) => c.type === 'class');
        expect(classChunk).toBeDefined();
        expect(classChunk?.name).toBe('User');
      });

      it('should split large classes into methods', async () => {
        // Create a class with many lines
        const lines = ['class BigClass {'];
        for (let i = 0; i < 200; i++) {
          lines.push(`  method${i}() { return ${i}; }`);
        }
        lines.push('}');

        vi.mocked(fsPromises.readFile).mockResolvedValue(lines.join('\n'));

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        // Should have multiple chunks from the class
        const methodChunks = chunks.filter((c) => c.type === 'method');
        expect(methodChunks.length).toBeGreaterThan(1);
      });

      it('should name method chunks with class prefix', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
class MyService {
  getData() {
    return [];
  }
}
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        // Find either a small class chunk or method chunks
        const hasMethodWithClassName = chunks.some(
          (c) => c.name?.includes('MyService') && (c.type === 'method' || c.type === 'class')
        );
        expect(hasMethodWithClassName).toBe(true);
      });
    });

    describe('interface declarations', () => {
      it('should create chunk for interface', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
interface Config {
  apiKey: string;
  baseUrl: string;
}
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        const interfaceChunk = chunks.find((c) => c.type === 'interface');
        expect(interfaceChunk).toBeDefined();
        expect(interfaceChunk?.name).toBe('Config');
      });
    });

    describe('type declarations', () => {
      it('should create chunk for type alias', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
type Status = 'pending' | 'active' | 'completed';
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        const typeChunk = chunks.find((c) => c.type === 'type');
        expect(typeChunk).toBeDefined();
        expect(typeChunk?.name).toBe('Status');
      });
    });

    describe('import grouping', () => {
      it('should group imports into single chunk', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
import { foo } from 'foo';
import { bar } from 'bar';
import * as baz from 'baz';

function main() {}
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        const importChunk = chunks.find((c) => c.type === 'import');
        expect(importChunk).toBeDefined();
        expect(importChunk?.name).toBe('imports');
        expect(importChunk?.content).toContain('foo');
        expect(importChunk?.content).toContain('bar');
        expect(importChunk?.content).toContain('baz');
      });

      it('should place imports first in chunk order', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
import { x } from 'x';

function first() {}
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        expect(chunks[0].type).toBe('import');
      });
    });

    describe('variable statements', () => {
      it('should create chunk for exported const', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
export const CONFIG = {
  port: 3000,
};
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        const varChunk = chunks.find((c) => c.type === 'variable');
        expect(varChunk).toBeDefined();
        expect(varChunk?.name).toContain('CONFIG');
      });

      it('should handle multiple declarations', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
const a = 1, b = 2, c = 3;
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        const varChunk = chunks.find((c) => c.type === 'variable');
        expect(varChunk).toBeDefined();
        expect(varChunk?.name).toContain('a');
        expect(varChunk?.name).toContain('b');
        expect(varChunk?.name).toContain('c');
      });
    });

    describe('large chunk splitting', () => {
      it('should split chunks over MAX_CHUNK_LINES', async () => {
        // Create a very large function (over 150 lines)
        const lines = ['function bigFunction() {'];
        for (let i = 0; i < 200; i++) {
          lines.push(`  const x${i} = ${i};`);
        }
        lines.push('  return x0;');
        lines.push('}');

        vi.mocked(fsPromises.readFile).mockResolvedValue(lines.join('\n'));

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        // Should have been split into multiple parts
        const funcChunks = chunks.filter((c) => c.name?.includes('bigFunction'));
        expect(funcChunks.length).toBeGreaterThan(1);
      });

      it('should label split chunks with part numbers', async () => {
        const lines = ['function huge() {'];
        for (let i = 0; i < 200; i++) {
          lines.push(`  console.log(${i});`);
        }
        lines.push('}');

        vi.mocked(fsPromises.readFile).mockResolvedValue(lines.join('\n'));

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        const partChunks = chunks.filter((c) => c.name?.includes('part'));
        expect(partChunks.length).toBeGreaterThan(0);
      });
    });

    describe('line number tracking', () => {
      it('should track correct start and end lines', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
function first() {}

function second() {
  return 2;
}
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        const firstFunc = chunks.find((c) => c.name === 'first');
        const secondFunc = chunks.find((c) => c.name === 'second');

        expect(firstFunc?.startLine).toBeLessThan(secondFunc?.startLine ?? 0);
        // First function ends at or before second starts
        expect(firstFunc?.endLine).toBeLessThanOrEqual(secondFunc?.startLine ?? 0);
      });
    });

    describe('JSX support', () => {
      it('should parse .tsx files with JSX', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
function Component() {
  return <div>Hello</div>;
}
`);

        const chunker = new ASTChunker();
        // Should not throw
        const chunks = await chunker.chunkFile('test.tsx');

        expect(chunks.length).toBeGreaterThan(0);
      });

      it('should parse .jsx files', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
function Component() {
  return <span>World</span>;
}
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.jsx');

        expect(chunks.length).toBeGreaterThan(0);
      });
    });

    describe('edge cases', () => {
      it('should handle empty file', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue('');

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        expect(chunks).toEqual([]);
      });

      it('should handle file with only imports', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
import { a } from 'a';
import { b } from 'b';
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        expect(chunks.length).toBe(1);
        expect(chunks[0].type).toBe('import');
      });

      it('should handle file with only comments', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
// This is a comment
/* Block comment */
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        expect(chunks).toEqual([]);
      });

      it('should handle enum declarations', async () => {
        vi.mocked(fsPromises.readFile).mockResolvedValue(`
enum Color {
  Red,
  Green,
  Blue,
}
`);

        const chunker = new ASTChunker();
        const chunks = await chunker.chunkFile('test.ts');

        const enumChunk = chunks.find((c) => c.name === 'Color');
        expect(enumChunk).toBeDefined();
      });
    });
  });
});
