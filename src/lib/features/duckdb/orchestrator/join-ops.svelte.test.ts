import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/pipeline.errors';
import type { DuckDBDataset } from '$lib/features/duckdb/types';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type { DuckDBClientForJoin } from './join-ops';

const mocks = vi.hoisted(() => ({
  ensureAttributesLoaded: vi.fn(),
  getLocale: vi.fn(() => 'fr')
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    ensureAttributesLoaded: mocks.ensureAttributesLoaded
  }
}));

vi.mock('$lib/paraglide/runtime', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('$lib/paraglide/runtime')>();
  return {
    ...actual,
    getLocale: mocks.getLocale
  };
});

const {
  applyJoinCorrections,
  computeJoinSynthesis,
  finalizeJoin,
  getJoinedArrowTable,
  getBasemapAttributeValues,
  getBasemapAttributeAliasesByValue,
  invalidateSimilarityCache
} = await import('./join-ops');

function createBasemap(): BasemapMetadata {
  return {
    file: 'monde-countries-2024-medium',
    title_fr: 'Monde',
    title_en: 'World',
    source: 'test',
    date: '2024',
    display_id_fr: 'name_fren',
    display_id_en: 'name_engl',
    bbox: [-180, -90, 180, 90],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'simple' },
    layers: [
      {
        type: BasemapLayerType.POLYGON
      }
    ]
  };
}

function createDuck() {
  const queries: string[] = [];
  return {
    queries,
    duck: {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("table_name = 'basemap_attributes'")) {
          return [{ table_name: 'basemap_attributes' }];
        }
        if (sql.includes('COUNT(*) as cnt')) {
          return [{ cnt: 1 }];
        }
        if (sql.includes('ROW_NUMBER() OVER')) {
          return [{ raw: 'Brésil' }, { raw: 'France' }];
        }
        return [];
      })
    } satisfies DuckDBClientForJoin
  };
}

function createDataset(tableName: string): DuckDBDataset {
  return {
    id: 'dataset',
    tableName,
    sourceFileId: 'source',
    name: 'Dataset',
    columns: [],
    rowCount: 0,
    metadata: { processedAt: new Date(), fileType: 'csv' as never }
  };
}

describe('join-ops basemap attribute values', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocale.mockReturnValue('fr');
  });

  it('returns one display value per basemap entity using the localized display variant first', async () => {
    const { duck, queries } = createDuck();

    const values = await getBasemapAttributeValues(createBasemap(), duck);

    expect(values).toEqual(['Brésil', 'France']);
    const valueQuery = queries.find((query) =>
      query.includes('PARTITION BY entity_id')
    );
    expect(valueQuery).toContain("variant = 'name_fren'");
    expect(valueQuery).toContain('COALESCE(id, raw) AS entity_id');
  });
});

describe('join-ops error typing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws a DuckDBError when basemap attributes cannot be loaded', async () => {
    const duck = {
      query: vi.fn(async () => [])
    } satisfies DuckDBClientForJoin;

    const request = getBasemapAttributeValues(createBasemap(), duck);

    await expect(request).rejects.toMatchObject({
      name: 'DuckDBError',
      code: 'DUCKDB_ERROR',
      details: {
        tableName: 'basemap_attributes'
      }
    });
    await expect(request).rejects.toBeInstanceOf(DuckDBError);
  });

  it('throws a DataValidationError when the requested join column is absent', async () => {
    const { duck } = createDuck();

    const request = finalizeJoin(
      createDataset('user_data'),
      createBasemap(),
      'region',
      duck
    );

    await expect(request).rejects.toMatchObject({
      name: 'DataValidationError',
      code: 'DATA_VALIDATION_ERROR',
      field: 'region',
      details: {
        datasetId: 'dataset',
        field: 'region',
        tableName: 'user_data'
      }
    });
    await expect(request).rejects.toBeInstanceOf(DataValidationError);
  });

  it('throws a DataValidationError when joined geometry is unavailable', async () => {
    const duck = {
      query: vi.fn(async () => [{ column_name: 'id', data_type: 'VARCHAR' }])
    } satisfies DuckDBClientForJoin;

    await expect(
      getJoinedArrowTable(
        'user_data',
        'basemap-id',
        duck,
        async () => 'geometry_table',
        vi.fn()
      )
    ).rejects.toMatchObject({
      name: 'DataValidationError',
      code: 'DATA_VALIDATION_ERROR',
      field: 'geometry',
      details: {
        field: 'geometry',
        geometryTable: 'geometry_table'
      }
    });
  });
});

describe('join-ops basemap aliases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups aliases by the provided basemap entity id', async () => {
    const queries: string[] = [];
    const duck = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("table_name = 'basemap_attributes'")) {
          return [{ table_name: 'basemap_attributes' }];
        }
        if (sql.includes('COUNT(*) as cnt')) {
          return [{ cnt: 1 }];
        }
        if (sql.includes('entity_id')) {
          return [
            {
              raw: 'BRA',
              variant: 'iso3_code',
              entity_id: 'BRA',
              rn: 1
            },
            {
              raw: 'Brésil',
              variant: 'name_fren',
              entity_id: 'BRA',
              rn: 2
            },
            {
              raw: 'Brazil',
              variant: 'name_engl',
              entity_id: 'BRA',
              rn: 3
            }
          ];
        }
        return [];
      })
    } satisfies DuckDBClientForJoin;

    const aliases = await getBasemapAttributeAliasesByValue(
      createBasemap(),
      duck
    );

    expect(aliases.BRA).toEqual([
      { value: 'Brésil', variant: 'name_fren' },
      { value: 'Brazil', variant: 'name_engl' }
    ]);
    expect(aliases['Brésil']).toEqual([
      { value: 'BRA', variant: 'iso3_code' },
      { value: 'Brazil', variant: 'name_engl' }
    ]);
    expect(queries.join('\n')).not.toContain('SUM(CASE WHEN variant');
  });
});

function createSimilarityDuck() {
  const existingCacheTables = new Set<string>();
  const creates: string[] = [];
  const drops: string[] = [];
  const duck = {
    query: vi.fn(async (sql: string) => {
      const createMatch = sql.match(
        /CREATE OR REPLACE TEMP TABLE "(__similarity_cache__[^"]+)"/
      );
      if (createMatch) {
        existingCacheTables.add(createMatch[1]);
        creates.push(createMatch[1]);
        return [];
      }
      const dropMatch = sql.match(
        /DROP TABLE IF EXISTS "(__similarity_cache__[^"]+)"/
      );
      if (dropMatch) {
        existingCacheTables.delete(dropMatch[1]);
        drops.push(dropMatch[1]);
        return [];
      }
      if (sql.includes("table_name = 'basemap_attributes'")) {
        return [{ table_name: 'basemap_attributes' }];
      }
      const existsMatch = sql.match(
        /WHERE table_name = '(__similarity_cache__[^']+)'/
      );
      if (existsMatch) {
        return existingCacheTables.has(existsMatch[1])
          ? [{ table_name: existsMatch[1] }]
          : [];
      }
      return [];
    })
  } satisfies DuckDBClientForJoin;
  return { duck, creates, drops };
}

describe('join-ops similarity cache keying and eviction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSimilarityCache();
  });

  it('reuses the cached entry for the same dataset and geo column', async () => {
    const { duck, creates } = createSimilarityDuck();
    const dataset = createDataset('table_a');

    await computeJoinSynthesis(dataset, 'geo', duck);
    await computeJoinSynthesis(dataset, 'geo', duck);

    expect(creates).toHaveLength(1);
  });

  it('keeps one entry per geo column of the same dataset', async () => {
    const { duck, creates, drops } = createSimilarityDuck();
    const dataset = createDataset('table_a');

    await computeJoinSynthesis(dataset, 'city', duck);
    await computeJoinSynthesis(dataset, 'region', duck);
    await computeJoinSynthesis(dataset, 'city', duck);
    await computeJoinSynthesis(dataset, 'region', duck);

    expect(creates).toHaveLength(2);
    expect(new Set(creates).size).toBe(2);
    expect(drops).toHaveLength(0);
  });

  it('evicts the least recently used entry beyond four and drops its table', async () => {
    const { duck, creates, drops } = createSimilarityDuck();

    for (const table of ['t1', 't2', 't3', 't4']) {
      await computeJoinSynthesis(createDataset(table), 'geo', duck);
    }
    await computeJoinSynthesis(createDataset('t1'), 'geo', duck);
    expect(drops).toHaveLength(0);

    await computeJoinSynthesis(createDataset('t5'), 'geo', duck);

    expect(drops).toEqual([creates[1]]);

    await computeJoinSynthesis(createDataset('t2'), 'geo', duck);
    expect(creates).toHaveLength(6);
  });

  it('drops only the invalidated dataset entries', async () => {
    const { duck, creates, drops } = createSimilarityDuck();

    await computeJoinSynthesis(createDataset('table_a'), 'geo', duck);
    await computeJoinSynthesis(createDataset('table_b'), 'geo', duck);

    invalidateSimilarityCache('table_a', duck);

    expect(drops).toEqual([creates[0]]);

    await computeJoinSynthesis(createDataset('table_b'), 'geo', duck);
    expect(creates).toHaveLength(2);

    await computeJoinSynthesis(createDataset('table_a'), 'geo', duck);
    expect(creates).toHaveLength(3);
  });
});

describe('join-ops correction cleanup', () => {
  it('drops the temporary correction table when the update fails', async () => {
    const queries: string[] = [];
    const updateError = new Error('update failed');
    const duck = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('UPDATE "user_data"')) {
          throw updateError;
        }
        return [];
      })
    } satisfies DuckDBClientForJoin;

    await expect(
      applyJoinCorrections(
        createDataset('user_data'),
        'geo',
        { France: 'FR' },
        duck
      )
    ).rejects.toThrow(updateError);

    expect(queries.at(-1)).toMatch(
      /^DROP TABLE IF EXISTS "corrections_[a-f0-9_]+"/
    );
  });
});
