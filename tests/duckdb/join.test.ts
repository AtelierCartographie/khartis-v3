import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/errors/pipeline.errors';
import type { DuckDBContext } from '$lib/features/duckdb/types';

const { executeQueryMock } = vi.hoisted(() => ({
  executeQueryMock: vi.fn()
}));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: executeQueryMock
}));

import {
  applyJoinAssociation,
  joinById
} from '$lib/features/duckdb/operations/join';

function createBaseContext(): DuckDBContext {
  return {
    db: {} as DuckDBContext['db'],
    connection: {} as DuckDBContext['connection'],
    loaded_files: new Map(),
    registered_files: new Set(),
    table_metadata: new Map(),
    describeCache: new Map(),
    rowCountCache: new Map(),
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

describe('joinById', () => {
  beforeEach(() => {
    executeQueryMock.mockReset();
  });

  it('lève DataValidationError quand aucune source basemap nest fournie', async () => {
    const ctx = createBaseContext();

    await expect(
      joinById(ctx, 'dataset_table', 'country')
    ).rejects.toBeInstanceOf(DataValidationError);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('lève DataValidationError quand basemap_table est fourni sans basemap_id', async () => {
    const ctx = createBaseContext();

    await expect(
      joinById(ctx, 'dataset_table', 'country', {
        basemap_table: 'world_basemap'
      })
    ).rejects.toBeInstanceOf(DataValidationError);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('construit les métadonnées de jointure et exécute les trois requêtes SQL pour un basemap spécifique', async () => {
    executeQueryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        {
          basemap: 'world',
          share_basemap: 0.7,
          share_candidate: 0.9
        }
      ]);
    const ctx = createBaseContext();

    const result = await joinById(ctx, 'dataset_table', 'country', {
      basemap_table: 'world_basemap',
      basemap_id: 'iso_a3'
    });

    expect(executeQueryMock).toHaveBeenCalledTimes(3);
    expect(executeQueryMock.mock.calls[0][1]).toContain(
      "get_join_table_from_basemap('world_basemap', 'iso_a3')"
    );
    expect(executeQueryMock.mock.calls[1][1]).toContain(
      'CREATE OR REPLACE TABLE "dataset_table_join_results"'
    );
    expect(executeQueryMock.mock.calls[2][1]).toContain(
      "FROM join_synthesis('dataset_table_join_results')"
    );
    expect(result).toEqual([
      {
        basemap: 'world',
        share_basemap: 0.7,
        share_candidate: 0.9
      }
    ]);
    expect(ctx.table_metadata.get('dataset_table')?.join).toEqual({
      id: 'country',
      join_results_name: 'dataset_table_join_results',
      basemap_join_ref: 'world_basemap_join_ref'
    });
  });

  it('utilise la table unifiée des attributs basemap quand des attributs personnalisés existent', async () => {
    executeQueryMock
      .mockResolvedValueOnce([{ cnt: 1 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        {
          basemap: 'world',
          share_basemap: 0.5,
          share_candidate: 0.5
        }
      ]);
    const ctx = createBaseContext();

    await joinById(ctx, 'dataset_table', 'country', {
      basemaps_table: 'basemap_attributes'
    });

    expect(executeQueryMock).toHaveBeenCalledTimes(5);
    expect(executeQueryMock.mock.calls[2][1]).toContain(
      'CREATE OR REPLACE TABLE "unified_basemap_attributes"'
    );
    expect(executeQueryMock.mock.calls[3][1]).toContain(
      "get_similarity(geoname, 'unified_basemap_attributes')"
    );
    expect(ctx.table_metadata.get('dataset_table')?.join).toEqual({
      id: 'country',
      join_results_name: 'dataset_table_join_results',
      basemap_join_ref: null
    });
  });
});

describe('applyJoinAssociation', () => {
  beforeEach(() => {
    executeQueryMock.mockReset();
  });

  it('lève DuckDBError quand aucune métadonnée de jointure nexiste pour la table', async () => {
    const ctx = createBaseContext();

    await expect(
      applyJoinAssociation(ctx, 'dataset_table', 'world-basemap')
    ).rejects.toBeInstanceOf(DuckDBError);
    expect(executeQueryMock).not.toHaveBeenCalled();
  });

  it('invalide les entrées de cache après application de la jointure', async () => {
    executeQueryMock.mockResolvedValueOnce([]).mockResolvedValueOnce(undefined);
    const ctx = createContextWithJoinMetadata();

    ctx.describeCache.set('dataset_table', {} as never);
    ctx.rowCountCache.set('dataset_table', 42);

    await applyJoinAssociation(ctx, 'dataset_table', 'world-basemap');

    expect(executeQueryMock).toHaveBeenCalledTimes(2);
    expect(ctx.describeCache.has('dataset_table')).toBe(false);
    expect(ctx.rowCountCache.has('dataset_table')).toBe(false);
  });
});
