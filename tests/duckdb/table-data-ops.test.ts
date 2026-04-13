import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildFilterWhereClauseMock, getFiltersMapMock } = vi.hoisted(() => ({
  buildFilterWhereClauseMock: vi.fn(),
  getFiltersMapMock: vi.fn()
}));

vi.mock('$lib/features/duckdb/orchestrator/filter-ops', () => ({
  buildFilterWhereClause: buildFilterWhereClauseMock
}));

vi.mock('$lib/features/duckdb/orchestrator/state.svelte', () => ({
  getFiltersMap: getFiltersMapMock
}));

import {
  getExcludedRowIds,
  getTableData
} from '$lib/features/duckdb/orchestrator/table-data-ops';

describe('table-data-ops', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildFilterWhereClauseMock.mockReturnValue(null);
    getFiltersMapMock.mockReturnValue(new Map());
  });

  it('uses describe_table to exclude geometry columns without full analysis', async () => {
    const queryResult = {
      numRows: 1,
      get: vi.fn().mockReturnValue({ __id: 1, name: 'France' }),
      toArray: vi.fn()
    };
    const duck = {
      query: vi.fn().mockResolvedValue(queryResult),
      describe_table: vi.fn().mockResolvedValue({
        name: ['__id', 'name', 'geom'],
        type: ['INTEGER', 'VARCHAR', "GEOMETRY('EPSG:4326')"]
      }),
      describeColumns: vi.fn(),
      analyse: vi.fn()
    };

    await getTableData('world_data', duck as never, { limit: 25 });

    expect(duck.describe_table).toHaveBeenCalledWith('world_data');
    expect(duck.describeColumns).not.toHaveBeenCalled();
    expect(duck.query).toHaveBeenCalledWith(
      'SELECT * EXCLUDE ("geom") FROM "world_data" LIMIT 25'
    );
  });

  it('collects excluded row ids without converting the full result to an array', async () => {
    buildFilterWhereClauseMock.mockReturnValue('"value" IS NULL');

    const queryResult = {
      numRows: 2,
      get: vi
        .fn()
        .mockReturnValueOnce({ __id: 1 })
        .mockReturnValueOnce({ __id: '2' }),
      toArray: vi.fn()
    };
    const duck = {
      query: vi.fn().mockResolvedValue(queryResult),
      describe_table: vi.fn(),
      describeColumns: vi.fn(),
      analyse: vi.fn()
    };

    await expect(
      getExcludedRowIds('world_data', duck as never)
    ).resolves.toEqual([1, 2]);
    expect(queryResult.toArray).not.toHaveBeenCalled();
  });
});
