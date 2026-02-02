import { describe, it, expect } from 'vitest';
import {
  parseGetSymbolsOverviewArgs,
  parseFindSymbolArgs,
  parseFindReferencingSymbolsArgs,
  parseSearchForPatternArgs,
  parseReplaceSymbolBodyArgs,
  parseInsertBeforeSymbolArgs,
  parseInsertAfterSymbolArgs,
  parseRenameSymbolArgs,
  formatSymbolsOverview,
  formatMatchedSymbols,
  formatSymbolEditResult,
} from '../../tools/symbol-handlers.js';
import {
  SymbolKind,
  type SymbolsOverview,
  type Symbol as SymbolType,
  type EditResult,
} from '../../symbols/index.js';
import { GlanceyError } from '../../utils/errors.js';

describe('symbol-handlers', () => {
  // ============================================================================
  // get_symbols_overview
  // ============================================================================

  describe('parseGetSymbolsOverviewArgs', () => {
    it('should throw when relative_path is missing', () => {
      expect(() => parseGetSymbolsOverviewArgs({})).toThrow(GlanceyError);
      expect(() => parseGetSymbolsOverviewArgs({})).toThrow('relative_path is required');
    });

    it('should parse valid relative_path', () => {
      const result = parseGetSymbolsOverviewArgs({ relative_path: 'src/index.ts' });
      expect(result.relativePath).toBe('src/index.ts');
    });

    it('should default depth to 0', () => {
      const result = parseGetSymbolsOverviewArgs({ relative_path: 'test.ts' });
      expect(result.depth).toBe(0);
    });

    it('should parse custom depth', () => {
      const result = parseGetSymbolsOverviewArgs({ relative_path: 'test.ts', depth: 2 });
      expect(result.depth).toBe(2);
    });
  });

  describe('formatSymbolsOverview', () => {
    it('should format overview correctly', () => {
      const overview: SymbolsOverview = {
        filepath: 'src/test.ts',
        totalSymbols: 5,
        byKind: {
          Function: [
            { name: 'foo', namePath: '/foo', lines: '1-10' },
            { name: 'bar', namePath: '/bar', lines: '15-25', children: 2 },
          ],
          Variable: [{ name: 'count', namePath: '/count', lines: '30-30' }],
        },
      };

      const formatted = formatSymbolsOverview(overview);

      expect(formatted).toContain('## Symbols in src/test.ts');
      expect(formatted).toContain('Total: 5 symbols');
      expect(formatted).toContain('### Function (2)');
      expect(formatted).toContain('**foo** (1-10)');
      expect(formatted).toContain('**bar** (15-25) [2 children]');
      expect(formatted).toContain('### Variable (1)');
      expect(formatted).toContain('**count** (30-30)');
    });
  });

  // ============================================================================
  // find_symbol
  // ============================================================================

  describe('parseFindSymbolArgs', () => {
    it('should throw when name_path_pattern is missing', () => {
      expect(() => parseFindSymbolArgs({})).toThrow(GlanceyError);
      expect(() => parseFindSymbolArgs({})).toThrow('name_path_pattern is required');
    });

    it('should parse valid name_path_pattern', () => {
      const result = parseFindSymbolArgs({ name_path_pattern: 'MyClass/myMethod' });
      expect(result.namePathPattern).toBe('MyClass/myMethod');
    });

    it('should default depth to 0', () => {
      const result = parseFindSymbolArgs({ name_path_pattern: 'test' });
      expect(result.depth).toBe(0);
    });

    it('should default includeBody to false', () => {
      const result = parseFindSymbolArgs({ name_path_pattern: 'test' });
      expect(result.includeBody).toBe(false);
    });

    it('should parse includeBody', () => {
      const result = parseFindSymbolArgs({ name_path_pattern: 'test', include_body: true });
      expect(result.includeBody).toBe(true);
    });

    it('should parse substringMatching', () => {
      const result = parseFindSymbolArgs({ name_path_pattern: 'test', substring_matching: true });
      expect(result.substringMatching).toBe(true);
    });

    it('should parse kind filters', () => {
      const result = parseFindSymbolArgs({
        name_path_pattern: 'test',
        include_kinds: [SymbolKind.Function],
        exclude_kinds: [SymbolKind.Variable],
      });
      expect(result.includeKinds).toEqual([SymbolKind.Function]);
      expect(result.excludeKinds).toEqual([SymbolKind.Variable]);
    });
  });

  describe('formatMatchedSymbols', () => {
    it('should return message for no matches', () => {
      const formatted = formatMatchedSymbols([], 'MyClass');
      expect(formatted).toContain('No symbols found matching pattern: MyClass');
    });

    it('should format matched symbols', () => {
      const symbol: SymbolType = {
        name: 'myFunction',
        kind: SymbolKind.Function,
        namePath: '/myFunction',
        depth: 0,
        location: {
          filepath: 'src/test.ts',
          startLine: 10,
          endLine: 20,
          startColumn: 0,
          endColumn: 0,
        },
      };

      const formatted = formatMatchedSymbols([{ symbol, file: 'src/test.ts' }], 'myFunction');

      expect(formatted).toContain('Found 1 matching symbol(s)');
      expect(formatted).toContain('## myFunction (Function)');
      expect(formatted).toContain('**Location:** src/test.ts:10-20');
    });

    it('should include body when present', () => {
      const symbol: SymbolType = {
        name: 'foo',
        kind: SymbolKind.Function,
        namePath: '/foo',
        depth: 0,
        location: { filepath: 'test.ts', startLine: 1, endLine: 5, startColumn: 0, endColumn: 0 },
        body: 'function foo() { return 42; }',
      };

      const formatted = formatMatchedSymbols([{ symbol, file: 'test.ts' }], 'foo');

      expect(formatted).toContain('```');
      expect(formatted).toContain('function foo()');
    });

    it('should include children info when present', () => {
      const child: SymbolType = {
        name: 'innerMethod',
        kind: SymbolKind.Method,
        namePath: 'MyClass/innerMethod',
        depth: 1,
        location: { filepath: 'test.ts', startLine: 5, endLine: 10, startColumn: 0, endColumn: 0 },
      };
      const symbol: SymbolType = {
        name: 'MyClass',
        kind: SymbolKind.Class,
        namePath: '/MyClass',
        depth: 0,
        location: { filepath: 'test.ts', startLine: 1, endLine: 20, startColumn: 0, endColumn: 0 },
        children: [child],
      };

      const formatted = formatMatchedSymbols([{ symbol, file: 'test.ts' }], 'MyClass');

      expect(formatted).toContain('**Children:** 1');
      expect(formatted).toContain('innerMethod (Method, lines 5-10)');
    });
  });

  // ============================================================================
  // find_referencing_symbols
  // ============================================================================

  describe('parseFindReferencingSymbolsArgs', () => {
    it('should throw when name_path is missing', () => {
      expect(() => parseFindReferencingSymbolsArgs({ relative_path: 'test.ts' })).toThrow(
        GlanceyError
      );
    });

    it('should throw when relative_path is missing', () => {
      expect(() => parseFindReferencingSymbolsArgs({ name_path: 'myFunc' })).toThrow(GlanceyError);
    });

    it('should throw when both are missing', () => {
      expect(() => parseFindReferencingSymbolsArgs({})).toThrow(
        'name_path and relative_path are required'
      );
    });

    it('should parse valid arguments', () => {
      const result = parseFindReferencingSymbolsArgs({
        name_path: 'myFunc',
        relative_path: 'src/utils.ts',
      });
      expect(result.namePath).toBe('myFunc');
      expect(result.relativePath).toBe('src/utils.ts');
    });

    it('should default includeInfo to false', () => {
      const result = parseFindReferencingSymbolsArgs({
        name_path: 'test',
        relative_path: 'test.ts',
      });
      expect(result.includeInfo).toBe(false);
    });

    it('should parse includeInfo', () => {
      const result = parseFindReferencingSymbolsArgs({
        name_path: 'test',
        relative_path: 'test.ts',
        include_info: true,
      });
      expect(result.includeInfo).toBe(true);
    });
  });

  // ============================================================================
  // search_for_pattern
  // ============================================================================

  describe('parseSearchForPatternArgs', () => {
    it('should throw when substring_pattern is missing', () => {
      expect(() => parseSearchForPatternArgs({})).toThrow(GlanceyError);
      expect(() => parseSearchForPatternArgs({})).toThrow('substring_pattern is required');
    });

    it('should parse valid substring_pattern', () => {
      const result = parseSearchForPatternArgs({ substring_pattern: 'TODO:' });
      expect(result.substringPattern).toBe('TODO:');
    });

    it('should parse optional parameters', () => {
      const result = parseSearchForPatternArgs({
        substring_pattern: 'test',
        relative_path: 'src/',
        restrict_search_to_code_files: true,
        paths_include_glob: '*.ts',
        paths_exclude_glob: '*.test.ts',
        context_lines_before: 2,
        context_lines_after: 3,
        max_answer_chars: 10000,
      });

      expect(result.relativePath).toBe('src/');
      expect(result.restrictSearchToCodeFiles).toBe(true);
      expect(result.pathsIncludeGlob).toBe('*.ts');
      expect(result.pathsExcludeGlob).toBe('*.test.ts');
      expect(result.contextLinesBefore).toBe(2);
      expect(result.contextLinesAfter).toBe(3);
      expect(result.maxAnswerChars).toBe(10000);
    });

    it('should use defaults for optional parameters', () => {
      const result = parseSearchForPatternArgs({ substring_pattern: 'test' });

      expect(result.restrictSearchToCodeFiles).toBe(false);
      expect(result.contextLinesBefore).toBe(0);
      expect(result.contextLinesAfter).toBe(0);
      expect(result.maxAnswerChars).toBe(50000);
    });
  });

  // ============================================================================
  // Symbol Edit: replace_symbol_body
  // ============================================================================

  describe('parseReplaceSymbolBodyArgs', () => {
    it('should throw when name_path is missing', () => {
      expect(() =>
        parseReplaceSymbolBodyArgs({ relative_path: 'test.ts', body: 'new body' })
      ).toThrow(GlanceyError);
    });

    it('should throw when relative_path is missing', () => {
      expect(() => parseReplaceSymbolBodyArgs({ name_path: 'myFunc', body: 'new body' })).toThrow(
        GlanceyError
      );
    });

    it('should throw when body is missing', () => {
      expect(() =>
        parseReplaceSymbolBodyArgs({ name_path: 'myFunc', relative_path: 'test.ts' })
      ).toThrow(GlanceyError);
    });

    it('should parse valid arguments', () => {
      const result = parseReplaceSymbolBodyArgs({
        name_path: 'myFunc',
        relative_path: 'src/utils.ts',
        body: 'function myFunc() { return 42; }',
      });

      expect(result.namePath).toBe('myFunc');
      expect(result.relativePath).toBe('src/utils.ts');
      expect(result.body).toBe('function myFunc() { return 42; }');
    });
  });

  describe('formatSymbolEditResult', () => {
    it('should format error result', () => {
      const result: EditResult = {
        success: false,
        filepath: 'test.ts',
        symbolName: 'myFunc',
        error: 'Symbol not found',
      };
      const formatted = formatSymbolEditResult(result, 'replace');
      expect(formatted).toContain('Failed to replace: Symbol not found');
    });

    it('should format success result', () => {
      const result: EditResult = {
        success: true,
        symbolName: 'myFunc',
        filepath: 'src/utils.ts',
        newRange: { startLine: 10, endLine: 20 },
      };
      const formatted = formatSymbolEditResult(result, 'replaced');

      expect(formatted).toContain('Symbol "myFunc" replaced in src/utils.ts');
      expect(formatted).toContain('New location: lines 10-20');
    });
  });

  // ============================================================================
  // Symbol Edit: insert_before_symbol
  // ============================================================================

  describe('parseInsertBeforeSymbolArgs', () => {
    it('should throw when required args are missing', () => {
      expect(() => parseInsertBeforeSymbolArgs({})).toThrow(GlanceyError);
      expect(() => parseInsertBeforeSymbolArgs({})).toThrow(
        'name_path, relative_path, and body are required'
      );
    });

    it('should parse valid arguments', () => {
      const result = parseInsertBeforeSymbolArgs({
        name_path: 'myFunc',
        relative_path: 'test.ts',
        body: '// Comment',
      });

      expect(result.namePath).toBe('myFunc');
      expect(result.relativePath).toBe('test.ts');
      expect(result.body).toBe('// Comment');
    });
  });

  // ============================================================================
  // Symbol Edit: insert_after_symbol
  // ============================================================================

  describe('parseInsertAfterSymbolArgs', () => {
    it('should throw when required args are missing', () => {
      expect(() => parseInsertAfterSymbolArgs({})).toThrow(GlanceyError);
    });

    it('should parse valid arguments', () => {
      const result = parseInsertAfterSymbolArgs({
        name_path: 'myFunc',
        relative_path: 'test.ts',
        body: 'function newFunc() {}',
      });

      expect(result.namePath).toBe('myFunc');
      expect(result.relativePath).toBe('test.ts');
      expect(result.body).toBe('function newFunc() {}');
    });
  });

  // ============================================================================
  // Symbol Edit: rename_symbol
  // ============================================================================

  describe('parseRenameSymbolArgs', () => {
    it('should throw when name_path is missing', () => {
      expect(() =>
        parseRenameSymbolArgs({ relative_path: 'test.ts', new_name: 'newName' })
      ).toThrow(GlanceyError);
    });

    it('should throw when relative_path is missing', () => {
      expect(() => parseRenameSymbolArgs({ name_path: 'oldName', new_name: 'newName' })).toThrow(
        GlanceyError
      );
    });

    it('should throw when new_name is missing', () => {
      expect(() =>
        parseRenameSymbolArgs({ name_path: 'oldName', relative_path: 'test.ts' })
      ).toThrow(GlanceyError);
    });

    it('should parse valid arguments', () => {
      const result = parseRenameSymbolArgs({
        name_path: 'oldFunc',
        relative_path: 'src/utils.ts',
        new_name: 'newFunc',
      });

      expect(result.namePath).toBe('oldFunc');
      expect(result.relativePath).toBe('src/utils.ts');
      expect(result.newName).toBe('newFunc');
    });

    it('should default dryRun to false', () => {
      const result = parseRenameSymbolArgs({
        name_path: 'old',
        relative_path: 'test.ts',
        new_name: 'new',
      });
      expect(result.dryRun).toBe(false);
    });

    it('should parse dryRun', () => {
      const result = parseRenameSymbolArgs({
        name_path: 'old',
        relative_path: 'test.ts',
        new_name: 'new',
        dry_run: true,
      });
      expect(result.dryRun).toBe(true);
    });
  });
});
