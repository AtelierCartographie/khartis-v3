import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrimitiveFilterType } from '$lib/features/commons/stores/visualization.types';

const mocks = vi.hoisted(() => ({
  getRowIdsInScope: vi.fn(),
  getColumnDomainsInScope: vi.fn(),
  getMissingValueCountsInScope: vi.fn(),
  getDatasetBySourceFile: vi.fn(),
  resolveRowScope: vi.fn()
}));

vi.mock('$lib/features/duckdb', () => ({
  combineFilterClauses: (clauses: (string | null)[]) =>
    clauses.filter(Boolean).join(' AND ') || null,
  duckDBOrchestrator: {
    getRowIdsInScope: mocks.getRowIdsInScope,
    getColumnDomainsInScope: mocks.getColumnDomainsInScope,
    getMissingValueCountsInScope: mocks.getMissingValueCountsInScope,
    getDatasetBySourceFile: mocks.getDatasetBySourceFile
  }
}));

vi.mock('$lib/features/commons/services/row-scope.service', () => ({
  resolveRowScope: mocks.resolveRowScope
}));

const { rowScopeStore } = await import('./row-scope.store.svelte');

function target(
  primitive: PrimitiveFilterType | undefined,
  numericColumns: string[] = []
) {
  return {
    visualizationId: 'viz-1',
    datasetId: 'source-1',
    primitive,
    numericColumns
  };
}

const EVERY_PRIMITIVE = [
  PrimitiveFilterType.POLYGON,
  PrimitiveFilterType.POINT,
  PrimitiveFilterType.TEXT
];

describe('rowScopeStore', () => {
  beforeEach(() => {
    rowScopeStore.clear();
    mocks.getRowIdsInScope.mockReset();
    mocks.getColumnDomainsInScope.mockReset();
    mocks.resolveRowScope.mockReset();
    mocks.getRowIdsInScope.mockResolvedValue(new Set([1, 2]));
    mocks.getColumnDomainsInScope.mockResolvedValue(new Map());
    mocks.getMissingValueCountsInScope.mockReset();
    mocks.getDatasetBySourceFile.mockReset();
  });

  it('counts missing values on the joined rows even without a filter', async () => {
    mocks.resolveRowScope.mockReturnValue({
      tableName: 'communes',
      clause: null
    });
    mocks.getDatasetBySourceFile.mockReturnValue({
      joinedBasemap: 'france-commune',
      columns: [{ name: 'basemap_id' }]
    });
    mocks.getMissingValueCountsInScope.mockResolvedValue([2]);
    const rate = { column: 'rate', numeric: true };

    await rowScopeStore.sync([
      { ...target(PrimitiveFilterType.POLYGON), missingDataColumns: [rate] },
      target(PrimitiveFilterType.POINT)
    ]);

    expect(mocks.getMissingValueCountsInScope).toHaveBeenCalledWith(
      'communes',
      '"basemap_id" IS NOT NULL',
      [rate]
    );
    expect(
      rowScopeStore.hasMissingData('viz-1', PrimitiveFilterType.POLYGON)
    ).toBe(true);
    expect(
      rowScopeStore.hasMissingData('viz-1', PrimitiveFilterType.POINT)
    ).toBe(false);
  });

  it('reports no missing data once the filter keeps only valued rows', async () => {
    mocks.resolveRowScope.mockReturnValue({
      tableName: 'sites',
      clause: '"rate" >= 5'
    });
    mocks.getDatasetBySourceFile.mockReturnValue({
      gpsMode: true,
      columns: []
    });
    mocks.getMissingValueCountsInScope.mockResolvedValue([0]);
    const rate = { column: 'rate', numeric: true };

    await rowScopeStore.sync([
      { ...target(PrimitiveFilterType.POINT), missingDataColumns: [rate] }
    ]);

    expect(mocks.getMissingValueCountsInScope).toHaveBeenCalledWith(
      'sites',
      '("rate" >= 5)',
      [rate]
    );
    expect(
      rowScopeStore.hasMissingData('viz-1', PrimitiveFilterType.POINT)
    ).toBe(false);
  });

  it('leaves every row in scope when no filter resolves', async () => {
    mocks.resolveRowScope.mockReturnValue({
      tableName: 'communes',
      clause: null
    });

    await rowScopeStore.sync(
      EVERY_PRIMITIVE.map((primitive) => target(primitive))
    );

    expect(mocks.getRowIdsInScope).not.toHaveBeenCalled();
    expect(
      rowScopeStore.getScopedRowIds('viz-1', PrimitiveFilterType.POLYGON)
    ).toBeNull();
  });

  it('queries once for the primitives that share a clause', async () => {
    mocks.resolveRowScope.mockReturnValue({
      tableName: 'communes',
      clause: '"pop" >= 1000'
    });

    await rowScopeStore.sync(
      EVERY_PRIMITIVE.map((primitive) => target(primitive))
    );

    expect(mocks.getRowIdsInScope).toHaveBeenCalledTimes(1);
    expect(mocks.getRowIdsInScope).toHaveBeenCalledWith(
      'communes',
      '"pop" >= 1000'
    );
    for (const primitive of EVERY_PRIMITIVE) {
      expect(rowScopeStore.getScopedRowIds('viz-1', primitive)).toEqual(
        new Set([1, 2])
      );
    }
  });

  it('queries per distinct clause when a primitive filters on its own', async () => {
    mocks.resolveRowScope.mockImplementation(
      (request: { primitive?: PrimitiveFilterType }) => ({
        tableName: 'communes',
        clause:
          request.primitive === PrimitiveFilterType.POINT
            ? '"pop" >= 5000'
            : '"pop" >= 1000'
      })
    );

    await rowScopeStore.sync(
      EVERY_PRIMITIVE.map((primitive) => target(primitive))
    );

    expect(mocks.getRowIdsInScope).toHaveBeenCalledTimes(2);
  });

  it('re-queries only when the clause changes', async () => {
    mocks.resolveRowScope.mockReturnValue({
      tableName: 'communes',
      clause: '"pop" >= 1000'
    });
    await rowScopeStore.sync([target(PrimitiveFilterType.POLYGON)]);
    const versionAfterFirst = rowScopeStore.version;

    await rowScopeStore.sync([target(PrimitiveFilterType.POLYGON)]);
    expect(mocks.getRowIdsInScope).toHaveBeenCalledTimes(1);
    expect(rowScopeStore.version).toBe(versionAfterFirst);

    mocks.resolveRowScope.mockReturnValue({
      tableName: 'communes',
      clause: '"pop" >= 2000'
    });
    mocks.getRowIdsInScope.mockResolvedValue(new Set([2]));
    await rowScopeStore.sync([target(PrimitiveFilterType.POLYGON)]);

    expect(mocks.getRowIdsInScope).toHaveBeenCalledTimes(2);
    expect(rowScopeStore.version).toBeGreaterThan(versionAfterFirst);
    expect(
      rowScopeStore.getScopedRowIds('viz-1', PrimitiveFilterType.POLYGON)
    ).toEqual(new Set([2]));
  });

  it('carries the domain of the columns the primitive drives', async () => {
    mocks.resolveRowScope.mockReturnValue({
      tableName: 'communes',
      clause: '"pop" >= 1000'
    });
    mocks.getColumnDomainsInScope.mockResolvedValue(
      new Map([['pop', { min: 1000, max: 9000 }]])
    );

    await rowScopeStore.sync([target(PrimitiveFilterType.POINT, ['pop'])]);

    expect(mocks.getColumnDomainsInScope).toHaveBeenCalledWith(
      'communes',
      '"pop" >= 1000',
      ['pop']
    );
    expect(
      rowScopeStore.getScopedDomain('viz-1', PrimitiveFilterType.POINT, 'pop')
    ).toEqual({ min: 1000, max: 9000 });
    expect(
      rowScopeStore.getScopedDomain('viz-1', PrimitiveFilterType.POINT, 'other')
    ).toBeNull();
  });

  it('re-queries when the same clause starts driving another column', async () => {
    mocks.resolveRowScope.mockReturnValue({
      tableName: 'communes',
      clause: '"pop" >= 1000'
    });
    await rowScopeStore.sync([target(PrimitiveFilterType.POINT, ['pop'])]);

    await rowScopeStore.sync([target(PrimitiveFilterType.POINT, ['density'])]);

    expect(mocks.getColumnDomainsInScope).toHaveBeenLastCalledWith(
      'communes',
      '"pop" >= 1000',
      ['density']
    );
  });

  it('drops the scope of a visualization that is gone', async () => {
    mocks.resolveRowScope.mockReturnValue({
      tableName: 'communes',
      clause: '"pop" >= 1000'
    });
    await rowScopeStore.sync([target(PrimitiveFilterType.POLYGON)]);

    await rowScopeStore.sync([]);

    expect(
      rowScopeStore.getScopedRowIds('viz-1', PrimitiveFilterType.POLYGON)
    ).toBeNull();
  });

  it('keeps the last scope when the query fails instead of showing filtered rows', async () => {
    mocks.resolveRowScope.mockReturnValue({
      tableName: 'communes',
      clause: '"pop" >= 1000'
    });
    await rowScopeStore.sync([target(PrimitiveFilterType.POLYGON)]);

    mocks.resolveRowScope.mockReturnValue({
      tableName: 'communes',
      clause: '"pop" >= 2000'
    });
    mocks.getRowIdsInScope.mockRejectedValue(new Error('duckdb is away'));
    await rowScopeStore.sync([target(PrimitiveFilterType.POLYGON)]);

    expect(
      rowScopeStore.getScopedRowIds('viz-1', PrimitiveFilterType.POLYGON)
    ).toEqual(new Set([1, 2]));
  });
});
