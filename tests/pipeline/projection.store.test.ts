import { afterEach, describe, expect, it, vi } from 'vitest';

describe('projection store suggestions', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('prefers GPS bounds over projected metric bounds when suggesting projections', async () => {
    const suggestProjectionsForBbox = vi.fn(() => ({
      national: [],
      generic: [
        {
          id: 'geoNaturalEarth1',
          label: 'Natural Earth',
          d3Config: { projection: 'geoNaturalEarth1' }
        }
      ]
    }));

    vi.doMock('$lib/features/commons/store/datasets.store.svelte', () => ({
      datasetsStore: {
        selectedDataset: {
          id: 'projected-geofile',
          sourceFileId: 'projected-source',
          geometry: {
            bounds: [704320, 6276820, 783140, 6359140],
            crs: 'EPSG:2154'
          }
        },
        getDatasetsByType: vi.fn(() => []),
        enabledDatasets: [
          {
            id: 'gps-dataset',
            sourceFileId: 'gps-source'
          }
        ],
        datasets: [
          {
            id: 'projected-geofile',
            sourceFileId: 'projected-source',
            geometry: {
              bounds: [704320, 6276820, 783140, 6359140],
              crs: 'EPSG:2154'
            }
          },
          {
            id: 'gps-dataset',
            sourceFileId: 'gps-source'
          }
        ]
      }
    }));

    vi.doMock('$lib/features/commons/store/global.svelte', () => ({
      globalActions: {
        setProjectionViewMode: vi.fn()
      }
    }));

    vi.doMock('$lib/features/commons/utils/projection.utils', () => ({
      fitProjectionToGeoJSON: vi.fn(),
      getProjectionById: vi.fn(() => ({
        id: 'natural-earth',
        projection: () => ({})
      })),
      projectGeoJSON: vi.fn()
    }));

    vi.doMock('$lib/features/commons/store/map-instance.store.svelte', () => ({
      mapInstanceStore: {
        map: null
      }
    }));

    const setProjection = vi.fn();
    vi.doMock('$lib/features/map/stores/map-projection.store.svelte', () => ({
      mapProjectionStore: {
        setProjection
      }
    }));

    vi.doMock('./projection-suggest.service', () => ({
      suggestProjectionsForBbox,
      buildProjectionFromSuggestion: vi.fn(() => null)
    }));

    vi.doMock(
      '$lib/features/step-toolbar/tools/projections/projection-suggest.service',
      () => ({
        suggestProjectionsForBbox,
        buildProjectionFromSuggestion: vi.fn(() => null)
      })
    );

    vi.doMock('$lib/features/commons/utils/logger', () => ({
      LogCategory: { MAP: 'MAP' },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    }));

    const getDatasetBySourceFile = vi.fn((sourceFileId: string) => {
      if (sourceFileId === 'gps-source') {
        return { id: 'duck-gps-dataset' };
      }
      return null;
    });
    const getGPSBounds = vi.fn(async (datasetId: string) => {
      if (datasetId === 'duck-gps-dataset') {
        return {
          minLon: 2.3,
          minLat: 43.1,
          maxLon: 3.8,
          maxLat: 44.2
        };
      }
      return null;
    });

    vi.doMock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
      duckDBOrchestrator: {
        getDatasetBySourceFile,
        getGPSBounds
      }
    }));

    const { projectionActions, getProjectionState } =
      await import('$lib/features/step-toolbar/tools/projections/projection.store.svelte');

    projectionActions.suggestProjectionForCurrentData();

    await vi.waitFor(() => {
      expect(suggestProjectionsForBbox).toHaveBeenCalledWith([
        2.3, 43.1, 3.8, 44.2
      ]);
    });

    expect(getDatasetBySourceFile).toHaveBeenCalledWith('projected-source');
    expect(getDatasetBySourceFile).toHaveBeenCalledWith('gps-source');
    expect(getGPSBounds).toHaveBeenCalledWith('duck-gps-dataset');
    expect(getProjectionState().selected).toBe('natural-earth');
    expect(getProjectionState().overrideActive).toBe(true);
    expect(getProjectionState().overrideSource).toBe('auto');
    expect(setProjection).toHaveBeenCalledWith('globe');
  });

  it('marks explicit suggestion application as a manual override', async () => {
    vi.doMock('$lib/features/commons/store/datasets.store.svelte', () => ({
      datasetsStore: {
        selectedDataset: null,
        getDatasetsByType: vi.fn(() => []),
        enabledDatasets: [],
        datasets: []
      }
    }));

    vi.doMock('$lib/features/commons/store/global.svelte', () => ({
      globalActions: {
        setProjectionViewMode: vi.fn()
      }
    }));

    vi.doMock('$lib/features/commons/utils/projection.utils', () => ({
      fitProjectionToGeoJSON: vi.fn(),
      getProjectionById: vi.fn(() => ({
        id: 'mercator',
        projection: () => ({})
      })),
      projectGeoJSON: vi.fn()
    }));

    vi.doMock('$lib/features/commons/store/map-instance.store.svelte', () => ({
      mapInstanceStore: {
        map: null
      }
    }));

    const setProjection = vi.fn();
    vi.doMock('$lib/features/map/stores/map-projection.store.svelte', () => ({
      mapProjectionStore: {
        setProjection
      }
    }));

    vi.doMock(
      '$lib/features/step-toolbar/tools/projections/projection-suggest.service',
      () => ({
        suggestProjectionsForBbox: vi.fn(),
        buildProjectionFromSuggestion: vi.fn(() => null)
      })
    );

    vi.doMock('$lib/features/commons/utils/logger', () => ({
      LogCategory: { MAP: 'MAP' },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    }));

    vi.doMock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
      duckDBOrchestrator: {
        getDatasetBySourceFile: vi.fn(),
        getGPSBounds: vi.fn()
      }
    }));

    const { projectionActions, getProjectionState } =
      await import('$lib/features/step-toolbar/tools/projections/projection.store.svelte');

    projectionActions.applySuggestion({
      id: 'geoMercator',
      label: 'Mercator',
      d3Config: { projection: 'geoMercator' }
    });

    expect(getProjectionState().selected).toBe('mercator');
    expect(getProjectionState().overrideActive).toBe(true);
    expect(getProjectionState().overrideSource).toBe('manual');
    expect(setProjection).toHaveBeenCalledWith('mercator');
  });
});
