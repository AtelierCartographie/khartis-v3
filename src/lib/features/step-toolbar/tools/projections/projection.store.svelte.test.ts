import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const suggestionResult = {
    national: [],
    generic: [
      {
        id: 'mercator',
        name: 'Mercator',
        type: 'generic',
        proj4String: '+proj=merc',
        d3Config: null,
        bbox: [0, 0, 1, 1]
      }
    ]
  };

  return {
    notifyChangeMock: vi.fn(),
    suggestionResult,
    suggestProjectionsForBboxMock: vi.fn(() => suggestionResult),
    suggestProjectionsForFeatureBoundsMock: vi.fn(),
    resolveProjectionSuggestionBoundsFromBasemapMock: vi.fn(
      () => [0, 0, 1, 1] as [number, number, number, number]
    ),
    supportsProjectionSuggestionsMock: vi.fn(() => true),
    supportsCustomProjectionCodeMock: vi.fn(() => true),
    resolveProjectionAvailabilityContextMock: vi.fn(() => ({})),
    setProjectionMock: vi.fn(),
    setProjectionViewModeMock: vi.fn()
  };
});

vi.mock('$lib/features/project-management/core', () => ({
  SavePriority: {
    IMMEDIATE: 'immediate',
    DEBOUNCED: 'debounced'
  },
  persistenceRegistry: {
    register: vi.fn(),
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('./projection-suggest.service', () => ({
  suggestProjectionsForBbox: mocks.suggestProjectionsForBboxMock,
  suggestProjectionsForFeatureBounds:
    mocks.suggestProjectionsForFeatureBoundsMock,
  buildProjectionFromSuggestion: vi.fn()
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: vi.fn(),
    getGeometryPerFeatureBounds: vi.fn(),
    getGPSBounds: vi.fn(),
    getGeometryExtent: vi.fn()
  }
}));

vi.mock('$lib/features/map/utils/dataset-crs.utils', () => ({
  canUseBoundsForProjectionSuggestion: vi.fn(() => true)
}));

vi.mock('$lib/features/map/utils/projection-availability.utils', () => ({
  resolveProjectionAvailabilityContext:
    mocks.resolveProjectionAvailabilityContextMock,
  resolveProjectionSuggestionBoundsFromBasemap:
    mocks.resolveProjectionSuggestionBoundsFromBasemapMock,
  supportsCustomProjectionCode: mocks.supportsCustomProjectionCodeMock,
  supportsProjectionSuggestions: mocks.supportsProjectionSuggestionsMock
}));

vi.mock('$lib/features/map/utils/user-projection.utils', () => ({
  getCompositeProjectionSelectionId: vi.fn((id: string) => id),
  usesMercatorMapProjection: vi.fn(() => true)
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    selectedDataset: null,
    enabledDatasets: [],
    datasets: [],
    getDatasetsByType: vi.fn(() => [])
  }
}));

vi.mock('$lib/features/commons/stores/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    requiresMapLibre: false,
    selectedStyle: null,
    preferredTiledStyle: null,
    referenceBasemapId: null
  }
}));

vi.mock('$lib/features/commons/stores/global.svelte', () => ({
  globalActions: {
    setProjectionViewMode: mocks.setProjectionViewModeMock
  }
}));

vi.mock('$lib/features/commons/utils/projection.utils', () => ({
  getProjectionById: vi.fn(() => undefined)
}));

vi.mock('$lib/features/map', () => ({
  basemapService: {
    currentMetadata: null,
    projectionPresets: []
  },
  mapProjectionStore: {
    setProjection: mocks.setProjectionMock
  },
  osmBasemapStore: {
    isActive: false,
    activeOSMBasemap: null
  },
  projectionStore: {
    isProjectedCoordinates: false,
    referenceBbox: null
  }
}));

import {
  getProjectionState,
  projectionActions
} from './projection.store.svelte';

describe('projectionActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.suggestProjectionsForBboxMock.mockReturnValue(mocks.suggestionResult);
    mocks.resolveProjectionSuggestionBoundsFromBasemapMock.mockReturnValue([
      0, 0, 1, 1
    ]);
    mocks.supportsProjectionSuggestionsMock.mockReturnValue(true);
  });

  it('returns the suggestion promise so persistence waits for async completion', async () => {
    const result = projectionActions.suggestProjectionForCurrentData();

    expect(result).toBeInstanceOf(Promise);
    expect(mocks.notifyChangeMock).not.toHaveBeenCalled();

    await result;

    expect(getProjectionState().suggestions).toEqual(mocks.suggestionResult);
    expect(mocks.notifyChangeMock).toHaveBeenCalledWith(
      'projection',
      'debounced'
    );
  });
});
