import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  datasets: [] as Array<Record<string, unknown>>,
  hasGPSCoordinateColumns: vi.fn(() => false)
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
  hasGPSCoordinateColumns: (...args: unknown[]) =>
    mocks.hasGPSCoordinateColumns(...args)
}));

import { dataTabStore } from '$lib/features/main-toolbar/data-tab/data-tab.store.svelte';

describe('dataTabStore workflow gating', () => {
  beforeEach(() => {
    dataTabStore.reset();
    mocks.datasets = [];
    mocks.hasGPSCoordinateColumns.mockReset();
    mocks.hasGPSCoordinateColumns.mockReturnValue(false);
  });

  it('treats gps tabular datasets as a two-step workflow and unlocks visualization after basemap completion', () => {
    mocks.datasets = [
      {
        id: 'gps-dataset',
        columns: [{ name: 'lat' }, { name: 'long' }],
        geometry: null
      }
    ];
    mocks.hasGPSCoordinateColumns.mockReturnValue(true);

    expect(dataTabStore.stepNames).toEqual(['control', 'basemap']);
    expect(dataTabStore.stepCount).toBe(2);
    expect(dataTabStore.basemapStepIndex).toBe(1);
    expect(dataTabStore.isReadyForVisualization).toBe(false);

    dataTabStore.markStepComplete(0);
    dataTabStore.updateNavigationPermissions();
    expect(dataTabStore.canNavigateToStep[1]).toBe(true);
    expect(dataTabStore.isReadyForVisualization).toBe(false);

    dataTabStore.markStepComplete(1);
    expect(dataTabStore.isReadyForVisualization).toBe(true);
  });

  it('uses geo detection metadata to switch custom GPS datasets to the two-step workflow', () => {
    mocks.datasets = [
      {
        id: 'gps-dataset',
        columns: [{ name: 'Latitude_WGS84' }, { name: 'Longitude_WGS84' }],
        geoDetection: {
          hasGeoColumns: true,
          geoColumns: [
            {
              index: 0,
              columnName: 'Latitude_WGS84',
              type: 'latitude',
              confidence: 0.99
            },
            {
              index: 1,
              columnName: 'Longitude_WGS84',
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
      (
        _columns: unknown,
        geoDetection: { geoColumns?: unknown[] } | undefined
      ) => Boolean(geoDetection?.geoColumns?.length)
    );

    expect(dataTabStore.stepNames).toEqual(['control', 'basemap']);
    expect(mocks.hasGPSCoordinateColumns).toHaveBeenCalledWith(
      mocks.datasets[0].columns,
      mocks.datasets[0].geoDetection
    );
  });
});
