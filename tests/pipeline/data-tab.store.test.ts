import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  datasets: [] as Array<Record<string, unknown>>,
  hasGPSCoordinateColumns: false
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
  hasGPSCoordinateColumns: vi.fn(() => mocks.hasGPSCoordinateColumns)
}));

import { dataTabStore } from '$lib/features/main-toolbar/data-tab/data-tab.store.svelte';

describe('dataTabStore workflow gating', () => {
  beforeEach(() => {
    dataTabStore.reset();
    mocks.datasets = [];
    mocks.hasGPSCoordinateColumns = false;
  });

  it('treats gps tabular datasets as a two-step workflow and unlocks visualization after basemap completion', () => {
    mocks.datasets = [
      {
        id: 'gps-dataset',
        columns: [{ name: 'lat' }, { name: 'long' }],
        geometry: null
      }
    ];
    mocks.hasGPSCoordinateColumns = true;

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
});
