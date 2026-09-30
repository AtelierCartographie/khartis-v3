import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDatasetBySourceFile: vi.fn(),
  getFilters: vi.fn()
}));

vi.mock('$lib/features/duckdb', () => ({
  buildFilterClause: () => null,
  buildFilterWhereClause: (filters: string[] | undefined) =>
    filters?.join(' AND ') || null,
  combineFilterClauses: (clauses: (string | null)[]) =>
    clauses.filter(Boolean).join(' AND ') || null,
  duckDBOrchestrator: {
    getDatasetBySourceFile: mocks.getDatasetBySourceFile,
    getFilters: mocks.getFilters
  }
}));

const { resolveRowScope } = await import('./row-scope.service');

const JOINED_DATASET = {
  tableName: 'abstention',
  joinedBasemap: 'france-departement-2025-high',
  hasJoinKey: true,
  columns: [{ name: 'code_dept', type_simple: 'string' }]
};

describe('resolveRowScope', () => {
  beforeEach(() => {
    mocks.getDatasetBySourceFile.mockReset();
    mocks.getFilters.mockReset();
    mocks.getFilters.mockReturnValue(undefined);
  });

  it('restricts the values of a joined dataset to its joined rows', () => {
    mocks.getDatasetBySourceFile.mockReturnValue(JOINED_DATASET);

    expect(resolveRowScope({ datasetId: 'source-1' })).toEqual({
      tableName: 'abstention',
      clause: null,
      valueClause: '"basemap_id" IS NOT NULL'
    });
  });

  it('keeps the filters in both clauses of a joined dataset', () => {
    mocks.getDatasetBySourceFile.mockReturnValue(JOINED_DATASET);
    mocks.getFilters.mockReturnValue(['"rate" >= 5']);

    expect(resolveRowScope({ datasetId: 'source-1' })).toEqual({
      tableName: 'abstention',
      clause: '"rate" >= 5',
      valueClause: '("rate" >= 5) AND "basemap_id" IS NOT NULL'
    });
  });

  it('leaves every row in the value scope while a restored join has no key yet', () => {
    mocks.getDatasetBySourceFile.mockReturnValue({
      ...JOINED_DATASET,
      hasJoinKey: undefined
    });

    expect(resolveRowScope({ datasetId: 'source-1' })?.valueClause).toBeNull();
  });
});
