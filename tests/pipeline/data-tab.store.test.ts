import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockGeoDetection = { geoColumns?: unknown[] } | undefined;
type HasGPSCoordinateColumnsMock = (
  columns: unknown,
  geoDetection?: MockGeoDetection
) => boolean;

const mocks = vi.hoisted(() => ({
  datasets: [] as Array<Record<string, unknown>>,
  hasGPSCoordinateColumns: vi.fn<HasGPSCoordinateColumnsMock>(() => false)
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    get datasets() {
      return mocks.datasets;
    },
    get selectedDataset() {
      return mocks.datasets[0];
    }
  }
}));

vi.mock('$lib/features/commons/utils/geo-detector.utils', () => ({
  hasGPSCoordinateColumns: (
    columns: unknown,
    geoDetection?: MockGeoDetection
  ) => mocks.hasGPSCoordinateColumns(columns, geoDetection)
}));

import { dataTabStore } from '$lib/features/main-toolbar/data-tab/data-tab.store.svelte';

describe('dataTabStore workflow gating', () => {
  beforeEach(() => {
    dataTabStore.reset();
    mocks.datasets = [];
    mocks.hasGPSCoordinateColumns.mockReset();
    mocks.hasGPSCoordinateColumns.mockReturnValue(false);
  });

  it('keeps the geolocation step visible for gps tabular datasets and unlocks visualization after basemap completion', () => {
    mocks.datasets = [
      {
        id: 'gps-dataset',
        columns: [{ name: 'lat' }, { name: 'long' }],
        geometry: null
      }
    ];
    mocks.hasGPSCoordinateColumns.mockReturnValue(true);

    expect(dataTabStore.stepNames).toEqual(['control', 'geolocate', 'basemap']);
    expect(dataTabStore.stepCount).toBe(3);
    expect(dataTabStore.basemapStepIndex).toBe(2);
    expect(dataTabStore.isReadyForVisualization).toBe(false);

    dataTabStore.markStepComplete(0);
    dataTabStore.updateNavigationPermissions();
    expect(dataTabStore.canNavigateToStep[1]).toBe(true);
    expect(dataTabStore.isReadyForVisualization).toBe(false);

    dataTabStore.markStepComplete(1);
    dataTabStore.updateNavigationPermissions();
    expect(dataTabStore.canNavigateToStep[2]).toBe(true);
    expect(dataTabStore.isReadyForVisualization).toBe(false);

    dataTabStore.markStepComplete(2);
    expect(dataTabStore.isReadyForVisualization).toBe(true);
  });

  it('uses geo detection metadata to keep custom GPS datasets in the visible three-step workflow', () => {
    mocks.datasets = [
      {
        id: 'gps-dataset',
        columns: [{ name: 'gcpnt_lat' }, { name: 'gcpnt_lon' }],
        geoDetection: {
          hasGeoColumns: true,
          geoColumns: [
            {
              index: 0,
              columnName: 'gcpnt_lat',
              type: 'latitude',
              confidence: 0.99
            },
            {
              index: 1,
              columnName: 'gcpnt_lon',
              type: 'longitude',
              confidence: 0.98
            }
          ],
          warnings: []
        },
        geometry: null
      }
    ];
    mocks.hasGPSCoordinateColumns.mockImplementation(
      (_columns: unknown, geoDetection: MockGeoDetection) =>
        Boolean(geoDetection?.geoColumns?.length)
    );

    expect(dataTabStore.stepNames).toEqual(['control', 'geolocate', 'basemap']);
    expect(mocks.hasGPSCoordinateColumns).toHaveBeenCalledWith(
      mocks.datasets[0].columns,
      mocks.datasets[0].geoDetection
    );
  });

  it('keeps geolocation at step 2 and basemap join at step 3 for gps datasets', () => {
    mocks.datasets = [
      {
        id: 'gps-dataset',
        columns: [{ name: 'Latitude_WGS84' }, { name: 'Longitude_WGS84' }],
        geometry: null
      }
    ];
    mocks.hasGPSCoordinateColumns.mockReturnValue(true);

    expect(dataTabStore.getDisplayedStepNumber('control')).toBe(1);
    expect(dataTabStore.getDisplayedStepNumber('geolocate')).toBe(2);
    expect(dataTabStore.getDisplayedStepNumber('basemap')).toBe(3);
  });

  it('maps the basemap component to the third displayed step in the standard tabular workflow', () => {
    mocks.datasets = [
      {
        id: 'tabular-dataset',
        columns: [{ name: 'country' }],
        geometry: null
      }
    ];

    expect(dataTabStore.getDisplayedStepNumber('control')).toBe(1);
    expect(dataTabStore.getDisplayedStepNumber('geolocate')).toBe(2);
    expect(dataTabStore.getDisplayedStepNumber('basemap')).toBe(3);
  });
});
