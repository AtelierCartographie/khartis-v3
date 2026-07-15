import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import { FileType, type DuckDBDataset } from '../types';

const mocks = vi.hoisted(() => ({
  analyse: vi.fn(),
  describeTable: vi.fn(),
  initDuckDB: vi.fn(),
  invalidateTableCache: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  query: vi.fn(),
  registerPersistence: vi.fn()
}));

vi.mock('../duck', () => ({
  Duck: {
    analyse: mocks.analyse,
    describe_table: mocks.describeTable,
    invalidateTableCache: mocks.invalidateTableCache,
    query: mocks.query
  },
  initDuckDB: mocks.initDuckDB
}));

vi.mock('$lib/features/commons/utils/logger', async () => {
  const actual = await vi.importActual<
    typeof import('$lib/features/commons/utils/logger')
  >('$lib/features/commons/utils/logger');

  return {
    ...actual,
    logger: {
      ...actual.logger,
      error: mocks.loggerError,
      warn: mocks.loggerWarn
    }
  };
});

vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showError: vi.fn()
}));

vi.mock('$lib/features/data-pipeline', () => ({
  extractGeoArrowMetadata: vi.fn()
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    currentMetadata: null
  }
}));

vi.mock('$lib/features/project-management/core', () => ({
  SavePriority: {
    DEBOUNCED: 'debounced',
    IMMEDIATE: 'immediate'
  },
  persistenceRegistry: {
    register: mocks.registerPersistence
  }
}));

const { LogCategory } = await import('$lib/features/commons/utils/logger');
const { duckDBOrchestrator } = await import('./orchestrator.svelte');
const { invalidateSimilarityCache } = await import('./join-ops');
const state = await import('./state.svelte');

function createDataset(): DuckDBDataset {
  return {
    id: 'dataset-1',
    tableName: 'geometries',
    sourceFileId: 'source-1',
    name: 'geometries.geojson',
    columns: [],
    rowCount: 1,
    metadata: {
      processedAt: new Date('2026-07-02T00:00:00Z'),
      fileType: FileType.GEOJSON
    }
  };
}

describe('duckDBOrchestrator similarity cache lifecycle', () => {
  const basemap: BasemapMetadata = {
    file: 'monde-countries-2024-medium',
    title_fr: 'Monde',
    title_en: 'World',
    source: 'test',
    date: '2024',
    bbox: [-180, -90, 180, 90],
    proj_source: 'EPSG:4326',
    proj_to: { type: 'simple' },
    layers: []
  };

  beforeEach(() => {
    state.clearState();
    state.setInitialized(true);
    const dataset = createDataset();
    dataset.columns = [{ name: 'geo', type_simple: 'string' as never }];
    state.getState().datasets.set('dataset-1', dataset);
    vi.clearAllMocks();
    invalidateSimilarityCache();

    const existingCacheTables = new Set<string>();
    mocks.analyse.mockResolvedValue([]);
    mocks.query.mockImplementation(async (sql: string) => {
      const createMatch = sql.match(
        /CREATE OR REPLACE TEMP TABLE "(__similarity_cache__[^"]+)"/
      );
      if (createMatch) {
        existingCacheTables.add(createMatch[1]);
        return [];
      }
      const dropMatch = sql.match(
        /DROP TABLE IF EXISTS "(__similarity_cache__[^"]+)"/
      );
      if (dropMatch) {
        existingCacheTables.delete(dropMatch[1]);
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
      if (sql.includes('COUNT(*) as cnt')) {
        return [{ cnt: 1 }];
      }
      return [];
    });
  });

  function countSimilarityCacheBuilds(): number {
    return mocks.query.mock.calls.filter(([sql]) => {
      return (
        typeof sql === 'string' &&
        sql.includes('CREATE OR REPLACE TEMP TABLE') &&
        sql.includes('__similarity_cache__')
      );
    }).length;
  }

  it('preserves the similarity cache across finalizeJoin but rebuilds after corrections', async () => {
    await duckDBOrchestrator.computeJoinStats('dataset-1', basemap, 'geo');
    expect(countSimilarityCacheBuilds()).toBe(1);

    await duckDBOrchestrator.finalizeJoin('dataset-1', basemap, 'geo');
    await duckDBOrchestrator.computeJoinSynthesis('dataset-1', 'geo');
    expect(countSimilarityCacheBuilds()).toBe(1);

    await duckDBOrchestrator.applyJoinCorrections('dataset-1', 'geo', {
      Frnace: 'France'
    });
    await duckDBOrchestrator.computeJoinSynthesis('dataset-1', 'geo');
    expect(countSimilarityCacheBuilds()).toBe(2);
  });
});

describe('duckDBOrchestrator geometry bounds fallbacks', () => {
  beforeEach(() => {
    state.clearState();
    state.setInitialized(true);
    state.getState().datasets.set('dataset-1', createDataset());
    vi.clearAllMocks();
  });

  it('logs and returns null when geometry extent computation fails', async () => {
    const error = new Error('extent query failed');
    mocks.describeTable.mockResolvedValue({
      name: ['geom'],
      type: ['GEOMETRY']
    });
    mocks.query.mockRejectedValue(error);

    const result = await duckDBOrchestrator.getGeometryExtent('dataset-1');

    expect(result).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Failed to compute geometry extent',
      LogCategory.DUCKDB,
      {
        error,
        flow: 'geometry_extent',
        extra: {
          datasetId: 'dataset-1',
          tableName: 'geometries'
        }
      }
    );
  });

  it('logs and returns null when per-feature bounds computation fails', async () => {
    const error = new Error('feature bounds query failed');
    mocks.describeTable.mockResolvedValue({
      name: ['geom'],
      type: ['GEOMETRY']
    });
    mocks.query.mockRejectedValue(error);

    const result = await duckDBOrchestrator.getGeometryPerFeatureBounds(
      'dataset-1',
      { reprojectToWgs84: true }
    );

    expect(result).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Failed to compute per-feature geometry bounds',
      LogCategory.DUCKDB,
      {
        error,
        flow: 'geometry_per_feature_bounds',
        extra: {
          datasetId: 'dataset-1',
          tableName: 'geometries',
          reprojectToWgs84: true
        }
      }
    );
  });
});
