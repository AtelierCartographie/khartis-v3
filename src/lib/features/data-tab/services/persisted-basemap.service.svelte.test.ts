import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dataTabStateMock: {
    basemapJoin: {
      selectedBasemap: '',
      basemapSource: 'catalog'
    }
  },
  setBasemapJoinStateMock: vi.fn(),
  setReferenceBasemapMock: vi.fn(),
  setStyleMock: vi.fn(),
  requestViewportResetMock: vi.fn(),
  addCustomBasemapMock: vi.fn(),
  getBasemapByIdMock: vi.fn(),
  registerCustomBasemapMetadataMock: vi.fn(),
  setOSMBasemapMock: vi.fn(),
  clearOsmMock: vi.fn(),
  osmDisabledState: { value: false }
}));

vi.mock('$lib/features/commons/stores/data-tab.store.svelte', () => ({
  dataTabState: mocks.dataTabStateMock,
  dataTabActions: {
    setBasemapJoinState: (updates: unknown) =>
      mocks.setBasemapJoinStateMock(updates)
  }
}));

vi.mock('$lib/features/commons/stores/basemap-style.store.svelte', () => ({
  basemapStyleStore: {
    lastSelectedTiledStyle: undefined,
    setReferenceBasemap: (value: string | null) =>
      mocks.setReferenceBasemapMock(value),
    setStyle: (value: unknown) => mocks.setStyleMock(value),
    requestViewportReset: (value: unknown) =>
      mocks.requestViewportResetMock(value)
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
    get isDisabledByUser() {
      return mocks.osmDisabledState.value;
    },
    setOSMBasemap: (value: unknown) => mocks.setOSMBasemapMock(value),
    clear: () => mocks.clearOsmMock()
  }
}));

import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
import {
  resolveRelevantPersistedBasemap,
  restorePersistedBasemapSelection,
  resolveBasemapSource
} from './persisted-basemap.service';

describe('restorePersistedBasemapSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dataTabStateMock.basemapJoin.selectedBasemap = '';
    mocks.dataTabStateMock.basemapJoin.basemapSource = 'catalog';
    mocks.getBasemapByIdMock.mockReturnValue(undefined);
    mocks.osmDisabledState.value = false;
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
    expect(mocks.setStyleMock).toHaveBeenCalledWith('monde-couleurs');
    expect(mocks.requestViewportResetMock).toHaveBeenCalledWith(
      'monde-couleurs'
    );
    expect(mocks.addCustomBasemapMock).toHaveBeenCalledTimes(1);
    expect(mocks.setOSMBasemapMock).toHaveBeenCalledWith(basemap.data);
    expect(mocks.clearOsmMock).not.toHaveBeenCalled();
  });

  it('keeps a persisted OSM basemap hidden when its display was disabled', async () => {
    mocks.osmDisabledState.value = true;
    const basemap = {
      id: 'osm_standard_hidden',
      type: 'osm' as const,
      data: {
        file: 'osm_standard_hidden',
        title_fr: 'OSM',
        title_en: 'OSM',
        source: 'osm',
        date: '2026-08-28',
        proj_source: 'EPSG:3857',
        bbox: [0, 0, 1, 1],
        layers: []
      }
    };

    await restorePersistedBasemapSelection(basemap);

    expect(mocks.setReferenceBasemapMock).toHaveBeenCalledWith(null);
    expect(mocks.addCustomBasemapMock).toHaveBeenCalledWith(basemap.data);
    expect(mocks.setStyleMock).not.toHaveBeenCalled();
    expect(mocks.requestViewportResetMock).not.toHaveBeenCalled();
    expect(mocks.setOSMBasemapMock).not.toHaveBeenCalled();
    expect(mocks.clearOsmMock).not.toHaveBeenCalled();
  });

  it('does not rewrite the basemap join state when the restored selection is already active', async () => {
    mocks.dataTabStateMock.basemapJoin.selectedBasemap =
      'monde-countries-2024-medium';
    mocks.dataTabStateMock.basemapJoin.basemapSource = BasemapSource.CATALOG;

    await restorePersistedBasemapSelection({
      id: 'monde-countries-2024-medium',
      type: 'catalog'
    });

    expect(mocks.setBasemapJoinStateMock).not.toHaveBeenCalled();
    expect(mocks.setReferenceBasemapMock).toHaveBeenCalledWith(
      'monde-countries-2024-medium'
    );
  });

  it('keeps an explicit display reference while restoring the joined basemap selection', async () => {
    await restorePersistedBasemapSelection(
      {
        id: 'monde-countries-2024-medium',
        type: 'catalog'
      },
      { referenceBasemapId: 'europe-nuts1-2024-medium' }
    );

    expect(mocks.setBasemapJoinStateMock).toHaveBeenCalledWith({
      selectedBasemap: 'monde-countries-2024-medium',
      basemapSource: BasemapSource.CATALOG
    });
    expect(mocks.setReferenceBasemapMock).toHaveBeenCalledWith(
      'europe-nuts1-2024-medium'
    );
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
