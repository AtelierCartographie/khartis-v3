import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuckDBContext } from '$lib/features/duckdb/types';

const { executeQueryMock, addRowIdMock } = vi.hoisted(() => ({
  executeQueryMock: vi.fn(),
  addRowIdMock: vi.fn()
}));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: executeQueryMock
}));

vi.mock('$lib/features/duckdb/io/reader-utils', () => ({
  addRowId: addRowIdMock
}));

vi.mock('$lib/features/duckdb/cache/cache-manager', () => ({
  markTableMutated: vi.fn(),
  registerTableMutationCallback: vi.fn()
}));

import { readJsonTabular } from '$lib/features/duckdb/io/json-reader';

function createContext(): DuckDBContext {
  return {
    db: {} as DuckDBContext['db'],
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

function fileWithId(name: string, id: string): File {
  const file = new File(['[{"a":1}]'], name, { type: 'application/json' });
  Object.defineProperty(file, 'id', { value: id });
  return file;
}

describe('readJsonTabular', () => {
  beforeEach(() => {
    executeQueryMock.mockReset().mockResolvedValue(new Uint8Array());
    addRowIdMock.mockReset();
  });

  it('should load the json extension and create the table from read_json_auto when given a registered file', async () => {
    const ctx = createContext();
    const file = fileWithId('records.json', 'records-file-id');

    const tablename = await readJsonTabular(ctx, file, {
      tablename: 'json_table'
    });

    expect(tablename).toBe('json_table');
    const statements = executeQueryMock.mock.calls.map((call) => call[1]);
    expect(statements[0]).toContain('INSTALL json; LOAD json;');
    expect(statements[1]).toContain(
      `CREATE OR REPLACE TABLE "json_table" AS FROM read_json_auto('records-file-id');`
    );
    expect(ctx.loaded_files.get('json_table')).toBe('records.json');
    expect(addRowIdMock).toHaveBeenCalledWith(ctx.connection, 'json_table');
    expect(ctx.table_files.get('json_table')).toBe('records-file-id');
  });

  it('should keep the DuckDB error when the tabular read fails and not map the handle', async () => {
    const ctx = createContext();
    const file = fileWithId('records.json', 'records-file-id');
    executeQueryMock
      .mockResolvedValueOnce(new Uint8Array())
      .mockRejectedValueOnce(new Error('Malformed JSON'));

    await expect(
      readJsonTabular(ctx, file, { tablename: 'json_table' })
    ).rejects.toThrow('Malformed JSON');
    expect(ctx.table_files.size).toBe(0);
  });
});
