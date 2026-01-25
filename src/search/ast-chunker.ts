import * as ts from 'typescript';
import * as fs from 'fs/promises';
import * as path from 'path';
import { splitLargeChunk, type BaseChunk } from './chunk-utils.js';

export type ASTChunk = BaseChunk;

const MAX_CHUNK_LINES = 150;
const MIN_CHUNK_LINES = 10;

/**
 * AST-aware code chunker for TypeScript and JavaScript files.
 * Chunks code by logical units (functions, classes, etc.) rather than arbitrary line counts.
 */
export class ASTChunker {
  /**
   * Check if a file can be parsed with AST chunking
   */
  static canParse(filepath: string): boolean {
    const ext = path.extname(filepath).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'].includes(ext);
  }

  /**
   * Parse a file and return AST-aware chunks
   */
  async chunkFile(filepath: string): Promise<ASTChunk[]> {
    const content = await fs.readFile(filepath, 'utf-8');
    const ext = path.extname(filepath).toLowerCase();

    // Determine script kind
    let scriptKind = ts.ScriptKind.TS;
    if (ext === '.tsx' || ext === '.jsx') {
      scriptKind = ts.ScriptKind.TSX;
    } else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      scriptKind = ts.ScriptKind.JS;
    }

    // Parse the file
    const sourceFile = ts.createSourceFile(
      filepath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    const chunks: ASTChunk[] = [];
    const lines = content.split('\n');

    // Collect imports as a single chunk
    const imports: ts.Node[] = [];

    // Process top-level statements
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        imports.push(node);
        return;
      }

      const nodeChunks = this.extractChunks(node, sourceFile, lines);
      chunks.push(...nodeChunks);
    });

    // Add imports as the first chunk if present
    if (imports.length > 0) {
      const firstImport = imports[0];
      const lastImport = imports[imports.length - 1];
      const startLine = sourceFile.getLineAndCharacterOfPosition(
        firstImport.getStart(sourceFile)
      ).line;
      const endLine = sourceFile.getLineAndCharacterOfPosition(lastImport.getEnd()).line;

      chunks.unshift({
        content: lines.slice(startLine, endLine + 1).join('\n'),
        startLine: startLine + 1,
        endLine: endLine + 1,
        type: 'import',
        name: 'imports',
      });
    }

    // Sort chunks by start line
    chunks.sort((a, b) => a.startLine - b.startLine);

    // Split any chunks that are too large
    const finalChunks: ASTChunk[] = [];
    for (const chunk of chunks) {
      if (chunk.endLine - chunk.startLine + 1 > MAX_CHUNK_LINES) {
        const splitChunks = this.splitLargeChunk(chunk, lines);
        finalChunks.push(...splitChunks);
      } else {
        finalChunks.push(chunk);
      }
    }

    return finalChunks;
  }

  /**
   * Extract chunks from a node
   */
  private extractChunks(node: ts.Node, sourceFile: ts.SourceFile, lines: string[]): ASTChunk[] {
    const chunks: ASTChunk[] = [];
    const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;

    // Get leading comments/decorators
    const fullStart = node.getFullStart();
    const actualStartLine = sourceFile.getLineAndCharacterOfPosition(fullStart).line;

    if (ts.isFunctionDeclaration(node)) {
      chunks.push({
        content: lines.slice(actualStartLine, endLine + 1).join('\n'),
        startLine: actualStartLine + 1,
        endLine: endLine + 1,
        type: 'function',
        name: node.name?.getText(sourceFile),
      });
    } else if (ts.isClassDeclaration(node)) {
      // For classes, we have options:
      // 1. Keep the whole class together if it's small enough
      // 2. Split into class header + individual methods if too large
      const classLines = endLine - actualStartLine + 1;

      if (classLines <= MAX_CHUNK_LINES) {
        // Keep class together
        chunks.push({
          content: lines.slice(actualStartLine, endLine + 1).join('\n'),
          startLine: actualStartLine + 1,
          endLine: endLine + 1,
          type: 'class',
          name: node.name?.getText(sourceFile),
        });
      } else {
        // Split class into methods
        const className = node.name?.getText(sourceFile) || 'AnonymousClass';

        // Get class header (decorators + class declaration up to first member)
        const members = node.members;
        if (members.length > 0) {
          const firstMemberStart = sourceFile.getLineAndCharacterOfPosition(
            members[0].getFullStart()
          ).line;

          // Class header chunk
          if (firstMemberStart > actualStartLine) {
            chunks.push({
              content: lines.slice(actualStartLine, firstMemberStart).join('\n'),
              startLine: actualStartLine + 1,
              endLine: firstMemberStart,
              type: 'class',
              name: `${className} (header)`,
            });
          }

          // Individual method chunks
          for (const member of members) {
            const memberChunks = this.extractMemberChunk(member, sourceFile, lines, className);
            chunks.push(...memberChunks);
          }
        } else {
          // Empty class
          chunks.push({
            content: lines.slice(actualStartLine, endLine + 1).join('\n'),
            startLine: actualStartLine + 1,
            endLine: endLine + 1,
            type: 'class',
            name: className,
          });
        }
      }
    } else if (ts.isInterfaceDeclaration(node)) {
      chunks.push({
        content: lines.slice(actualStartLine, endLine + 1).join('\n'),
        startLine: actualStartLine + 1,
        endLine: endLine + 1,
        type: 'interface',
        name: node.name.getText(sourceFile),
      });
    } else if (ts.isTypeAliasDeclaration(node)) {
      chunks.push({
        content: lines.slice(actualStartLine, endLine + 1).join('\n'),
        startLine: actualStartLine + 1,
        endLine: endLine + 1,
        type: 'type',
        name: node.name.getText(sourceFile),
      });
    } else if (ts.isVariableStatement(node)) {
      const declarations = node.declarationList.declarations;
      const names = declarations
        .map((d) => (ts.isIdentifier(d.name) ? d.name.getText(sourceFile) : undefined))
        .filter(Boolean)
        .join(', ');

      chunks.push({
        content: lines.slice(actualStartLine, endLine + 1).join('\n'),
        startLine: actualStartLine + 1,
        endLine: endLine + 1,
        type: 'variable',
        name: names || undefined,
      });
    } else if (ts.isExpressionStatement(node) || ts.isExportAssignment(node)) {
      chunks.push({
        content: lines.slice(actualStartLine, endLine + 1).join('\n'),
        startLine: actualStartLine + 1,
        endLine: endLine + 1,
        type: 'other',
      });
    } else if (ts.isEnumDeclaration(node)) {
      chunks.push({
        content: lines.slice(actualStartLine, endLine + 1).join('\n'),
        startLine: actualStartLine + 1,
        endLine: endLine + 1,
        type: 'other',
        name: node.name.getText(sourceFile),
      });
    }

    return chunks;
  }

  /**
   * Extract a chunk for a class member
   */
  private extractMemberChunk(
    member: ts.ClassElement,
    sourceFile: ts.SourceFile,
    lines: string[],
    className: string
  ): ASTChunk[] {
    const fullStart = member.getFullStart();
    const startLine = sourceFile.getLineAndCharacterOfPosition(fullStart).line;
    const endLine = sourceFile.getLineAndCharacterOfPosition(member.getEnd()).line;

    let name: string | undefined;
    let type: ASTChunk['type'] = 'other';

    if (
      ts.isMethodDeclaration(member) ||
      ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member)
    ) {
      type = 'method';
      name = `${className}.${member.name?.getText(sourceFile) || 'anonymous'}`;
    } else if (ts.isConstructorDeclaration(member)) {
      type = 'method';
      name = `${className}.constructor`;
    } else if (ts.isPropertyDeclaration(member)) {
      type = 'variable';
      name = `${className}.${member.name?.getText(sourceFile) || 'property'}`;
    }

    return [
      {
        content: lines.slice(startLine, endLine + 1).join('\n'),
        startLine: startLine + 1,
        endLine: endLine + 1,
        type,
        name,
      },
    ];
  }

  /**
   * Split a large chunk into smaller pieces
   */
  private splitLargeChunk(chunk: ASTChunk, _allLines: string[]): ASTChunk[] {
    return splitLargeChunk(chunk, MAX_CHUNK_LINES, MIN_CHUNK_LINES);
  }
}
