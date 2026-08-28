import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuckDBContext } from '$lib/features/duckdb/types';

const {
  executeQueryMock,
  registerFilesMock,
  dropRegisteredFileMock,
  addRowIdMock,
  restoreNormalizedColumnNamesMock,
  runInTransactionMock
} = vi.hoisted(() => ({
  executeQueryMock: vi.fn(),
  registerFilesMock: vi.fn(),
  dropRegisteredFileMock: vi.fn(),
  addRowIdMock: vi.fn(),
  restoreNormalizedColumnNamesMock: vi.fn(),
  runInTransactionMock: vi.fn(
    async (_connection: unknown, callback: () => Promise<void>) => callback()
  )
}));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: executeQueryMock
}));

vi.mock('$lib/features/duckdb/core/transaction', () => ({
  runInTransaction: runInTransactionMock
}));

vi.mock('$lib/features/duckdb/io/file-registry', () => ({
  dropRegisteredFile: dropRegisteredFileMock,
  generateUniqueTableName: vi.fn(() => 'generated_table'),
  registerFiles: registerFilesMock
}));

vi.mock('$lib/features/duckdb/io/reader-utils', () => ({
  addRowId: addRowIdMock,
  restoreNormalizedColumnNames: restoreNormalizedColumnNamesMock
}));

import { readTabular } from '$lib/features/duckdb/io/tabular-reader';

function createContext(): DuckDBContext {
  return {
    db: {
      registerFileText: vi.fn()
    } as unknown as DuckDBContext['db'],
    connection: {} as DuckDBContext['connection'],
    loaded_files: new Map(),
    registered_files: new Set(),
    table_files: new Map(),
    table_metadata: new Map(),
    describeCache: new Map(),
    rowCountCache: new Map(),
    extensionsLoaded: { spatial: true, httpfs: false },
    extensionLoadPromises: { spatial: null, httpfs: null },
    localExtensionRepositoryConfigured: false,
    threadsSupported: false,
    bundleVariant: 'eh'
  };
}

describe('readTabular', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerFilesMock.mockImplementation(
      async (_db, _registeredFiles, files: File[]) => {
        files.forEach((file) => {
          Object.assign(file, { id: `registered:${file.name}'suffix` });
        });
      }
    );
    executeQueryMock.mockImplementation(async (_connection, sql: string) =>
      sql.includes('COUNT(*)') ? [{ cnt: 1 }] : undefined
    );
    addRowIdMock.mockResolvedValue(undefined);
    restoreNormalizedColumnNamesMock.mockResolvedValue(undefined);
  });

  it('escapes table and file identifiers while allowlisting CSV options', async () => {
    const ctx = createContext();
    const file = new File(['a|b\n1|2'], 'quoted.csv', { type: 'text/csv' });

    await readTabular(ctx, file, {
      tablename: 'table"name',
      delimiter: '|',
      decimal_separator: '"',
      thousands_separator: "'"
    });

    const queries = executeQueryMock.mock.calls.map(([, sql]) => String(sql));
    const importQuery = queries.find((sql) => sql.includes('read_csv'));

    expect(importQuery).toContain('CREATE OR REPLACE TABLE "table""name"');
    expect(importQuery).toContain("read_csv('registered:quoted.csv''suffix'");
    expect(importQuery).toContain('decimal_separator="."');
    expect(importQuery).toContain("delim='|'");
    expect(importQuery).not.toContain('thousands=');
    expect(addRowIdMock).toHaveBeenCalledWith(ctx.connection, 'table"name');
  });

  it('drops the registered file handle once a File import succeeds', async () => {
    const ctx = createContext();
    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });

    await readTabular(ctx, file, { tablename: 'data_table' });

    expect(dropRegisteredFileMock).toHaveBeenCalledTimes(1);
    expect(dropRegisteredFileMock).toHaveBeenCalledWith(
      ctx.db,
      ctx.registered_files,
      "registered:data.csv'suffix"
    );
  });

  it('keeps the file handle registered when the import fails', async () => {
    const ctx = createContext();
    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });
    executeQueryMock.mockRejectedValue(new Error('import failed'));

    await expect(
      readTabular(ctx, file, { tablename: 'data_table', delimiter: ',' })
    ).rejects.toThrow();

    expect(dropRegisteredFileMock).not.toHaveBeenCalled();
  });

  it('suppresses rollback logging only for a recoverable CSV import attempt', async () => {
    const ctx = createContext();
    const file = new File(['a,b\n1,mixed'], 'data.csv', { type: 'text/csv' });
    let importAttempts = 0;

    executeQueryMock.mockImplementation(async (_connection, sql: string) => {
      if (sql.includes('read_csv') && importAttempts++ === 0) {
        throw new Error('sniffing failed');
      }
      return sql.includes('COUNT(*)') ? [{ cnt: 1 }] : undefined;
    });

    await readTabular(ctx, file, { tablename: 'data_table' });

    expect(runInTransactionMock).toHaveBeenNthCalledWith(
      1,
      ctx.connection,
      expect.any(Function),
      'read_tabular',
      { logRollback: false }
    );
    expect(runInTransactionMock).toHaveBeenNthCalledWith(
      2,
      ctx.connection,
      expect.any(Function),
      'read_tabular',
      { logRollback: true }
    );
  });

  it('rejects unsupported CSV delimiters before building SQL', async () => {
    const ctx = createContext();
    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });

    await expect(
      readTabular(ctx, file, {
        tablename: 'tbl',
        delimiter: "'"
      })
    ).rejects.toThrow();

    expect(executeQueryMock).not.toHaveBeenCalled();
  });
});
