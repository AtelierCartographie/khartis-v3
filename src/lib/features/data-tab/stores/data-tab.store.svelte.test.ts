import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    datasets: [] as Array<Record<string, unknown>>,
    selectedDataset: undefined as Record<string, unknown> | undefined
  }
}));

vi.mock('$lib/features/project-management/core', () => ({
  SavePriority: {
    IMMEDIATE: 'immediate',
    DEBOUNCED: 'debounced'
  },
  persistenceRegistry: {
    register: vi.fn(),
    notifyChange: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/geo-detector.utils', () => ({
  hasGPSCoordinateColumns: (
    _columns: unknown,
    geoDetection: { gpsCoordinates?: unknown } | undefined
  ) => !!geoDetection?.gpsCoordinates
}));

import { dataTabStore } from './data-tab.store.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';

type MockedDatasets = {
  datasets: Array<Record<string, unknown>>;
  selectedDataset: Record<string, unknown> | undefined;
};

const mockDatasets = datasetsStore as unknown as MockedDatasets;

function setSelected(dataset: Record<string, unknown> | undefined) {
  mockDatasets.selectedDataset = dataset;
  mockDatasets.datasets = dataset ? [dataset] : [];
}

beforeEach(() => {
  dataTabStore.reset();
  setSelected(undefined);
});

describe('[S06] dataTabStore — workflow mode detection', () => {
  it('reports "auto" when no dataset is selected', () => {
    expect(dataTabStore.effectiveWorkflowMode).toBe('auto');
  });

  it('reports "geographic" for datasets that carry a geometry column', () => {
    setSelected({ geometry: true, columns: [], geoDetection: {} });
    expect(dataTabStore.effectiveWorkflowMode).toBe('geographic');
    expect(dataTabStore.isGeographicMode).toBe(true);
    expect(dataTabStore.stepCount).toBe(2);
    expect(dataTabStore.stepNames).toEqual(['control', 'enrich']);
  });

  it('reports "tabular-gps" when GPS coordinate columns are present', () => {
    setSelected({
      geometry: null,
      columns: [],
      geoDetection: { gpsCoordinates: { latitude: 'lat', longitude: 'lon' } }
    });
    expect(dataTabStore.effectiveWorkflowMode).toBe('tabular-gps');
    expect(dataTabStore.isTabularGPSMode).toBe(true);
    expect(dataTabStore.stepCount).toBe(3);
    expect(dataTabStore.stepNames).toEqual(['control', 'geolocate', 'basemap']);
  });

  it('reports "tabular" as default for CSV without geometry or GPS', () => {
    setSelected({ geometry: null, columns: [], geoDetection: {} });
    expect(dataTabStore.effectiveWorkflowMode).toBe('tabular');
    expect(dataTabStore.stepCount).toBe(3);
    expect(dataTabStore.stepNames).toEqual(['control', 'geolocate', 'join']);
  });
});

describe('[S06] dataTabStore — step progression', () => {
  beforeEach(() => {
    setSelected({ geometry: null, columns: [], geoDetection: {} });
  });

  it('unlocks the next step once the current one is marked complete', () => {
    dataTabStore.markStepComplete(0);
    expect(dataTabStore.hasCompletedStep[0]).toBe(true);
    expect(dataTabStore.canNavigateToStep[1]).toBe(true);
  });

  it('moves activeStepIndex only to unlocked steps', () => {
    dataTabStore.setActiveStep(2);
    expect(dataTabStore.activeStepIndex).toBe(0);

    dataTabStore.markStepComplete(0);
    dataTabStore.setActiveStep(1);
    expect(dataTabStore.activeStepIndex).toBe(1);
  });
});

describe('[S06] dataTabStore — isReadyForVisualization', () => {
  it('requires step 0 complete in geographic mode', () => {
    setSelected({ geometry: true, columns: [], geoDetection: {} });
    expect(dataTabStore.isReadyForVisualization).toBe(false);
    dataTabStore.markStepComplete(0);
    expect(dataTabStore.isReadyForVisualization).toBe(true);
  });

  it('requires the last step (index 2) complete in tabular mode', () => {
    setSelected({ geometry: null, columns: [], geoDetection: {} });
    dataTabStore.markStepComplete(0);
    dataTabStore.markStepComplete(1);
    expect(dataTabStore.isReadyForVisualization).toBe(false);
    dataTabStore.markStepComplete(2);
    expect(dataTabStore.isReadyForVisualization).toBe(true);
  });

  it('requires the basemap step complete in tabular-gps mode', () => {
    setSelected({
      geometry: null,
      columns: [],
      geoDetection: { gpsCoordinates: { latitude: 'lat', longitude: 'lon' } }
    });
    expect(dataTabStore.isReadyForVisualization).toBe(false);
    dataTabStore.markStepComplete(0);
    dataTabStore.markStepComplete(1);
    dataTabStore.markStepComplete(2);
    expect(dataTabStore.isReadyForVisualization).toBe(true);
  });
});
