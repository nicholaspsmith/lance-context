import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TreeSitterChunker } from '../../search/tree-sitter-chunker.js';

describe('TreeSitterChunker', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tree-sitter-test-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('canParse', () => {
    it('should return true for Python files', () => {
      expect(TreeSitterChunker.canParse('test.py')).toBe(true);
      expect(TreeSitterChunker.canParse('test.pyi')).toBe(true);
    });

    it('should return true for Go files', () => {
      expect(TreeSitterChunker.canParse('test.go')).toBe(true);
    });

    it('should return true for Rust files', () => {
      expect(TreeSitterChunker.canParse('test.rs')).toBe(true);
    });

    it('should return true for Java files', () => {
      expect(TreeSitterChunker.canParse('test.java')).toBe(true);
    });

    it('should return true for Ruby files', () => {
      expect(TreeSitterChunker.canParse('test.rb')).toBe(true);
    });

    it('should return false for unsupported files', () => {
      expect(TreeSitterChunker.canParse('test.txt')).toBe(false);
      expect(TreeSitterChunker.canParse('test.md')).toBe(false);
    });

    it('should not match TypeScript/JavaScript (handled by ASTChunker)', () => {
      // TreeSitterChunker should not claim these - they're handled by ASTChunker
      expect(TreeSitterChunker.canParse('test.ts')).toBe(false);
      expect(TreeSitterChunker.canParse('test.js')).toBe(false);
    });
  });

  describe('getLanguageName', () => {
    it('should return correct language names', () => {
      expect(TreeSitterChunker.getLanguageName('test.py')).toBe('python');
      expect(TreeSitterChunker.getLanguageName('test.go')).toBe('go');
      expect(TreeSitterChunker.getLanguageName('test.rs')).toBe('rust');
      expect(TreeSitterChunker.getLanguageName('test.java')).toBe('java');
      expect(TreeSitterChunker.getLanguageName('test.rb')).toBe('ruby');
    });

    it('should return null for unsupported files', () => {
      expect(TreeSitterChunker.getLanguageName('test.txt')).toBe(null);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return all supported extensions', () => {
      const extensions = TreeSitterChunker.getSupportedExtensions();
      expect(extensions).toContain('.py');
      expect(extensions).toContain('.pyi');
      expect(extensions).toContain('.go');
      expect(extensions).toContain('.rs');
      expect(extensions).toContain('.java');
      expect(extensions).toContain('.rb');
    });
  });

  describe('chunkFile - Python', () => {
    it('should chunk Python functions', async () => {
      const pythonCode = `
import os
from typing import List

def hello(name: str) -> str:
    """Say hello."""
    return f"Hello, {name}!"

def goodbye(name: str) -> str:
    """Say goodbye."""
    return f"Goodbye, {name}!"

class Greeter:
    def __init__(self, prefix: str):
        self.prefix = prefix

    def greet(self, name: str) -> str:
        return f"{self.prefix} {name}"
`;

      const filepath = path.join(tempDir, 'test.py');
      await fs.writeFile(filepath, pythonCode);

      const chunker = new TreeSitterChunker();
      const chunks = await chunker.chunkFile(filepath);

      // Should have imports, two functions, and a class
      expect(chunks.length).toBeGreaterThanOrEqual(3);

      // Check for import chunk
      const importChunk = chunks.find((c) => c.type === 'import');
      expect(importChunk).toBeDefined();
      expect(importChunk?.content).toContain('import os');

      // Check for function chunks
      const funcChunks = chunks.filter((c) => c.type === 'function');
      expect(funcChunks.length).toBe(2);
      expect(funcChunks.some((c) => c.name === 'hello')).toBe(true);
      expect(funcChunks.some((c) => c.name === 'goodbye')).toBe(true);

      // Check for class chunk
      const classChunks = chunks.filter((c) => c.type === 'class');
      expect(classChunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('chunkFile - Go', () => {
    it('should chunk Go functions and types', async () => {
      const goCode = `package main

import "fmt"

func Hello(name string) string {
	return fmt.Sprintf("Hello, %s!", name)
}

type Greeter struct {
	Prefix string
}

func (g *Greeter) Greet(name string) string {
	return fmt.Sprintf("%s %s", g.Prefix, name)
}
`;

      const filepath = path.join(tempDir, 'test.go');
      await fs.writeFile(filepath, goCode);

      const chunker = new TreeSitterChunker();
      const chunks = await chunker.chunkFile(filepath);

      // Should have import, function, type, and method
      expect(chunks.length).toBeGreaterThanOrEqual(3);

      // Check for import chunk
      const importChunk = chunks.find((c) => c.type === 'import');
      expect(importChunk).toBeDefined();
      expect(importChunk?.content).toContain('import "fmt"');

      // Check for function chunk
      const funcChunks = chunks.filter((c) => c.type === 'function');
      expect(funcChunks.length).toBeGreaterThanOrEqual(1);
      expect(funcChunks.some((c) => c.name === 'Hello')).toBe(true);
    });
  });

  describe('chunkFile - Rust', () => {
    it('should chunk Rust functions and structs', async () => {
      const rustCode = `use std::fmt;

fn hello(name: &str) -> String {
    format!("Hello, {}!", name)
}

struct Greeter {
    prefix: String,
}

impl Greeter {
    fn new(prefix: &str) -> Self {
        Greeter {
            prefix: prefix.to_string(),
        }
    }

    fn greet(&self, name: &str) -> String {
        format!("{} {}", self.prefix, name)
    }
}
`;

      const filepath = path.join(tempDir, 'test.rs');
      await fs.writeFile(filepath, rustCode);

      const chunker = new TreeSitterChunker();
      const chunks = await chunker.chunkFile(filepath);

      // Should have use, function, struct, and impl
      expect(chunks.length).toBeGreaterThanOrEqual(3);

      // Check for import chunk
      const importChunk = chunks.find((c) => c.type === 'import');
      expect(importChunk).toBeDefined();
      expect(importChunk?.content).toContain('use std::fmt');

      // Check for function chunk
      const funcChunks = chunks.filter((c) => c.type === 'function');
      expect(funcChunks.length).toBeGreaterThanOrEqual(1);
      expect(funcChunks.some((c) => c.name === 'hello')).toBe(true);
    });
  });

  describe('chunkFile - Java', () => {
    it('should chunk Java classes and methods', async () => {
      const javaCode = `package com.example;

import java.util.List;

public class Greeter {
    private String prefix;

    public Greeter(String prefix) {
        this.prefix = prefix;
    }

    public String greet(String name) {
        return prefix + " " + name;
    }
}
`;

      const filepath = path.join(tempDir, 'Test.java');
      await fs.writeFile(filepath, javaCode);

      const chunker = new TreeSitterChunker();
      const chunks = await chunker.chunkFile(filepath);

      // Should have import and class
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // Check for import chunk
      const importChunk = chunks.find((c) => c.type === 'import');
      expect(importChunk).toBeDefined();
      expect(importChunk?.content).toContain('import java.util.List');

      // Check for class chunk
      const classChunks = chunks.filter((c) => c.type === 'class');
      expect(classChunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    it('should throw for unsupported file types', async () => {
      const filepath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filepath, 'Hello, World!');

      const chunker = new TreeSitterChunker();
      await expect(chunker.chunkFile(filepath)).rejects.toThrow('Unsupported file type');
    });

    it('should handle empty files', async () => {
      const filepath = path.join(tempDir, 'empty.py');
      await fs.writeFile(filepath, '');

      const chunker = new TreeSitterChunker();
      const chunks = await chunker.chunkFile(filepath);
      expect(chunks).toEqual([]);
    });
  });
});
