import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeQueryMock } = vi.hoisted(() => ({ executeQueryMock: vi.fn() }));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: executeQueryMock
}));
vi.mock('$lib/features/duckdb/cache/cache-manager', () => ({
  getDescribe: vi.fn(),
  setDescribe: vi.fn(),
  getRowCountFromCache: vi.fn(),
  setRowCountCache: vi.fn(),
  markTableMutated: vi.fn()
}));

import {
  describeTable,
  getRowCount,
  dropRows
} from '$lib/features/duckdb/operations/table-ops';
import type { DuckDBContext } from '$lib/features/duckdb/types';

function ctx(): DuckDBContext {
  return { connection: {} } as unknown as DuckDBContext;
}

describe('describeTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns cached describe result without calling executeQuery', async () => {
    const { getDescribe } =
      await import('$lib/features/duckdb/cache/cache-manager');
    vi.mocked(getDescribe).mockReturnValue({
      name: ['id', 'label'],
      type: ['INTEGER', 'VARCHAR']
    });
    const result = await describeTable(ctx(), 'tbl');
    expect(result.name).toEqual(['id', 'label']);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('calls executeQuery on cache miss and stores result in cache', async () => {
    const { getDescribe, setDescribe } =
      await import('$lib/features/duckdb/cache/cache-manager');
    vi.mocked(getDescribe).mockReturnValue(undefined);
    executeQueryMock.mockResolvedValue([
      { column_name: 'id', column_type: 'INTEGER' },
      { column_name: 'name', column_type: 'VARCHAR' }
    ]);
    const result = await describeTable(ctx(), 'tbl');
    expect(executeQueryMock).toHaveBeenCalledOnce();
    expect(result.name).toEqual(['id', 'name']);
    expect(vi.mocked(setDescribe)).toHaveBeenCalledOnce();
  });
});

describe('getRowCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns cached row count without querying', async () => {
    const { getRowCountFromCache } =
      await import('$lib/features/duckdb/cache/cache-manager');
    vi.mocked(getRowCountFromCache).mockReturnValue(42);
    const count = await getRowCount(ctx(), 'tbl');
    expect(count).toBe(42);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('queries and caches row count on cache miss', async () => {
    const { getRowCountFromCache, setRowCountCache } =
      await import('$lib/features/duckdb/cache/cache-manager');
    vi.mocked(getRowCountFromCache).mockReturnValue(undefined);
    executeQueryMock.mockResolvedValue([{ num_rows: 7 }]);
    const count = await getRowCount(ctx(), 'tbl');
    expect(count).toBe(7);
    expect(vi.mocked(setRowCountCache)).toHaveBeenCalledWith(
      expect.anything(),
      'tbl',
      7
    );
  });
});

describe('dropRows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns immediately without querying when ids array is empty', async () => {
    await dropRows(ctx(), 'tbl', []);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('calls executeQuery and marks table mutated when ids are provided', async () => {
    const { markTableMutated } =
      await import('$lib/features/duckdb/cache/cache-manager');
    executeQueryMock.mockResolvedValue(undefined);
    await dropRows(ctx(), 'tbl', [1, 2, 3]);
    expect(executeQueryMock).toHaveBeenCalledOnce();
    expect(vi.mocked(markTableMutated)).toHaveBeenCalledWith(
      expect.anything(),
      'tbl'
    );
  });

  it('filters out non-integer ids silently', async () => {
    executeQueryMock.mockResolvedValue(undefined);
    await dropRows(ctx(), 'tbl', [1.5, 2, 3.9] as never);
    const sql = executeQueryMock.mock.calls[0][1] as string;
    expect(sql).toContain('2');
    expect(sql).not.toContain('1.5');
  });
});
