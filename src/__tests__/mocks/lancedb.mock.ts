import { vi } from 'vitest';

export interface MockRow {
  id: string;
  filepath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
  vector?: number[];
  symbolType?:
    | 'function'
    | 'class'
    | 'method'
    | 'interface'
    | 'type'
    | 'variable'
    | 'import'
    | 'other';
  symbolName?: string;
}

/**
 * Creates a mock LanceDB table
 */
export function createMockTable(initialData: MockRow[] = []) {
  let data = [...initialData];

  const mockQuery = {
    toArray: vi.fn().mockImplementation(async () => data),
    limit: vi.fn().mockReturnThis(),
  };

  return {
    add: vi.fn().mockImplementation(async (rows: MockRow[]) => {
      data.push(...rows);
    }),
    delete: vi.fn().mockImplementation(async (filter: string) => {
      // Simple filter parsing for "filepath = 'value'"
      const match = filter.match(/filepath = '(.+)'/);
      if (match) {
        const pathToDelete = match[1].replace(/''/g, "'");
        data = data.filter((row) => row.filepath !== pathToDelete);
      }
    }),
    countRows: vi.fn().mockImplementation(async () => data.length),
    query: vi.fn().mockReturnValue(mockQuery),
    search: vi.fn().mockImplementation(() => ({
      limit: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(data),
      }),
    })),
  };
}

/**
 * Creates a mock LanceDB connection
 */
export function createMockConnection(
  tables: Record<string, ReturnType<typeof createMockTable>> = {}
) {
  const tableStore = { ...tables };

  return {
    tableNames: vi.fn().mockImplementation(async () => Object.keys(tableStore)),
    openTable: vi.fn().mockImplementation(async (name: string) => {
      if (!tableStore[name]) {
        throw new Error(`Table ${name} not found`);
      }
      return tableStore[name];
    }),
    createTable: vi.fn().mockImplementation(async (name: string, data: MockRow[]) => {
      const table = createMockTable(data);
      tableStore[name] = table;
      return table;
    }),
    dropTable: vi.fn().mockImplementation(async (name: string) => {
      delete tableStore[name];
    }),
  };
}

/**
 * Setup mock for @lancedb/lancedb module
 */
export function setupLanceDBMock(connection: ReturnType<typeof createMockConnection>) {
  return {
    connect: vi.fn().mockResolvedValue(connection),
  };
}
