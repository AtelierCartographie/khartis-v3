import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrimitiveFilterType } from '$lib/features/commons/stores/visualization.types';

const mocks = vi.hoisted(() => ({
  getRowIdsInScope: vi.fn(),
  resolveRowScope: vi.fn()
}));

vi.mock('$lib/features/duckdb', () => ({
  duckDBOrchestrator: {
    getRowIdsInScope: mocks.getRowIdsInScope
  }
}));

vi.mock('$lib/features/commons/services/row-scope.service', () => ({
  resolveRowScope: mocks.resolveRowScope
}));

const { rowScopeStore } = await import('./row-scope.store.svelte');

function target(primitive: PrimitiveFilterType | undefined) {
  return {
    visualizationId: 'viz-1',
    datasetId: 'source-1',
    primitive
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
    mocks.resolveRowScope.mockReset();
    mocks.getRowIdsInScope.mockResolvedValue(new Set([1, 2]));
  });

  it('leaves every row in scope when no filter resolves', async () => {
    mocks.resolveRowScope.mockReturnValue({
      tableName: 'communes',
      clause: null
    });

    await rowScopeStore.sync(EVERY_PRIMITIVE.map(target));

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

    await rowScopeStore.sync(EVERY_PRIMITIVE.map(target));

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

    await rowScopeStore.sync(EVERY_PRIMITIVE.map(target));

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
