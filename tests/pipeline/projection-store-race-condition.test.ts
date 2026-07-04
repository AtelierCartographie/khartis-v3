import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the store module
vi.mock('$lib/features/commons/stores/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    requiresMapLibre: false,
    selectedStyle: 'blank_white',
    preferredTiledStyle: undefined,
    referenceBasemapId: null
  }
}));

vi.mock('$lib/features/map/stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: { isActive: false, activeOSMBasemap: null }
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: { currentMetadata: null, projectionPresets: {} }
}));

vi.mock('$lib/features/map/stores/map-projection.store.svelte', () => ({
  mapProjectionStore: { setProjection: vi.fn() }
}));

vi.mock('$lib/features/map/stores/projection.store.svelte', () => ({
  projectionStore: { isProjectedCoordinates: false, referenceBbox: null }
}));

vi.mock('$lib/features/commons/stores/global.svelte', () => ({
  globalActions: {
    setProjectionViewMode: vi.fn(),
    setProjectionFilter: vi.fn()
  },
  globalState: {}
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    selectedDataset: null,
    getDatasetsByType: () => [],
    enabledDatasets: [],
    datasets: []
  }
}));

vi.mock('$lib/features/commons/stores/map-instance.store.svelte', () => ({
  mapInstanceStore: { map: null }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: () => null,
    getGPSBounds: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: { MAP: 'map' },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('$lib/features/project-management/core', () => ({
  persistenceRegistry: {
    register: vi.fn(),
    notifyChange: vi.fn()
  },
  SavePriority: { IMMEDIATE: 'immediate', DEBOUNCED: 'debounced' }
}));

import {
  projectionActions,
  getProjectionState
} from '$lib/features/step-toolbar/tools/projections/projection.store.svelte';

describe('projection store — core actions', () => {
  beforeEach(() => {
    projectionActions.reset();
  });

  it('setSelected updates the selected projection', () => {
    projectionActions.setSelected('robinson');
    expect(getProjectionState().selected).toBe('robinson');
  });

  it('toggleSelected resets to default when already selected', () => {
    projectionActions.setSelected('robinson');
    projectionActions.toggleSelected('robinson');
    expect(getProjectionState().selected).toBe('mercator');
  });

  it('toggleSelected selects when different projection is active', () => {
    projectionActions.setSelected('mercator');
    projectionActions.toggleSelected('robinson');
    expect(getProjectionState().selected).toBe('robinson');
  });

  it('setCustomCode stores the CRS code', () => {
    projectionActions.setCustomCode('+proj=robin');
    expect(getProjectionState().customCode).toBe('+proj=robin');
  });

  it('setCustomCode stores code without touching selection', () => {
    projectionActions.setSelected('mercator');
    projectionActions.setCustomCode('+proj=robin');
    expect(getProjectionState().selected).toBe('mercator');
    expect(getProjectionState().customCode).toBe('+proj=robin');
  });

  it('setCenter updates longitude and latitude', () => {
    projectionActions.setCenter(10, 45);
    expect(getProjectionState().longitude).toBe(10);
    expect(getProjectionState().latitude).toBe(45);
  });

  it('setRotation updates rotation', () => {
    projectionActions.setRotation(30);
    expect(getProjectionState().rotation).toBe(30);
  });

  it('reset restores default state', () => {
    projectionActions.setSelected('robinson');
    projectionActions.setCustomCode('+proj=robin');
    projectionActions.setCenter(10, 45);
    projectionActions.setRotation(30);

    projectionActions.reset();

    const state = getProjectionState();
    expect(state.selected).toBe('mercator');
    expect(state.customCode).toBeUndefined();
    expect(state.longitude).toBe(0);
    expect(state.latitude).toBe(0);
    expect(state.rotation).toBe(0);
  });
});
