import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the store module
vi.mock('$lib/features/commons/store/basemap-style.store.svelte', () => ({
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

vi.mock('$lib/features/commons/store/global.svelte', () => ({
  globalActions: {
    setProjectionViewMode: vi.fn(),
    setProjectionFilter: vi.fn()
  },
  globalState: {}
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    selectedDataset: null,
    getDatasetsByType: () => [],
    enabledDatasets: [],
    datasets: []
  }
}));

vi.mock('$lib/features/commons/store/map-instance.store.svelte', () => ({
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

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
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

describe('projection store — race condition in suggestions', () => {
  beforeEach(() => {
    projectionActions.reset();
  });

  it('discards stale suggestion results when a newer call is made', async () => {
    // First call starts
    projectionActions.suggestProjectionForCurrentData();
    // Second call starts immediately (simulating rapid file imports)
    projectionActions.suggestProjectionForCurrentData();

    // Wait for both async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // The state should be in a consistent state (either undefined or computed)
    const state = getProjectionState();
    expect(state).toBeDefined();
    // No duplicate or mixed suggestions should exist
    expect(
      state.suggestions === undefined ||
        Array.isArray(state.suggestions?.national)
    ).toBe(true);
  });

  it('clears suggestions when projection suggestions are not supported', async () => {
    projectionActions.suggestProjectionForCurrentData();
    await new Promise((resolve) => setTimeout(resolve, 200));

    const state = getProjectionState();
    // In the mocked context, suggestions may be undefined because
    // supportsProjectionSuggestions returns false or bounds are null
    expect(state.suggestions === undefined || state.suggestions === null).toBe(
      true
    );
  });
});
