// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SimplificationTarget } from '$lib/features/commons/constants/ui.constants';
import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';

const mocks = vi.hoisted(() => ({
  duckQuery: vi.fn(),
  simplifyGeometryTable: vi.fn(),
  calculateToleranceFromRate: vi.fn(),
  updateDuckDatasetTableName: vi.fn(),
  refreshImportedBasemapHelperTables: vi.fn(),
  refreshCustomBasemap: vi.fn(),
  loadVariant: vi.fn(),
  updateDataset: vi.fn(),
  updateDatasetTableName: vi.fn(),
  resolveBasemapVariantFile: vi.fn(),
  getPreferredBasemapSimplificationLevel: vi.fn(),
  getBasemapSimplificationLevel: vi.fn(
    (metadata: { simplification_level?: string }) => {
      if (
        metadata.simplification_level === 'low' ||
        metadata.simplification_level === 'medium' ||
        metadata.simplification_level === 'high'
      ) {
        return metadata.simplification_level;
      }
      return null;
    }
  ),
  currentBasemap: { metadata: null } as { metadata: unknown },
  availableBasemaps: [] as unknown[],
  osmIsActive: false,
  requiresMapLibre: false,
  currentProject: undefined as
    | {
        data?: {
          sourceFiles?: Array<{
            id: string;
            duckdbTableName?: string;
          }>;
        };
      }
    | undefined,
  selectedDataset: null as unknown,
  datasets: [] as unknown[]
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: { query: mocks.duckQuery },
  duckDBOrchestrator: {
    updateDatasetTableName: mocks.updateDuckDatasetTableName,
    updateDatasetJoinInfo: vi.fn(),
    getDatasetBySourceFile: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb/operations/simplification', () => ({
  simplifyGeometryTable: mocks.simplifyGeometryTable,
  calculateToleranceFromRate: mocks.calculateToleranceFromRate
}));

vi.mock('$lib/features/map/services/basemap-import.service', () => ({
  getBasemapRawTableName: (name: string) => `${name}__raw`,
  refreshImportedBasemapHelperTables: mocks.refreshImportedBasemapHelperTables,
  resolveCustomBasemapLayerType: (metadata: {
    layers: Array<{ type: string }>;
  }) => metadata.layers[0]?.type
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    get currentBasemap() {
      return mocks.currentBasemap;
    },
    get availableBasemaps() {
      return mocks.availableBasemaps;
    },
    refreshCustomBasemap: mocks.refreshCustomBasemap,
    loadVariant: mocks.loadVariant
  },
  getBasemapVariantFamily: vi.fn(),
  resolveBasemapVariantFile: mocks.resolveBasemapVariantFile,
  getPreferredBasemapSimplificationLevel:
    mocks.getPreferredBasemapSimplificationLevel,
  getBasemapSimplificationLevel: mocks.getBasemapSimplificationLevel
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    get selectedDataset() {
      return mocks.selectedDataset;
    },
    get datasets() {
      return mocks.datasets;
    },
    updateDataset: mocks.updateDataset,
    updateDatasetJoinBasemap: vi.fn(),
    updateDatasetTableName: mocks.updateDatasetTableName
  }
}));

vi.mock('$lib/features/commons/stores/project.store.svelte', () => ({
  projectStore: {
    get currentProject() {
      return mocks.currentProject;
    },
    updateFileJoinedBasemap: vi.fn()
  }
}));

vi.mock('$lib/features/map/stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: {
    get isActive() {
      return mocks.osmIsActive;
    }
  }
}));

vi.mock('$lib/features/commons/stores/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    get requiresMapLibre() {
      return mocks.requiresMapLibre;
    },
    referenceBasemapId: null,
    setReferenceBasemap: vi.fn()
  }
}));

const { simplificationActions, getSimplificationState } =
  await import('./simplification.store.svelte');

function resetStore() {
  simplificationActions.reset();
  simplificationActions.setState({ lastApplied: undefined });
}

describe('simplification store — synchronous actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentBasemap = { metadata: null };
    mocks.osmIsActive = false;
    mocks.requiresMapLibre = false;
    mocks.currentProject = undefined;
    mocks.selectedDataset = null;
    mocks.datasets = [];
    mocks.getPreferredBasemapSimplificationLevel.mockReturnValue(undefined);
    resetStore();
  });

  it('should reset the Geo simplification rate to 0 when the selected dataset has not been simplified', () => {
    simplificationActions.setRate(50);
    mocks.datasets = [
      {
        id: 'ds-1',
        tableName: 'regions',
        geometry: { bounds: [0, 0, 1, 1] }
      }
    ];

    simplificationActions.setSource(SimplificationSource.Geo, {
      datasetId: 'ds-1'
    });

    expect(getSimplificationState().source).toBe(SimplificationSource.Geo);
    expect(getSimplificationState().rate).toBe(0);
  });

  it('should restore the Geo simplification rate from the targeted dataset when it exists', () => {
    simplificationActions.setRate(12);
    mocks.datasets = [
      {
        id: 'ds-1',
        tableName: 'regions',
        geometry: { bounds: [0, 0, 1, 1] },
        simplificationApplied: {
          rate: 37
        }
      }
    ];

    simplificationActions.setSource(SimplificationSource.Geo, {
      datasetId: 'ds-1'
    });

    expect(getSimplificationState().source).toBe(SimplificationSource.Geo);
    expect(getSimplificationState().rate).toBe(37);
  });
});

describe('simplification store — applySimplification dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentBasemap = { metadata: {} };
    mocks.osmIsActive = false;
    mocks.currentProject = undefined;
    mocks.selectedDataset = null;
    mocks.datasets = [];
    mocks.getPreferredBasemapSimplificationLevel.mockReturnValue(undefined);
    resetStore();
  });

  it('should short-circuit with simplified=false when OSM reference basemap is active', async () => {
    mocks.osmIsActive = true;

    const result = await simplificationActions.applySimplification();

    expect(result?.simplified).toBe(false);
    expect(result?.type).toBe(SimplificationTarget.BASEMAP);
    expect(mocks.simplifyGeometryTable).not.toHaveBeenCalled();
    expect(mocks.loadVariant).not.toHaveBeenCalled();
    expect(getSimplificationState().lastApplied).toBeUndefined();
  });

  it('should return simplified=false when no variant file is available for the requested level', async () => {
    mocks.currentBasemap = {
      metadata: {
        file: 'europe.parquet',
        simplification_level: 'medium',
        isCustom: false
      }
    };
    mocks.getPreferredBasemapSimplificationLevel.mockReturnValue(
      SimplificationLevel.Medium
    );
    mocks.resolveBasemapVariantFile.mockReturnValue(null);

    const result = await simplificationActions.applySimplification();

    expect(result?.simplified).toBe(false);
    expect(mocks.loadVariant).not.toHaveBeenCalled();
    expect(getSimplificationState().lastApplied).toBeUndefined();
  });

  it('should throw when trying to simplify a dataset joined to a catalog basemap', async () => {
    const dataset = {
      id: 'joined-ds',
      sourceFileId: 'src-2',
      tableName: 'joined_table',
      joinedBasemap: 'europe.parquet',
      geometry: { bounds: [0, 0, 5, 5] }
    };
    mocks.datasets = [dataset];
    mocks.selectedDataset = dataset;

    simplificationActions.setSource(SimplificationSource.Geo);
    let error: unknown;
    try {
      await simplificationActions.applySimplification({
        datasetId: 'joined-ds'
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(DataValidationError);
    expect(error).toMatchObject({
      message: 'Cannot simplify a catalog basemap dataset',
      field: 'joinedBasemap',
      details: expect.objectContaining({
        field: 'joinedBasemap',
        datasetId: 'joined-ds',
        joinedBasemap: 'europe.parquet'
      })
    });
    expect(mocks.simplifyGeometryTable).not.toHaveBeenCalled();
  });
});

describe('simplification store — undo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentBasemap = {
      metadata: {
        file: 'custom-map',
        bbox: [0, 0, 10, 10],
        layers: [{ type: 'polygon' }],
        isCustom: true
      }
    };
    mocks.osmIsActive = false;
    mocks.requiresMapLibre = false;
    mocks.currentProject = {
      data: {
        sourceFiles: [{ id: 'src-1', duckdbTableName: 'dataset_table' }]
      }
    };
    mocks.datasets = [
      {
        id: 'ds-1',
        sourceFileId: 'src-1',
        tableName: 'dataset_table',
        joinedBasemap: undefined,
        geometry: { bounds: [0, 0, 5, 5] }
      }
    ];
    mocks.selectedDataset = mocks.datasets[0];
    mocks.getPreferredBasemapSimplificationLevel.mockReturnValue(undefined);
    mocks.duckQuery.mockResolvedValue([{ table_name: 'custom-map__raw' }]);
    mocks.calculateToleranceFromRate.mockReturnValue(0.25);
    mocks.simplifyGeometryTable.mockResolvedValue({
      originalVertices: 1000,
      simplifiedVertices: 400,
      reductionPercentage: 60
    });
    mocks.updateDuckDatasetTableName.mockResolvedValue({
      id: 'duck-ds-1',
      tableName: 'dataset_table__simplified'
    });
    resetStore();
  });

  it('should restore the original dataset table and clear lastApplied after undoLastSimplification', async () => {
    simplificationActions.setSource(SimplificationSource.Geo);
    await simplificationActions.applySimplification({ datasetId: 'ds-1' });
    expect(getSimplificationState().lastApplied).toBeDefined();

    mocks.updateDuckDatasetTableName.mockClear();
    mocks.updateDatasetTableName.mockClear();
    mocks.updateDataset.mockClear();

    const undone = await simplificationActions.undoLastSimplification();

    expect(undone).toBe(true);
    expect(mocks.updateDuckDatasetTableName).toHaveBeenCalledWith(
      'src-1',
      'dataset_table'
    );
    expect(mocks.updateDatasetTableName).toHaveBeenCalledWith(
      'ds-1',
      'dataset_table'
    );
    expect(mocks.updateDataset).toHaveBeenCalledWith('ds-1', {
      simplificationApplied: undefined
    });
    expect(getSimplificationState().lastApplied).toBeUndefined();
  });

  it('should escape custom basemap table names as SQL identifiers during undoLastSimplification', async () => {
    mocks.currentBasemap = {
      metadata: {
        file: 'custom"map',
        bbox: [0, 0, 5, 5],
        layers: [{ type: 'polygon' }],
        isCustom: true
      }
    };
    mocks.duckQuery.mockResolvedValue([{ table_name: 'custom"map__raw' }]);

    simplificationActions.setSource(SimplificationSource.Basemap);
    await simplificationActions.applySimplification();

    mocks.duckQuery.mockClear();
    const undone = await simplificationActions.undoLastSimplification();

    expect(undone).toBe(true);
    expect(mocks.duckQuery).toHaveBeenCalledWith(
      'CREATE OR REPLACE TABLE "custom""map" AS SELECT * FROM "custom""map__raw"'
    );
  });
});
