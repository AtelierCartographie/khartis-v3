import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileType, type DuckDBDataset } from '../types';

const mocks = vi.hoisted(() => ({
  describeTable: vi.fn(),
  initDuckDB: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  query: vi.fn(),
  registerPersistence: vi.fn()
}));

vi.mock('../duck', () => ({
  Duck: {
    describe_table: mocks.describeTable,
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
