import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeQueryMock } = vi.hoisted(() => ({ executeQueryMock: vi.fn() }));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: executeQueryMock
}));
vi.mock('$lib/features/duckdb/cache/cache-manager', () => ({
  getTableMetadata: vi.fn(() => ({})),
  markTableMutated: vi.fn()
}));

import {
  joinById,
  applyJoinAssociation
} from '$lib/features/duckdb/operations/join';
import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/errors/pipeline.errors';
import type { DuckDBContext } from '$lib/features/duckdb/types';

function ctx(): DuckDBContext {
  return { connection: {} } as unknown as DuckDBContext;
}

describe('joinById validation guards', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws DataValidationError when neither basemap_table nor basemaps_table is provided', async () => {
    await expect(joinById(ctx(), 'tbl', 'id', {})).rejects.toBeInstanceOf(
      DataValidationError
    );
  });

  it('throws DataValidationError when basemap_table is provided without basemap_id', async () => {
    await expect(
      joinById(ctx(), 'tbl', 'id', { basemap_table: 'bm' })
    ).rejects.toBeInstanceOf(DataValidationError);
  });
});

describe('applyJoinAssociation validation guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws DuckDBError when no join association exists in table metadata', async () => {
    const { getTableMetadata } =
      await import('$lib/features/duckdb/cache/cache-manager');
    vi.mocked(getTableMetadata).mockReturnValue({} as never);
    await expect(
      applyJoinAssociation(ctx(), 'tbl', 'basemap')
    ).rejects.toBeInstanceOf(DuckDBError);
  });
});
