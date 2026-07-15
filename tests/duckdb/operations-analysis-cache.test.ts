import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeQueryMock } = vi.hoisted(() => ({ executeQueryMock: vi.fn() }));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: executeQueryMock
}));

import { analyse } from '$lib/features/duckdb/operations/analysis';
import { markTableMutated } from '$lib/features/duckdb/cache/cache-manager';
import type { DuckDBContext } from '$lib/features/duckdb/types';

function makeCtx(): DuckDBContext {
  return {
    connection: {},
    describeCache: new Map(),
    rowCountCache: new Map(),
    table_metadata: new Map()
  } as unknown as DuckDBContext;
}

function mockAnalysisQueries(uniques: number): void {
  executeQueryMock.mockImplementation(async (_conn, sql: string) => {
    if (sql.includes('describe_full')) {
      return [{ name: 'value', type: 'VARCHAR', type_simple: 'string' }];
    }
    if (sql.includes('num_rows')) {
      return [{ num_rows: 3 }];
    }
    if (sql.includes('summary_general')) {
      return { get: () => ({ count: 3, nulls: 0, uniques }) };
    }
    if (sql.includes('histogram_categorical')) {
      return [];
    }
    return undefined;
  });
}

describe('analyse cache invalidation on table mutation', () => {
  beforeEach(() => {
    executeQueryMock.mockReset();
  });

  it('should return fresh stats without force when the table was mutated', async () => {
    const ctx = makeCtx();
    mockAnalysisQueries(2);

    const first = await analyse(ctx, 'tbl');
    expect(first[0].uniques).toBe(2);

    executeQueryMock.mockClear();
    const cached = await analyse(ctx, 'tbl');
    expect(cached[0].uniques).toBe(2);
    expect(executeQueryMock).not.toHaveBeenCalled();

    mockAnalysisQueries(3);
    markTableMutated(ctx, 'tbl');

    const fresh = await analyse(ctx, 'tbl');
    expect(fresh[0].uniques).toBe(3);
    expect(executeQueryMock).toHaveBeenCalled();
  });

  it('should keep the cached analysis when another table is mutated', async () => {
    const ctx = makeCtx();
    mockAnalysisQueries(2);

    await analyse(ctx, 'tbl');

    markTableMutated(ctx, 'other_tbl');

    executeQueryMock.mockClear();
    const cached = await analyse(ctx, 'tbl');
    expect(cached[0].uniques).toBe(2);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });
});
