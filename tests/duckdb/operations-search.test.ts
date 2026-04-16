import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeQueryMock } = vi.hoisted(() => ({ executeQueryMock: vi.fn() }));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: executeQueryMock
}));
vi.mock('$lib/features/duckdb/cache/cache-manager', () => ({
  registerTableMutationCallback: vi.fn(),
  getTableMetadata: vi.fn(() => ({}))
}));

import { searchInTable } from '$lib/features/duckdb/operations/search';
import type { DuckDBContext } from '$lib/features/duckdb/types';

function ctx(): DuckDBContext {
  return { connection: {} } as unknown as DuckDBContext;
}

describe('searchInTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty result for an empty query string without hitting the database', async () => {
    const result = await searchInTable(ctx(), 'mytable', '');
    expect(result.results).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('returns empty result for a whitespace-only query without hitting the database', async () => {
    const result = await searchInTable(ctx(), 'mytable', '   ');
    expect(result.results).toHaveLength(0);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('exposes isSampled flag as false for empty result', async () => {
    const result = await searchInTable(ctx(), 'mytable', '');
    expect(result.isSampled).toBe(false);
  });
});
