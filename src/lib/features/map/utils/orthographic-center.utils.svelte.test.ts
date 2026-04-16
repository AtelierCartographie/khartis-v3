import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const projectionFn = vi.fn(
    ([lon, lat]: [number, number]) =>
      [lon + 1000, lat + 2000] as [number, number]
  );

  return {
    projectionFn,
    getDatasetBySourceFile: vi.fn(),
    getDuckDatasetBySourceFile: vi.fn(),
    getProjectionState: vi.fn(),
    fitProjectionToBbox: vi.fn(),
    buildProjectionForBasemap: vi.fn(() => projectionFn),
    getPreferredBasemapFile: vi.fn((_: unknown, file: string) => file),
    initializeBasemap: vi.fn()
  };
});

vi.mock('$lib/features/commons/store/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    referenceBasemapId: null
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    selectedDataset: null,
    enabledDatasets: [],
    datasets: [],
    getDatasetBySourceFile: mocks.getDatasetBySourceFile
  }
}));

vi.mock('$lib/features/commons/utils/projection.utils', () => ({
  fitProjectionToBbox: mocks.fitProjectionToBbox,
  getProjectionById: vi.fn()
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: mocks.getDuckDatasetBySourceFile
  }
}));

vi.mock(
  '$lib/features/step-toolbar/tools/projections/projection.store.svelte',
  () => ({
    getProjectionState: mocks.getProjectionState
  })
);

vi.mock('../services/basemap.service.svelte', () => ({
  basemapService: {
    initialize: mocks.initializeBasemap,
    projectionPresets: null,
    currentMetadata: null,
    availableBasemaps: [
      {
        file: 'europe-nuts2',
        isCustom: false,
        bbox: [-10, 35, 30, 60],
        proj_to: { type: 'simple', proj4: '+proj=merc' }
      }
    ]
  },
  getPreferredBasemapFile: mocks.getPreferredBasemapFile
}));

vi.mock('./dataset-crs', () => ({
  shouldUseIdentityProjectionForDatasetCrs: vi.fn(() => false)
}));

vi.mock('./geoarrow-stream-bridge', () => ({
  buildProjectionForBasemap: mocks.buildProjectionForBasemap,
  getMainlandBboxForBasemap: vi.fn(() => null)
}));

vi.mock('./orthographic-reference', () => ({
  shouldUseBasemapReferenceInOrthographicView: vi.fn(() => true)
}));

vi.mock('./proj4d3', () => ({
  proj4d3: vi.fn()
}));

vi.mock('./projection-priority', () => ({
  resolveProjectionForRender: vi.fn(
    (defaultProjection: unknown, userOverride: unknown) =>
      userOverride ?? defaultProjection
  )
}));

vi.mock('../stores/projection.store.svelte', () => ({
  projectionStore: {
    isProjectedCoordinates: true,
    canvasSize: { width: 800, height: 600 },
    fitPaddingPx: 40
  }
}));

describe('resolveCenterCoordinates', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.projectionFn.mockClear();
    mocks.getDatasetBySourceFile.mockReset();
    mocks.getDuckDatasetBySourceFile.mockReset();
    mocks.getProjectionState.mockReset();
    mocks.fitProjectionToBbox.mockReset();
    mocks.buildProjectionForBasemap.mockClear();
    mocks.getPreferredBasemapFile.mockClear();
    mocks.initializeBasemap.mockReset();

    mocks.getDatasetBySourceFile.mockReturnValue({
      id: 'dataset-1',
      sourceFileId: 'source-1',
      geometry: {
        bounds: [-10, 35, 30, 60],
        crs: 'EPSG:4326'
      }
    });
    mocks.getDuckDatasetBySourceFile.mockReturnValue({
      sourceFileId: 'source-1',
      joinedBasemap: 'europe-nuts2'
    });
    mocks.getProjectionState.mockReturnValue({
      overrideActive: false,
      overrideSource: undefined,
      longitude: 0,
      latitude: 0,
      rotation: 0
    });
  });

  it('projects the center point when the orthographic reference uses projected coordinates', async () => {
    const { resolveCenterCoordinates } =
      await import('./orthographic-center.utils');

    const center = await resolveCenterCoordinates({
      lon: 2.35,
      lat: 48.86,
      sourceFileId: 'source-1'
    });

    expect(mocks.initializeBasemap).toHaveBeenCalled();
    expect(mocks.buildProjectionForBasemap).toHaveBeenCalled();
    expect(center).toEqual({
      x: 1002.35,
      y: 2048.86
    });
  });
});
