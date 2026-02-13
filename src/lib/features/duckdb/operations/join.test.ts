import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/errors/pipeline.errors';
import type { DuckDBContext } from '../types';

const { executeQueryMock } = vi.hoisted(() => ({
  executeQueryMock: vi.fn()
}));

vi.mock('../core/query', () => ({
  executeQuery: executeQueryMock
}));

import { applyJoinAssociation, joinById } from './join';

function createBaseContext(): DuckDBContext {
  return {
    db: {} as DuckDBContext['db'],
    connection: {} as DuckDBContext['connection'],
    loaded_files: new Map(),
    registered_files: new Set(),
    table_metadata: new Map(),
    table_geoparquet_cache: new Map(),
    describeCache: new Map(),
    rowCountCache: new Map(),
    cacheState: {
      size: 0,
      accessOrder: []
    },
    extensionsLoaded: {
      spatial: true,
      httpfs: true
    },
    extensionLoadPromises: {
      spatial: null,
      httpfs: null
    },
    localExtensionRepositoryConfigured: true,
    threadsSupported: true,
    bundleVariant: 'eh'
  };
}

function createContextWithJoinMetadata(): DuckDBContext {
  const ctx = createBaseContext();
  ctx.table_metadata.set('dataset_table', {
    analysis: null,
    join: {
      id: 'country',
      join_results_name: 'dataset_table_join_results',
      basemap_join_ref: null
    },
    filters: new Map()
  });
  return ctx;
}

describe('join operation guard rails', () => {
  beforeEach(() => {
    executeQueryMock.mockReset();
  });

  it('rejects joinById calls without a basemap source', async () => {
    const ctx = createBaseContext();

    await expect(
      joinById(ctx, 'dataset_table', 'country')
    ).rejects.toBeInstanceOf(DataValidationError);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('requires basemap_id when a specific basemap table is used', async () => {
    const ctx = createBaseContext();

    await expect(
      joinById(ctx, 'dataset_table', 'country', {
        basemap_table: 'world_basemap'
      })
    ).rejects.toBeInstanceOf(DataValidationError);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('fails fast when join metadata is missing for applyJoinAssociation', async () => {
    const ctx = createBaseContext();

    await expect(
      applyJoinAssociation(ctx, 'dataset_table', 'world-basemap')
    ).rejects.toBeInstanceOf(DuckDBError);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('invalidates cached table data after applying a join association', async () => {
    executeQueryMock.mockResolvedValueOnce([]).mockResolvedValueOnce(undefined);
    const ctx = createContextWithJoinMetadata();

    const cachedGeoParquet = new Uint8Array([1, 2, 3, 4]);
    ctx.describeCache.set('dataset_table', {} as never);
    ctx.rowCountCache.set('dataset_table', 42);
    ctx.table_geoparquet_cache.set('dataset_table', cachedGeoParquet);
    ctx.cacheState.size = cachedGeoParquet.byteLength;
    ctx.cacheState.accessOrder = ['dataset_table'];

    await applyJoinAssociation(ctx, 'dataset_table', 'world-basemap');

    expect(executeQueryMock).toHaveBeenCalledTimes(2);
    expect(ctx.describeCache.has('dataset_table')).toBe(false);
    expect(ctx.rowCountCache.has('dataset_table')).toBe(false);
    expect(ctx.table_geoparquet_cache.has('dataset_table')).toBe(false);
    expect(ctx.cacheState.size).toBe(0);
    expect(ctx.cacheState.accessOrder).toEqual([]);
  });
});
