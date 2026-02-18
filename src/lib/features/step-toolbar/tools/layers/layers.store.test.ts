import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    visualizations: [],
    activeVisualizations: [],
    updateVisualization: vi.fn(),
    removeVisualization: vi.fn(),
    toggleVisualization: vi.fn(),
    togglePrimitiveFilter: vi.fn(),
    setVisualizationOrder: vi.fn(),
    duplicateVisualization: vi.fn()
  },
  ALL_PRIMITIVE_FILTERS: ['point', 'line', 'polygon'],
  PrimitiveFilterType: {
    POINT: 'point',
    LINE: 'line',
    POLYGON: 'polygon'
  }
}));

vi.mock('$lib/features/map/stores/basemap-layers.store.svelte', () => ({
  basemapLayersStore: {
    layers: [
      { id: 'mers', visible: true, opacity: 100 },
      { id: 'terre', visible: true, opacity: 100 },
      { id: 'frontieres', visible: true, thickness: 1, color: '#333333' }
    ],
    setLayerVisibility: vi.fn(),
    setLayerOrder: vi.fn()
  },
  BASEMAP_LAYER_ID: {
    TERRE: 'terre',
    MERS: 'mers',
    LACS: 'lacs',
    RIVIERES: 'rivieres',
    RELIEF: 'relief',
    EQUATEUR: 'equateur',
    MERIDIENS: 'meridiens',
    FRONTIERES: 'frontieres',
    VILLES: 'villes'
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

describe('layers.store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has layers array', async () => {
      const { layersState } = await import('./layers.store.svelte');
      expect(Array.isArray(layersState.layers)).toBe(true);
    });
  });

  describe('syncWithVisualizations', () => {
    it('builds layers from basemap when no visualizations', async () => {
      const { layersState, layersActions } =
        await import('./layers.store.svelte');

      layersActions.syncWithVisualizations();

      expect(layersState.layers.length).toBeGreaterThan(0);
      const geographicLayers = layersState.layers.filter(
        (l) => l.type === 'geographic'
      );
      expect(geographicLayers.length).toBeGreaterThan(0);
    });
  });

  describe('toggleLayerVisibility', () => {
    it('calls basemapLayersStore.setLayerVisibility for geographic layers', async () => {
      const { layersState, layersActions } =
        await import('./layers.store.svelte');
      const { basemapLayersStore } =
        await import('$lib/features/map/stores/basemap-layers.store.svelte');

      layersActions.syncWithVisualizations();

      const geoLayer = layersState.layers.find((l) => l.type === 'geographic');
      if (geoLayer) {
        layersActions.toggleLayerVisibility(geoLayer.id);
        expect(basemapLayersStore.setLayerVisibility).toHaveBeenCalled();
      }
    });
  });

  describe('reorderLayers', () => {
    it('calls basemapLayersStore.setLayerOrder for geographic type', async () => {
      const { layersActions } = await import('./layers.store.svelte');
      const { basemapLayersStore } =
        await import('$lib/features/map/stores/basemap-layers.store.svelte');

      layersActions.syncWithVisualizations();
      layersActions.reorderLayers('geographic', 0, 1);

      expect(basemapLayersStore.setLayerOrder).toHaveBeenCalled();
    });
  });

  describe('duplicateLayer', () => {
    it('returns null for non-existent layer', async () => {
      const { layersActions } = await import('./layers.store.svelte');

      const result = layersActions.duplicateLayer('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('removeLayer', () => {
    it('does nothing for non-existent layer', async () => {
      const { layersActions } = await import('./layers.store.svelte');
      const { visualizationStore } =
        await import('$lib/features/commons/store/visualization.store.svelte');

      layersActions.removeLayer('non-existent');

      expect(visualizationStore.removeVisualization).not.toHaveBeenCalled();
    });
  });
});
