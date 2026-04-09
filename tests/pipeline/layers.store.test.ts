import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  type PrimitiveFilter = 'point' | 'line' | 'polygon';
  type VisualizationStub = {
    id: string;
    name: string;
    style: {
      fillColor?: string;
      fillOpacity?: number;
      lineOpacity?: number;
      lineColor?: string;
      textColor?: string;
      strokeColor?: string;
    };
    primitiveFilters?: PrimitiveFilter[];
    primitiveOrder?: PrimitiveFilter[];
  };
  type BasemapLayerStub = {
    id:
      | 'terre'
      | 'mers'
      | 'lacs'
      | 'rivieres'
      | 'relief'
      | 'equateur'
      | 'meridiens'
      | 'frontieres'
      | 'villes';
    visible: boolean;
    fillOpacity?: number;
    opacity?: number;
  };

  const state = {
    visualizations: [] as VisualizationStub[],
    activeVisualizations: [] as VisualizationStub[],
    basemapLayers: [] as BasemapLayerStub[],
    setVisualizationOrderMock: vi.fn(),
    setPrimitiveFilterOrderMock: vi.fn(),
    togglePrimitiveFilterMock: vi.fn(),
    toggleVisualizationMock: vi.fn(),
    removeVisualizationMock: vi.fn(),
    duplicateVisualizationMock: vi.fn(),
    updateVisualizationMock: vi.fn(),
    setLayerVisibilityMock: vi.fn(),
    setLayerRenderGroupOrderMock: vi.fn(),
    notifyChangeMock: vi.fn()
  };

  return state;
});

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  SavePriority: {
    DEBOUNCED: 'debounced'
  },
  persistenceRegistry: {
    register: vi.fn(),
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('$lib/paraglide/messages', () => ({
  symbols_title: () => 'Symbols',
  lines_title: () => 'Lines',
  polygons_title: () => 'Polygons',
  basemap_layer_terre: () => 'Land',
  basemap_layer_mers: () => 'Seas',
  basemap_layer_lacs: () => 'Lakes',
  basemap_layer_rivieres: () => 'Rivers',
  basemap_layer_relief: () => 'Relief',
  basemap_layer_equateur: () => 'Equator',
  basemap_layer_meridiens: () => 'Meridians',
  basemap_layer_frontieres: () => 'Borders',
  basemap_layer_villes: () => 'Cities'
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  PrimitiveFilterType: {
    POINT: 'point',
    LINE: 'line',
    POLYGON: 'polygon'
  },
  ALL_PRIMITIVE_FILTERS: ['point', 'line', 'polygon'],
  visualizationStore: {
    get visualizations() {
      return mocks.visualizations;
    },
    get activeVisualizations() {
      return mocks.activeVisualizations;
    },
    setVisualizationOrder: mocks.setVisualizationOrderMock,
    setPrimitiveFilterOrder: mocks.setPrimitiveFilterOrderMock,
    togglePrimitiveFilter: mocks.togglePrimitiveFilterMock,
    toggleVisualization: mocks.toggleVisualizationMock,
    removeVisualization: mocks.removeVisualizationMock,
    duplicateVisualization: mocks.duplicateVisualizationMock,
    updateVisualization: mocks.updateVisualizationMock
  }
}));

vi.mock('$lib/features/map/stores/basemap-layers.store.svelte', async () => {
  const actual = await vi.importActual<
    typeof import('$lib/features/map/stores/basemap-layers.store.svelte')
  >('$lib/features/map/stores/basemap-layers.store.svelte');

  return {
    ...actual,
    basemapLayersStore: {
      get layers() {
        return mocks.basemapLayers;
      },
      setLayerVisibility: mocks.setLayerVisibilityMock,
      setLayerRenderGroupOrder: mocks.setLayerRenderGroupOrderMock
    }
  };
});

import {
  layersActions,
  layersState
} from '$lib/features/step-toolbar/tools/layers/layers.store.svelte';

describe('layersActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.visualizations = [];
    mocks.activeVisualizations = [];
    mocks.basemapLayers = [];
    layersActions.syncWithVisualizations();
  });

  it('keeps basemap layers top-level and orders them by actual render domain', () => {
    mocks.visualizations = [
      {
        id: 'viz-a',
        name: 'Visualization A',
        style: {
          fillColor: '#0050b3',
          fillOpacity: 0.7,
          lineOpacity: 0.4
        },
        primitiveFilters: ['point', 'polygon'],
        primitiveOrder: ['point', 'polygon', 'line']
      }
    ];
    mocks.activeVisualizations = [...mocks.visualizations];
    mocks.basemapLayers = [
      { id: 'mers', visible: true, opacity: 45 },
      { id: 'terre', visible: true, fillOpacity: 60 },
      { id: 'frontieres', visible: true, opacity: 80 }
    ];

    layersActions.syncWithVisualizations();

    expect(
      layersState.layers
        .filter((layer) => !layer.isSubLayer)
        .map((layer) => layer.id)
    ).toEqual(['frontieres', 'viz-a', 'mers', 'terre']);

    expect(
      layersState.layers.filter(
        (layer) => layer.type === 'geographic' && layer.isSubLayer
      )
    ).toHaveLength(0);

    expect(
      layersState.layers.find((layer) => layer.id === 'terre')?.opacity
    ).toBe(60);
  });

  it('reorders foreground basemap layers within their render group only', () => {
    mocks.basemapLayers = [
      { id: 'mers', visible: true, opacity: 45 },
      { id: 'frontieres', visible: true, opacity: 80 },
      { id: 'villes', visible: true, opacity: 100 }
    ];

    layersActions.syncWithVisualizations();
    mocks.setLayerRenderGroupOrderMock.mockClear();

    layersActions.reorderLayers('geographic-foreground', 0, 1);

    expect(mocks.setLayerRenderGroupOrderMock).toHaveBeenCalledWith(
      'foreground',
      ['villes', 'frontieres']
    );
  });

  it('reorders visualization primitives without mutating basemap ordering', () => {
    mocks.visualizations = [
      {
        id: 'viz-a',
        name: 'Visualization A',
        style: {
          fillColor: '#0050b3',
          fillOpacity: 0.7,
          lineOpacity: 0.4
        },
        primitiveFilters: ['point', 'line', 'polygon'],
        primitiveOrder: ['point', 'line', 'polygon']
      }
    ];
    mocks.activeVisualizations = [...mocks.visualizations];
    mocks.basemapLayers = [{ id: 'mers', visible: true, opacity: 45 }];

    layersActions.syncWithVisualizations();
    mocks.setPrimitiveFilterOrderMock.mockClear();
    mocks.setLayerRenderGroupOrderMock.mockClear();

    layersActions.reorderSubLayers('viz-a', 0, 2);

    expect(mocks.setPrimitiveFilterOrderMock).toHaveBeenCalledWith('viz-a', [
      'line',
      'polygon',
      'point'
    ]);
    expect(mocks.setLayerRenderGroupOrderMock).not.toHaveBeenCalled();
  });
});
