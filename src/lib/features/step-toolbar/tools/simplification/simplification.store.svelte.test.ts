import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SimplificationTarget } from '$lib/features/commons/constants/ui.constants';
import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';

const mocks = vi.hoisted(() => ({
  duckQuery: vi.fn(),
  simplifyGeometryTable: vi.fn(),
  calculateToleranceFromRate: vi.fn(),
  updateDuckDatasetTableName: vi.fn(),
  updateDuckDatasetJoinInfo: vi.fn(),
  getDuckDatasetBySourceFile: vi.fn(),
  refreshImportedBasemapHelperTables: vi.fn(),
  refreshCustomBasemap: vi.fn(),
  loadVariant: vi.fn(),
  updateDataset: vi.fn(),
  updateDatasetJoinBasemap: vi.fn(),
  updateDatasetTableName: vi.fn(),
  updateFileJoinedBasemap: vi.fn(),
  setReferenceBasemap: vi.fn(),
  resolveBasemapVariantFile: vi.fn(),
  getBasemapVariantFamily: vi.fn((file: string) =>
    file.replace(/-(low|medium|high)(\.[^.]+)?$/, '')
  ),
  getPreferredBasemapSimplificationLevel: vi.fn(),
  currentBasemap: { metadata: null as unknown },
  availableBasemaps: [] as unknown[],
  osmIsActive: false,
  requiresMapLibre: false,
  referenceBasemapId: null as string | null,
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
    updateDatasetJoinInfo: mocks.updateDuckDatasetJoinInfo,
    getDatasetBySourceFile: mocks.getDuckDatasetBySourceFile
  }
}));

vi.mock('$lib/features/duckdb/operations/simplification', () => ({
  simplifyGeometryTable: mocks.simplifyGeometryTable,
  calculateToleranceFromRate: mocks.calculateToleranceFromRate
}));

vi.mock('$lib/features/map/utils/basemap-import.utils', () => ({
  getBasemapRawTableName: (name: string) => `${name}__raw`,
  refreshImportedBasemapHelperTables: mocks.refreshImportedBasemapHelperTables
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
  getBasemapVariantFamily: mocks.getBasemapVariantFamily,
  resolveBasemapVariantFile: mocks.resolveBasemapVariantFile,
  getPreferredBasemapSimplificationLevel:
    mocks.getPreferredBasemapSimplificationLevel
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    get selectedDataset() {
      return mocks.selectedDataset;
    },
    get datasets() {
      return mocks.datasets;
    },
    updateDataset: mocks.updateDataset,
    updateDatasetJoinBasemap: mocks.updateDatasetJoinBasemap,
    updateDatasetTableName: mocks.updateDatasetTableName
  }
}));

vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: {
    get currentProject() {
      return mocks.currentProject;
    },
    updateFileJoinedBasemap: mocks.updateFileJoinedBasemap
  }
}));

vi.mock('$lib/features/map/stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: {
    get isActive() {
      return mocks.osmIsActive;
    }
  }
}));

vi.mock('$lib/features/commons/store/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    get requiresMapLibre() {
      return mocks.requiresMapLibre;
    },
    get referenceBasemapId() {
      return mocks.referenceBasemapId;
    },
    setReferenceBasemap: mocks.setReferenceBasemap
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
    mocks.availableBasemaps = [];
    mocks.osmIsActive = false;
    mocks.requiresMapLibre = false;
    mocks.referenceBasemapId = null;
    mocks.currentProject = undefined;
    mocks.selectedDataset = null;
    mocks.datasets = [];
    mocks.getBasemapVariantFamily.mockImplementation((file: string) =>
      file.replace(/-(low|medium|high)(\.[^.]+)?$/, '')
    );
    mocks.getPreferredBasemapSimplificationLevel.mockReturnValue(undefined);
    resetStore();
  });

  it('should initialize with Basemap source, Medium level, rate 50 and not processing', () => {
    const s = getSimplificationState();
    expect(s.source).toBe(SimplificationSource.Basemap);
    expect(s.level).toBe(SimplificationLevel.Medium);
    expect(s.rate).toBe(50);
    expect(s.isProcessing).toBe(false);
    expect(s.lastApplied).toBeUndefined();
  });

  it('should switch source to Geo when setSource is called', () => {
    simplificationActions.setSource(SimplificationSource.Geo);
    expect(getSimplificationState().source).toBe(SimplificationSource.Geo);
  });

  it('should clamp rate to 0 when a negative value is provided', () => {
    simplificationActions.setRate(-42);
    expect(getSimplificationState().rate).toBe(0);
  });

  it('should clamp rate to 100 when a value above 100 is provided', () => {
    simplificationActions.setRate(250);
    expect(getSimplificationState().rate).toBe(100);
  });

  it('should update rate within valid range', () => {
    simplificationActions.setRate(37);
    expect(getSimplificationState().rate).toBe(37);
  });

  it('should update level when source is Basemap and no metadata is present', () => {
    simplificationActions.setLevel(SimplificationLevel.High);
    expect(getSimplificationState().level).toBe(SimplificationLevel.High);
  });

  it('should ignore setLevel when source is Geo', () => {
    simplificationActions.setSource(SimplificationSource.Geo);
    simplificationActions.setLevel(SimplificationLevel.High);
    expect(getSimplificationState().level).toBe(SimplificationLevel.Medium);
  });

  it('should delegate level resolution to getPreferredBasemapSimplificationLevel when a basemap is loaded', () => {
    mocks.currentBasemap = {
      metadata: { file: 'europe.parquet', simplification_level: 'low' }
    };
    mocks.getPreferredBasemapSimplificationLevel.mockReturnValue(
      SimplificationLevel.High
    );

    simplificationActions.setLevel(SimplificationLevel.Low);

    expect(mocks.getPreferredBasemapSimplificationLevel).toHaveBeenCalledWith(
      mocks.availableBasemaps,
      mocks.currentBasemap.metadata,
      SimplificationLevel.Low
    );
    expect(getSimplificationState().level).toBe(SimplificationLevel.High);
  });

  it('should return false from undoLastSimplification when nothing was applied', async () => {
    await expect(simplificationActions.undoLastSimplification()).resolves.toBe(
      false
    );
  });
});

describe('simplification store — applySimplification dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentBasemap = { metadata: {} };
    mocks.availableBasemaps = [];
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

  it('should call loadVariant for catalogue basemaps with variants', async () => {
    mocks.currentBasemap = {
      metadata: {
        file: 'europe.parquet',
        simplification_level: 'low',
        isCustom: false
      }
    };
    mocks.getPreferredBasemapSimplificationLevel.mockReturnValue(
      SimplificationLevel.Medium
    );
    mocks.resolveBasemapVariantFile.mockReturnValue('europe-medium.parquet');
    mocks.loadVariant.mockResolvedValue({ name: 'variantTable' });

    simplificationActions.setSource(SimplificationSource.Basemap);
    simplificationActions.setLevel(SimplificationLevel.Medium);
    const result = await simplificationActions.applySimplification();

    expect(mocks.loadVariant).toHaveBeenCalledWith(
      'europe.parquet',
      'europe-medium.parquet',
      SimplificationLevel.Medium
    );
    expect(result?.simplified).toBe(true);
    expect(result?.type).toBe(SimplificationTarget.BASEMAP);
    expect(result?.level).toBe(SimplificationLevel.Medium);
    expect(getSimplificationState().lastApplied?.basemapId).toBe(
      'europe.parquet'
    );
  });

  it('should persist catalog variant selection on joined datasets', async () => {
    mocks.currentBasemap = {
      metadata: {
        file: 'france-region-2025-medium',
        simplification_level: 'medium',
        isCustom: false
      }
    };
    mocks.datasets = [
      {
        id: 'dataset-1',
        sourceFileId: 'source-1',
        joinedBasemap: 'france-region-2025-medium'
      },
      {
        id: 'dataset-2',
        sourceFileId: 'source-2',
        joinedBasemap: 'monde-countries-2024-medium'
      }
    ];
    mocks.getPreferredBasemapSimplificationLevel.mockReturnValue(
      SimplificationLevel.High
    );
    mocks.resolveBasemapVariantFile.mockReturnValue('france-region-2025-high');
    mocks.loadVariant.mockResolvedValue({ name: 'variantTable' });

    simplificationActions.setSource(SimplificationSource.Basemap);
    simplificationActions.setLevel(SimplificationLevel.High);

    const result = await simplificationActions.applySimplification();

    expect(result?.simplified).toBe(true);
    expect(mocks.updateDuckDatasetJoinInfo).toHaveBeenCalledWith('dataset-1', {
      joinedBasemap: 'france-region-2025-high'
    });
    expect(mocks.updateDatasetJoinBasemap).toHaveBeenCalledWith(
      'dataset-1',
      'france-region-2025-high'
    );
    expect(mocks.updateFileJoinedBasemap).toHaveBeenCalledWith(
      'source-1',
      'france-region-2025-high'
    );
    expect(mocks.updateDuckDatasetJoinInfo).not.toHaveBeenCalledWith(
      'dataset-2',
      expect.anything()
    );
  });

  it('should persist the active reference basemap variant when it belongs to the same family', async () => {
    mocks.currentBasemap = {
      metadata: {
        file: 'france-region-2025-medium',
        simplification_level: 'medium',
        isCustom: false
      }
    };
    mocks.referenceBasemapId = 'france-region-2025-medium';
    mocks.getPreferredBasemapSimplificationLevel.mockReturnValue(
      SimplificationLevel.High
    );
    mocks.resolveBasemapVariantFile.mockReturnValue('france-region-2025-high');
    mocks.loadVariant.mockResolvedValue({ name: 'variantTable' });

    simplificationActions.setSource(SimplificationSource.Basemap);
    simplificationActions.setLevel(SimplificationLevel.High);

    const result = await simplificationActions.applySimplification();

    expect(result?.simplified).toBe(true);
    expect(mocks.setReferenceBasemap).toHaveBeenCalledWith(
      'france-region-2025-high'
    );
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

  it('should call simplifyGeometryTable for custom imported basemaps', async () => {
    mocks.currentBasemap = {
      metadata: {
        file: 'custom-map',
        bbox: [0, 0, 10, 10],
        layers: [{ type: 'polygon' }],
        isCustom: true
      }
    };
    mocks.duckQuery.mockResolvedValue([{ table_name: 'custom-map__raw' }]);
    mocks.calculateToleranceFromRate.mockReturnValue(0.25);
    mocks.simplifyGeometryTable.mockResolvedValue({
      originalVertices: 1000,
      simplifiedVertices: 400,
      reductionPercentage: 60
    });

    simplificationActions.setSource(SimplificationSource.Basemap);
    simplificationActions.setRate(75);
    const result = await simplificationActions.applySimplification();

    expect(mocks.simplifyGeometryTable).toHaveBeenCalledTimes(1);
    expect(mocks.refreshImportedBasemapHelperTables).toHaveBeenCalled();
    expect(mocks.refreshCustomBasemap).toHaveBeenCalledWith('custom-map');
    expect(result?.simplified).toBe(true);
    expect(result?.vertexReduction).toBe(60);
    expect(result?.originalVertices).toBe(1000);
    expect(result?.simplifiedVertices).toBe(400);
    expect(getSimplificationState().lastApplied?.source).toBe(
      SimplificationSource.Basemap
    );
    expect(getSimplificationState().lastApplied?.basemapId).toBe('custom-map');
  });

  it('should simplify the explicit dataset when Geo source is active with a datasetId', async () => {
    const dataset = {
      id: 'ds-1',
      sourceFileId: 'src-1',
      tableName: 'dataset_table',
      joinedBasemap: undefined,
      geometry: { bounds: [0, 0, 5, 5] }
    };
    mocks.datasets = [dataset];
    mocks.selectedDataset = dataset;
    mocks.currentProject = {
      data: {
        sourceFiles: [{ id: 'src-1', duckdbTableName: 'dataset_table' }]
      }
    };
    mocks.calculateToleranceFromRate.mockReturnValue(0.5);
    mocks.simplifyGeometryTable.mockResolvedValue({
      originalVertices: 500,
      simplifiedVertices: 200,
      reductionPercentage: 60,
      tolerance: 0.5
    });
    mocks.updateDuckDatasetTableName.mockResolvedValue({
      id: 'duck-ds-1',
      tableName: 'dataset_table__simplified'
    });

    simplificationActions.setSource(SimplificationSource.Geo);
    const result = await simplificationActions.applySimplification({
      datasetId: 'ds-1'
    });

    expect(mocks.simplifyGeometryTable).toHaveBeenCalledWith(
      expect.anything(),
      'dataset_table__simplified',
      0.5,
      {
        inputTableName: 'dataset_table',
        targetTableName: 'dataset_table__simplified'
      }
    );
    expect(mocks.updateDuckDatasetTableName).toHaveBeenCalledWith(
      'src-1',
      'dataset_table__simplified'
    );
    expect(mocks.updateDatasetTableName).toHaveBeenCalledWith(
      'ds-1',
      'dataset_table__simplified'
    );
    expect(mocks.updateDataset).toHaveBeenCalledWith(
      'ds-1',
      expect.objectContaining({
        simplificationApplied: expect.objectContaining({ rate: 50 })
      })
    );
    expect(result?.simplified).toBe(true);
    expect(result?.type).toBe(SimplificationTarget.GEODATA);
    expect(result?.datasetBaseTableName).toBe('dataset_table');
    expect(result?.datasetSimplifiedTableName).toBe(
      'dataset_table__simplified'
    );
    expect(getSimplificationState().lastApplied?.datasetSourceFileId).toBe(
      'src-1'
    );
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

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Cannot simplify a catalog basemap dataset'
    );
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
});
