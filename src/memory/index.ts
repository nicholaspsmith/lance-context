/**
 * File-based memory system for storing project-specific information.
 * Stores human-readable markdown files in .glancey/memories/
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Memory entry metadata
 */
export interface MemoryInfo {
  name: string;
  size: number;
  lastModified: Date;
}

/**
 * Memory manager for storing and retrieving project memories.
 */
export class MemoryManager {
  private projectPath: string;
  private memoriesPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.memoriesPath = path.join(projectPath, '.glancey', 'memories');
  }

  /**
   * Ensure the memories directory exists.
   */
  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.memoriesPath, { recursive: true });
  }

  /**
   * Normalize a memory file name (ensure .md extension).
   */
  private normalizeFileName(name: string): string {
    if (!name.endsWith('.md')) {
      return `${name}.md`;
    }
    return name;
  }

  /**
   * Get the full path to a memory file.
   */
  private getMemoryPath(name: string): string {
    return path.join(this.memoriesPath, this.normalizeFileName(name));
  }

  /**
   * Write content to a memory file.
   */
  async writeMemory(name: string, content: string): Promise<void> {
    await this.ensureDirectory();
    const memoryPath = this.getMemoryPath(name);
    await fs.writeFile(memoryPath, content, 'utf-8');
  }

  /**
   * Read content from a memory file.
   */
  async readMemory(name: string): Promise<string> {
    const memoryPath = this.getMemoryPath(name);
    try {
      return await fs.readFile(memoryPath, 'utf-8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Memory not found: ${name}`);
      }
      throw e;
    }
  }

  /**
   * List all memory files.
   */
  async listMemories(): Promise<MemoryInfo[]> {
    try {
      await this.ensureDirectory();
      const files = await fs.readdir(this.memoriesPath);
      const memories: MemoryInfo[] = [];

      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(this.memoriesPath, file);
          const stat = await fs.stat(filePath);
          memories.push({
            name: file.replace(/\.md$/, ''),
            size: stat.size,
            lastModified: stat.mtime,
          });
        }
      }

      // Sort by last modified (most recent first)
      memories.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      return memories;
    } catch {
      return [];
    }
  }

  /**
   * Delete a memory file.
   */
  async deleteMemory(name: string): Promise<void> {
    const memoryPath = this.getMemoryPath(name);
    try {
      await fs.unlink(memoryPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Memory not found: ${name}`);
      }
      throw e;
    }
  }

  /**
   * Edit a memory file using find/replace.
   */
  async editMemory(
    name: string,
    needle: string,
    replacement: string,
    mode: 'literal' | 'regex'
  ): Promise<{ matchCount: number }> {
    const content = await this.readMemory(name);

    let newContent: string;
    let matchCount: number;

    if (mode === 'literal') {
      // Count matches
      matchCount = content.split(needle).length - 1;
      if (matchCount === 0) {
        throw new Error(`Pattern not found in memory: ${needle}`);
      }
      // Replace all occurrences
      newContent = content.split(needle).join(replacement);
    } else {
      // Regex mode
      let regex: RegExp;
      try {
        regex = new RegExp(needle, 'gms'); // DOTALL and MULTILINE enabled
      } catch (e) {
        throw new Error(`Invalid regex pattern: ${needle}. ${e instanceof Error ? e.message : ''}`);
      }

      const matches = content.match(regex);
      matchCount = matches ? matches.length : 0;

      if (matchCount === 0) {
        throw new Error(`Pattern not found in memory: ${needle}`);
      }

      newContent = content.replace(regex, replacement);
    }

    await this.writeMemory(name, newContent);

    return { matchCount };
  }

  /**
   * Check if a memory exists.
   */
  async memoryExists(name: string): Promise<boolean> {
    const memoryPath = this.getMemoryPath(name);
    try {
      await fs.access(memoryPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Format memory list for display.
 */
export function formatMemoryList(memories: MemoryInfo[]): string {
  if (memories.length === 0) {
    return 'No memories found.';
  }

  const parts: string[] = [];
  parts.push(`Found ${memories.length} memor${memories.length === 1 ? 'y' : 'ies'}:\n`);

  for (const memory of memories) {
    const date = memory.lastModified.toISOString().split('T')[0];
    const sizeKb = (memory.size / 1024).toFixed(1);
    parts.push(`- **${memory.name}** (${sizeKb} KB, modified ${date})`);
  }

  return parts.join('\n');
}
