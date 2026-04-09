import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolbarState, ToolbarStep } from '$lib/features/commons/types/global';
import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';

const serializeAllMock = vi.hoisted(() => vi.fn());
const resetAllMock = vi.hoisted(() => vi.fn());
const deserializeAllMock = vi.hoisted(() => vi.fn());
const markCleanMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/features/commons/store/data-tab.store.svelte', () => ({
  dataTabState: {
    basemapJoin: {
      selectedBasemap: undefined
    },
    geolocation: {
      latitudeColumn: undefined,
      longitudeColumn: undefined,
      linkedVariableName: undefined
    }
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    selectedDataset: undefined
  }
}));

vi.mock('$lib/features/commons/utils/clone-for-storage.utils', () => ({
  deepCloneForStorage: vi.fn((value: unknown) => value)
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    PROJECT: 'PROJECT',
    PERSISTENCE: 'PERSISTENCE',
    DUCKDB: 'DUCKDB'
  },
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/persisted-join-state.utils', () => ({
  resolvePersistedJoinState: vi.fn(() => ({}))
}));

vi.mock('$lib/features/commons/utils/sanitize.utils', () => ({
  escapeSqlString: vi.fn((value: string) => value)
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: null
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    waitForInitialization: vi.fn()
  }
}));

vi.mock('$lib/features/map/services', () => ({
  basemapCatalogService: {
    basemaps: [],
    addCustomBasemap: vi.fn()
  }
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  persistenceRegistry: {
    serializeAll: serializeAllMock,
    resetAll: resetAllMock,
    deserializeAll: deserializeAllMock,
    markClean: markCleanMock
  }
}));

describe('project serializer ui settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps registry ui settings and basemap style extensions into project data', async () => {
    serializeAllMock.mockReturnValue({
      basemapLayers: [{ id: 'base-layer' }],
      basemapStyle: {
        style: 'blank-white',
        referenceBasemapId: 'monde-countries-2024-medium',
        showLabels: false,
        groupVisibility: { labels: false }
      },
      mapProjection: 'mercator',
      mapViewState: {
        zoom: 2,
        target: [0, 0, 0]
      },
      visualization: {
        visualizations: [],
        activeVisualizationIds: []
      },
      format: { orientation: 'portrait' },
      annotations: { visible: true, items: [], activeType: 'text' },
      legend: { items: [], visible: true },
      geoIndications: { enabled: false },
      projection: { selected: 'mercator' },
      globalUi: {
        selectedStep: 'data',
        toolbarState: 'full',
        pageZoomLevel: 100,
        pagePanOffset: { x: 0, y: 0 }
      },
      zoomMode: 'page',
      dataTools: {
        activeTool: 'search',
        searchQuery: 'nuts',
        searchSource: 'all',
        replaceValue: '',
        calculatorName: '',
        calculatorFormula: ''
      }
    });

    const { serializeProjectData } =
      await import('$lib/features/project-management/core/serializer');

    const serialized = await serializeProjectData({});

    expect(serialized?.basemapSettings).toMatchObject({
      style: 'blank-white',
      referenceBasemapId: 'monde-countries-2024-medium',
      showLabels: false,
      groupVisibility: { labels: false },
      mapProjection: 'mercator'
    });
    expect(serialized?.uiSettings).toEqual({
      globalUi: {
        selectedStep: 'data',
        toolbarState: 'full',
        pageZoomLevel: 100,
        pagePanOffset: { x: 0, y: 0 }
      },
      zoomMode: 'page',
      dataTools: {
        activeTool: 'search',
        searchQuery: 'nuts',
        searchSource: 'all',
        replaceValue: '',
        calculatorName: '',
        calculatorFormula: ''
      }
    });
  });

  it('resets stores before restoring ui settings from serialized data', async () => {
    const { deserializeProjectData } =
      await import('$lib/features/project-management/core/serializer');

    await deserializeProjectData({
      basemapSettings: {
        layers: [],
        style: BasemapStyle.BLANK_WHITE,
        mapProjection: 'mercator',
        showLabels: false,
        groupVisibility: { labels: false }
      },
      uiSettings: {
        globalUi: {
          selectedStep: ToolbarStep.Styling,
          toolbarState: ToolbarState.Collapsed,
          pageZoomLevel: 160,
          pagePanOffset: { x: 12, y: -8 }
        },
        zoomMode: 'page'
      }
    });

    expect(resetAllMock).toHaveBeenCalledTimes(1);
    expect(deserializeAllMock).toHaveBeenCalledWith(
      expect.objectContaining({
        basemapStyle: {
          style: 'blank-white',
          referenceBasemapId: undefined,
          showLabels: false,
          groupVisibility: { labels: false }
        },
        globalUi: {
          selectedStep: 'styling',
          toolbarState: 'collapsed',
          pageZoomLevel: 160,
          pagePanOffset: { x: 12, y: -8 }
        },
        zoomMode: 'page'
      })
    );
    expect(resetAllMock.mock.invocationCallOrder[0]).toBeLessThan(
      deserializeAllMock.mock.invocationCallOrder[0]
    );
    expect(markCleanMock).toHaveBeenCalledTimes(1);
  });
});
