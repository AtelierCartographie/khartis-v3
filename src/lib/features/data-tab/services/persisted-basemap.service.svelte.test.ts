// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBasemapByIdMock: vi.fn()
}));

vi.mock('$lib/features/commons/stores/data-tab.store.svelte', () => ({
  dataTabState: {},
  dataTabActions: {}
}));

vi.mock('$lib/features/commons/stores/basemap-style.store.svelte', () => ({
  basemapStyleStore: {}
}));

vi.mock('$lib/features/map/services/basemap-catalog.service.svelte', () => ({
  basemapCatalogService: {
    getBasemapById: (value: string) => mocks.getBasemapByIdMock(value)
  }
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {}
}));

vi.mock('$lib/features/map/stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: {}
}));

import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
import { resolveRelevantPersistedBasemap } from './persisted-basemap.service';

describe('resolveRelevantPersistedBasemap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBasemapByIdMock.mockReturnValue(undefined);
  });

  it('prefers the selected dataset joined basemap over an unrelated project basemap', () => {
    const resolved = resolveRelevantPersistedBasemap({
      selectedDataset: { sourceFileId: 'tabular-file' },
      sourceFiles: [
        { id: 'geo-file', joinedBasemap: 'osm_standard_123' },
        { id: 'tabular-file', joinedBasemap: 'monde-countries-2024-medium' }
      ],
      projectBasemap: {
        id: 'osm_standard_123',
        type: 'osm',
        data: { file: 'osm_standard_123' }
      },
      hasMultipleDatasets: true
    });

    expect(resolved).toEqual({
      id: 'monde-countries-2024-medium',
      type: 'catalog'
    });
  });

  it('keeps the selected tabular basemap state in a multi-dataset reload when no file-level join is stored yet', () => {
    const resolved = resolveRelevantPersistedBasemap({
      selectedDataset: { sourceFileId: 'tabular-file' },
      sourceFiles: [
        { id: 'geo-file', joinedBasemap: 'osm_standard_123' },
        { id: 'tabular-file' }
      ],
      projectBasemap: {
        id: 'osm_standard_123',
        type: 'osm',
        data: { file: 'osm_standard_123' }
      },
      selectedBasemapId: 'monde-countries-2024-medium',
      selectedBasemapSource: BasemapSource.CATALOG,
      hasMultipleDatasets: true
    });

    expect(resolved).toEqual({
      id: 'monde-countries-2024-medium',
      type: 'catalog'
    });
  });
});
