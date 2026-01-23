import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { Parser as ParserType, Language, Node as SyntaxNode } from 'web-tree-sitter';

// Dynamic import for ESM compatibility
interface ParserModule {
  Parser: typeof ParserType;
  Language: typeof Language;
}

let parserModule: ParserModule | null = null;
const loadParserModule = async (): Promise<ParserModule> => {
  if (!parserModule) {
    const mod = await import('web-tree-sitter');
    parserModule = {
      Parser: mod.Parser,
      Language: mod.Language,
    };
  }
  return parserModule;
};

/**
 * Chunk from tree-sitter AST parsing
 */
export interface TreeSitterChunk {
  content: string;
  startLine: number;
  endLine: number;
  type: 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable' | 'import' | 'other';
  name?: string;
}

// Maximum lines per chunk before splitting
const MAX_CHUNK_LINES = 100;
// Minimum lines for a chunk (avoid tiny fragments)
const MIN_CHUNK_LINES = 3;

/**
 * Language configuration for tree-sitter parsing
 */
interface LanguageConfig {
  wasmFile: string;
  extensions: string[];
  // Node types that represent top-level definitions
  functionTypes: string[];
  classTypes: string[];
  methodTypes: string[];
  importTypes: string[];
  variableTypes: string[];
  interfaceTypes: string[];
  typeTypes: string[];
}

/**
 * Language configurations for supported languages
 * Note: Only includes languages available in @vscode/tree-sitter-wasm
 */
const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  python: {
    wasmFile: 'tree-sitter-python.wasm',
    extensions: ['.py', '.pyi'],
    functionTypes: ['function_definition'],
    classTypes: ['class_definition'],
    methodTypes: ['function_definition'], // Methods are function_definition inside class
    importTypes: ['import_statement', 'import_from_statement'],
    variableTypes: ['assignment', 'expression_statement'],
    interfaceTypes: [],
    typeTypes: [],
  },
  go: {
    wasmFile: 'tree-sitter-go.wasm',
    extensions: ['.go'],
    functionTypes: ['function_declaration'],
    classTypes: [], // Go doesn't have classes
    methodTypes: ['method_declaration'],
    importTypes: ['import_declaration'],
    variableTypes: ['var_declaration', 'const_declaration', 'short_var_declaration'],
    interfaceTypes: ['type_declaration'], // interface types
    typeTypes: ['type_declaration'],
  },
  rust: {
    wasmFile: 'tree-sitter-rust.wasm',
    extensions: ['.rs'],
    functionTypes: ['function_item'],
    classTypes: [], // Rust doesn't have classes
    methodTypes: ['function_item'], // Methods are function_item inside impl
    importTypes: ['use_declaration'],
    variableTypes: ['let_declaration', 'const_item', 'static_item'],
    interfaceTypes: ['trait_item'],
    typeTypes: ['type_item', 'struct_item', 'enum_item', 'impl_item'],
  },
  java: {
    wasmFile: 'tree-sitter-java.wasm',
    extensions: ['.java'],
    functionTypes: [],
    classTypes: ['class_declaration', 'interface_declaration', 'enum_declaration'],
    methodTypes: ['method_declaration', 'constructor_declaration'],
    importTypes: ['import_declaration'],
    variableTypes: ['field_declaration', 'local_variable_declaration'],
    interfaceTypes: ['interface_declaration'],
    typeTypes: [],
  },
  ruby: {
    wasmFile: 'tree-sitter-ruby.wasm',
    extensions: ['.rb'],
    functionTypes: ['method'],
    classTypes: ['class', 'module'],
    methodTypes: ['method', 'singleton_method'],
    importTypes: ['call'], // require/require_relative calls
    variableTypes: ['assignment'],
    interfaceTypes: [],
    typeTypes: [],
  },
};

/**
 * Tree-sitter based AST chunker for multiple languages
 * Provides language-agnostic code parsing beyond TypeScript/JavaScript
 */
export class TreeSitterChunker {
  private static parser: ParserType | null = null;
  private static loadedLanguages: Map<string, Language> = new Map();
  private static initPromise: Promise<void> | null = null;
  private static wasmBasePath: string | null = null;

  /**
   * Initialize the tree-sitter parser (call once before using)
   */
  static async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      // Find the WASM files path
      this.wasmBasePath = await this.findWasmBasePath();

      // Initialize the parser via dynamic import
      const module = await loadParserModule();

      // Initialize with locateFile to find the wasm file bundled with web-tree-sitter
      const webTreeSitterWasm = path.join(
        process.cwd(),
        'node_modules',
        'web-tree-sitter',
        'web-tree-sitter.wasm'
      );
      await module.Parser.init({
        locateFile: () => webTreeSitterWasm,
      });
      this.parser = new module.Parser();
    })();

    return this.initPromise;
  }

  /**
   * Find the path to the tree-sitter WASM files
   */
  private static async findWasmBasePath(): Promise<string> {
    // Try common locations
    const possiblePaths = [
      path.join(process.cwd(), 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm'),
      path.join(
        fileURLToPath(import.meta.url),
        '..',
        '..',
        '..',
        'node_modules',
        '@vscode',
        'tree-sitter-wasm',
        'wasm'
      ),
    ];

    for (const p of possiblePaths) {
      try {
        await fs.access(p);
        return p;
      } catch {
        // Try next path
      }
    }

    throw new Error(
      'Could not find @vscode/tree-sitter-wasm package. Please install it with: npm install @vscode/tree-sitter-wasm'
    );
  }

  /**
   * Get the language configuration for a file extension
   */
  private static getLanguageConfig(filepath: string): LanguageConfig | null {
    const ext = path.extname(filepath).toLowerCase();

    for (const [, config] of Object.entries(LANGUAGE_CONFIGS)) {
      if (config.extensions.includes(ext)) {
        return config;
      }
    }

    return null;
  }

  /**
   * Get the language name for a file extension
   */
  static getLanguageName(filepath: string): string | null {
    const ext = path.extname(filepath).toLowerCase();

    for (const [name, config] of Object.entries(LANGUAGE_CONFIGS)) {
      if (config.extensions.includes(ext)) {
        return name;
      }
    }

    return null;
  }

  /**
   * Check if a file can be parsed with tree-sitter
   */
  static canParse(filepath: string): boolean {
    return this.getLanguageConfig(filepath) !== null;
  }

  /**
   * Get the list of supported file extensions
   */
  static getSupportedExtensions(): string[] {
    const extensions: string[] = [];
    for (const config of Object.values(LANGUAGE_CONFIGS)) {
      extensions.push(...config.extensions);
    }
    return extensions;
  }

  /**
   * Load a language if not already loaded
   */
  private static async loadLanguage(config: LanguageConfig): Promise<Language> {
    const cached = this.loadedLanguages.get(config.wasmFile);
    if (cached) {
      return cached;
    }

    if (!this.wasmBasePath) {
      throw new Error('TreeSitterChunker not initialized. Call initialize() first.');
    }

    const module = await loadParserModule();
    const wasmPath = path.join(this.wasmBasePath, config.wasmFile);

    // Load the WASM file as bytes for better compatibility
    const wasmBytes = await fs.readFile(wasmPath);
    const language = await module.Language.load(wasmBytes);
    this.loadedLanguages.set(config.wasmFile, language);
    return language;
  }

  /**
   * Parse a file and return AST-aware chunks
   */
  async chunkFile(filepath: string): Promise<TreeSitterChunk[]> {
    await TreeSitterChunker.initialize();

    const config = TreeSitterChunker.getLanguageConfig(filepath);
    if (!config) {
      throw new Error(`Unsupported file type: ${filepath}`);
    }

    const language = await TreeSitterChunker.loadLanguage(config);
    const parser = TreeSitterChunker.parser!;
    parser.setLanguage(language);

    const content = await fs.readFile(filepath, 'utf-8');
    const tree = parser.parse(content);
    if (!tree) {
      throw new Error(`Failed to parse file: ${filepath}`);
    }
    const lines = content.split('\n');

    const chunks: TreeSitterChunk[] = [];
    const imports: SyntaxNode[] = [];

    // Process top-level nodes
    this.processNode(tree.rootNode, config, lines, chunks, imports);

    // Add imports as the first chunk if present
    if (imports.length > 0) {
      const firstImport = imports[0];
      const lastImport = imports[imports.length - 1];

      chunks.unshift({
        content: lines
          .slice(firstImport.startPosition.row, lastImport.endPosition.row + 1)
          .join('\n'),
        startLine: firstImport.startPosition.row + 1,
        endLine: lastImport.endPosition.row + 1,
        type: 'import',
        name: 'imports',
      });
    }

    // Sort chunks by start line
    chunks.sort((a, b) => a.startLine - b.startLine);

    // Split large chunks
    const finalChunks: TreeSitterChunk[] = [];
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
   * Process a node and its children to extract chunks
   */
  private processNode(
    node: SyntaxNode,
    config: LanguageConfig,
    lines: string[],
    chunks: TreeSitterChunk[],
    imports: SyntaxNode[],
    parentClassName?: string
  ): void {
    // Check if this is an import
    if (config.importTypes.includes(node.type)) {
      imports.push(node);
      return;
    }

    // Check if this is a class/struct
    if (config.classTypes.includes(node.type)) {
      const className = this.getNodeName(node) || 'AnonymousClass';
      const classLines = node.endPosition.row - node.startPosition.row + 1;

      if (classLines <= MAX_CHUNK_LINES) {
        // Keep class together
        chunks.push({
          content: lines.slice(node.startPosition.row, node.endPosition.row + 1).join('\n'),
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          type: 'class',
          name: className,
        });
      } else {
        // Split class into header + methods
        this.processClassNode(node, config, lines, chunks, className);
      }
      return;
    }

    // Check if this is a function (top-level)
    if (config.functionTypes.includes(node.type) && !parentClassName) {
      const name = this.getNodeName(node);
      chunks.push({
        content: lines.slice(node.startPosition.row, node.endPosition.row + 1).join('\n'),
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        type: 'function',
        name,
      });
      return;
    }

    // Check if this is a method (inside class)
    if (config.methodTypes.includes(node.type) && parentClassName) {
      const methodName = this.getNodeName(node);
      chunks.push({
        content: lines.slice(node.startPosition.row, node.endPosition.row + 1).join('\n'),
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        type: 'method',
        name: methodName ? `${parentClassName}.${methodName}` : parentClassName,
      });
      return;
    }

    // Check for interfaces/traits
    if (config.interfaceTypes.includes(node.type)) {
      const name = this.getNodeName(node);
      chunks.push({
        content: lines.slice(node.startPosition.row, node.endPosition.row + 1).join('\n'),
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        type: 'interface',
        name,
      });
      return;
    }

    // Check for type definitions
    if (config.typeTypes.includes(node.type)) {
      const name = this.getNodeName(node);
      const typeLines = node.endPosition.row - node.startPosition.row + 1;

      if (typeLines <= MAX_CHUNK_LINES) {
        chunks.push({
          content: lines.slice(node.startPosition.row, node.endPosition.row + 1).join('\n'),
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          type: 'type',
          name,
        });
      } else {
        // For large type definitions (like impl blocks in Rust), process children
        for (const child of node.children) {
          this.processNode(child, config, lines, chunks, imports, name);
        }
      }
      return;
    }

    // Check for top-level variables
    if (config.variableTypes.includes(node.type) && node.parent?.type === 'source_file') {
      const name = this.getNodeName(node);
      chunks.push({
        content: lines.slice(node.startPosition.row, node.endPosition.row + 1).join('\n'),
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        type: 'variable',
        name,
      });
      return;
    }

    // Recurse into children
    for (const child of node.children) {
      this.processNode(child, config, lines, chunks, imports, parentClassName);
    }
  }

  /**
   * Process a class node that's too large to fit in one chunk
   */
  private processClassNode(
    node: SyntaxNode,
    config: LanguageConfig,
    lines: string[],
    chunks: TreeSitterChunk[],
    className: string
  ): void {
    // Find the first child that's a method or field
    let headerEndRow = node.startPosition.row;
    const methods: SyntaxNode[] = [];

    for (const child of node.children) {
      if (config.methodTypes.includes(child.type)) {
        methods.push(child);
        if (methods.length === 1) {
          headerEndRow = child.startPosition.row - 1;
        }
      }
    }

    // Add class header
    if (headerEndRow > node.startPosition.row) {
      chunks.push({
        content: lines.slice(node.startPosition.row, headerEndRow + 1).join('\n'),
        startLine: node.startPosition.row + 1,
        endLine: headerEndRow + 1,
        type: 'class',
        name: `${className} (header)`,
      });
    }

    // Add individual methods
    for (const method of methods) {
      const methodName = this.getNodeName(method);
      chunks.push({
        content: lines.slice(method.startPosition.row, method.endPosition.row + 1).join('\n'),
        startLine: method.startPosition.row + 1,
        endLine: method.endPosition.row + 1,
        type: 'method',
        name: methodName ? `${className}.${methodName}` : className,
      });
    }
  }

  /**
   * Get the name of a node (function name, class name, etc.)
   */
  private getNodeName(node: SyntaxNode): string | undefined {
    // Look for a name or identifier child
    for (const child of node.children) {
      if (
        child.type === 'identifier' ||
        child.type === 'name' ||
        child.type === 'type_identifier'
      ) {
        return child.text;
      }
      // For Python decorators, the name might be nested
      if (child.type === 'decorated_definition') {
        return this.getNodeName(child);
      }
    }

    // For some languages, try the first named child
    const firstNamedChild = node.firstNamedChild;
    if (
      firstNamedChild &&
      (firstNamedChild.type === 'identifier' || firstNamedChild.type === 'name')
    ) {
      return firstNamedChild.text;
    }

    return undefined;
  }

  /**
   * Split a large chunk into smaller pieces
   */
  private splitLargeChunk(chunk: TreeSitterChunk, _allLines: string[]): TreeSitterChunk[] {
    const chunkLines = chunk.content.split('\n');
    const totalLines = chunkLines.length;
    const chunks: TreeSitterChunk[] = [];

    const numParts = Math.ceil(totalLines / MAX_CHUNK_LINES);
    const linesPerPart = Math.ceil(totalLines / numParts);

    for (let i = 0; i < numParts; i++) {
      const startIdx = i * linesPerPart;
      const endIdx = Math.min((i + 1) * linesPerPart, totalLines);
      const partLines = chunkLines.slice(startIdx, endIdx);

      if (partLines.length < MIN_CHUNK_LINES && chunks.length > 0) {
        // Merge with previous chunk if too small
        const lastChunk = chunks[chunks.length - 1];
        lastChunk.content += '\n' + partLines.join('\n');
        lastChunk.endLine = chunk.startLine + endIdx - 1;
      } else {
        chunks.push({
          content: partLines.join('\n'),
          startLine: chunk.startLine + startIdx,
          endLine: chunk.startLine + endIdx - 1,
          type: chunk.type,
          name: chunk.name ? `${chunk.name} (part ${i + 1})` : undefined,
        });
      }
    }

    return chunks;
  }
}
