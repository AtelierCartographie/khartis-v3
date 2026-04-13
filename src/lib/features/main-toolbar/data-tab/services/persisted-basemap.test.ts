import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setBasemapJoinStateMock: vi.fn(),
  setReferenceBasemapMock: vi.fn(),
  addCustomBasemapMock: vi.fn(),
  getBasemapByIdMock: vi.fn(),
  registerCustomBasemapMetadataMock: vi.fn(),
  setOSMBasemapMock: vi.fn(),
  clearOsmMock: vi.fn()
}));

vi.mock('$lib/features/commons/store/data-tab.store.svelte', () => ({
  dataTabActions: {
    setBasemapJoinState: (updates: unknown) =>
      mocks.setBasemapJoinStateMock(updates)
  }
}));

vi.mock('$lib/features/commons/store/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    setReferenceBasemap: (value: string | null) =>
      mocks.setReferenceBasemapMock(value)
  }
}));

vi.mock('$lib/features/map/services/basemap-catalog.service.svelte', () => ({
  basemapCatalogService: {
    addCustomBasemap: (value: unknown) => mocks.addCustomBasemapMock(value),
    getBasemapById: (value: string) => mocks.getBasemapByIdMock(value)
  }
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    registerCustomBasemapMetadata: (value: unknown) =>
      mocks.registerCustomBasemapMetadataMock(value)
  }
}));

vi.mock('$lib/features/map/stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: {
    setOSMBasemap: (value: unknown) => mocks.setOSMBasemapMock(value),
    clear: () => mocks.clearOsmMock()
  }
}));

import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
import {
  resolveRelevantPersistedBasemap,
  restorePersistedBasemapSelection,
  resolveBasemapSource
} from './persisted-basemap';

describe('restorePersistedBasemapSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBasemapByIdMock.mockReturnValue(undefined);
  });

  it('restores an OSM basemap with the correct source and style state', async () => {
    const basemap = {
      id: 'osm_standard_123',
      type: 'osm' as const,
      data: {
        file: 'osm_standard_123',
        title_fr: 'OSM',
        title_en: 'OSM',
        source: 'osm',
        date: '2026-04-12',
        proj_source: 'EPSG:3857',
        bbox: [0, 0, 1, 1],
        layers: []
      }
    };

    await restorePersistedBasemapSelection(basemap);

    expect(resolveBasemapSource(basemap.type)).toBe(BasemapSource.OSM);
    expect(mocks.setBasemapJoinStateMock).toHaveBeenCalledWith({
      selectedBasemap: 'osm_standard_123',
      basemapSource: BasemapSource.OSM
    });
    expect(mocks.setReferenceBasemapMock).toHaveBeenCalledWith(null);
    expect(mocks.addCustomBasemapMock).toHaveBeenCalledTimes(1);
    expect(mocks.setOSMBasemapMock).toHaveBeenCalledTimes(1);
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
