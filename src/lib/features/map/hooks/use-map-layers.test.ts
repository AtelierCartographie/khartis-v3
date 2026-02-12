import type { Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { DeckDataRow, LayerContext } from '../types';

const {
  createBasemapLayersMock,
  createDeckLayersMock,
  createGeoJsonLayersMock
} = vi.hoisted(() => ({
  createBasemapLayersMock: vi.fn(),
  createDeckLayersMock: vi.fn(),
  createGeoJsonLayersMock: vi.fn()
}));

vi.mock('../layers', () => ({
  createBasemapLayers: createBasemapLayersMock,
  createDeckLayers: createDeckLayersMock,
  createGeoJsonLayers: createGeoJsonLayersMock
}));

vi.mock('../stores/map-projection.store.svelte', () => ({
  mapProjectionStore: { projection: 'equirectangular' }
}));

vi.mock('../stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: { activeOSMBasemap: null }
}));

vi.mock('../stores/projection.store.svelte', () => ({
  projectionStore: { modelMatrix: null }
}));

vi.mock('../services/basemap.service.svelte', () => ({
  basemapService: {
    lakesData: null,
    riversData: null,
    citiesData: null
  }
}));

vi.mock('../stores/basemap-layers.store.svelte', () => ({
  basemapLayersStore: {
    visibleLayers: [{ id: 'terre' }]
  }
}));

import { useMapLayers } from './use-map-layers.svelte';

function createTestLayer(id: string): Layer<DeckDataRow> {
  return { id } as unknown as Layer<DeckDataRow>;
}

function createRenderableTable(): ArrowTable {
  return {
    schema: {
      metadata: new Map([['geo', 'geo-metadata']])
    },
    numRows: 1
  } as unknown as ArrowTable;
}

describe('useMapLayers empty-stack fallback', () => {
  beforeEach(() => {
    createBasemapLayersMock.mockReset();
    createDeckLayersMock.mockReset();
    createGeoJsonLayersMock.mockReset();
    createBasemapLayersMock.mockReturnValue([]);
    createGeoJsonLayersMock.mockReturnValue([]);
  });

  it('preserves previously rendered layers when a recompute unexpectedly returns empty', () => {
    const setProps = vi.fn();
    const deckOverlay = { setProps } as unknown as MapboxOverlay;
    const activeVisualizations: VisualizationConfig[] = [
      { id: 'viz-1', datasetId: 'dataset-1' } as VisualizationConfig
    ];

    const { updateLayers } = useMapLayers({
      getDeckOverlay: () => deckOverlay,
      getDeckInstance: () => null,
      getMap: () => null,
      getIsMapLoaded: () => true,
      getWorldBaseTable: () => null,
      getActiveVisualizations: () => activeVisualizations,
      buildLayerContextForViz: () => ({}) as LayerContext
    });

    const initialLayer = createTestLayer('initial-layer');
    createDeckLayersMock.mockReturnValueOnce([initialLayer]);

    updateLayers(
      new Map<string, ArrowTable>([['dataset-1', createRenderableTable()]]),
      new Map<string, FeatureCollection>()
    );

    expect(setProps).toHaveBeenLastCalledWith({ layers: [initialLayer] });

    // No data available for this cycle, but the active viz still exists.
    createDeckLayersMock.mockReturnValueOnce([]);
    updateLayers(
      new Map<string, ArrowTable>(),
      new Map<string, FeatureCollection>()
    );

    expect(setProps).toHaveBeenLastCalledWith({ layers: [initialLayer] });

    expect(activeVisualizations).toHaveLength(1);
  });

  it('clears fallback layers when emptiness is expected', () => {
    const setProps = vi.fn();
    const deckOverlay = { setProps } as unknown as MapboxOverlay;
    let activeVisualizations: VisualizationConfig[] = [
      { id: 'viz-1', datasetId: 'dataset-1' } as VisualizationConfig
    ];

    const { updateLayers } = useMapLayers({
      getDeckOverlay: () => deckOverlay,
      getDeckInstance: () => null,
      getMap: () => null,
      getIsMapLoaded: () => true,
      getWorldBaseTable: () => null,
      getActiveVisualizations: () => activeVisualizations,
      buildLayerContextForViz: () => ({}) as LayerContext
    });

    const initialLayer = createTestLayer('initial-layer');
    createDeckLayersMock.mockReturnValueOnce([initialLayer]);
    updateLayers(
      new Map<string, ArrowTable>([['dataset-1', createRenderableTable()]]),
      new Map<string, FeatureCollection>()
    );
    expect(setProps).toHaveBeenLastCalledWith({ layers: [initialLayer] });

    activeVisualizations = [];
    createDeckLayersMock.mockReturnValueOnce([]);
    updateLayers(
      new Map<string, ArrowTable>(),
      new Map<string, FeatureCollection>()
    );
    expect(setProps).toHaveBeenLastCalledWith({ layers: [] });

    // Once cleared in an expected-empty state, fallback should not resurrect stale layers.
    activeVisualizations = [
      { id: 'viz-1', datasetId: 'dataset-1' } as VisualizationConfig
    ];
    createDeckLayersMock.mockReturnValueOnce([]);
    updateLayers(
      new Map<string, ArrowTable>(),
      new Map<string, FeatureCollection>()
    );
    expect(setProps).toHaveBeenLastCalledWith({ layers: [] });
  });

  it('skips layer updates while MapLibre style is reloading', () => {
    const setProps = vi.fn();
    const deckOverlay = { setProps } as unknown as MapboxOverlay;
    const map = {
      isStyleLoaded: () => false
    } as unknown as MapLibreMap;
    const activeVisualizations: VisualizationConfig[] = [
      { id: 'viz-1', datasetId: 'dataset-1' } as VisualizationConfig
    ];

    const { updateLayers } = useMapLayers({
      getDeckOverlay: () => deckOverlay,
      getDeckInstance: () => null,
      getMap: () => map,
      getIsMapLoaded: () => true,
      getWorldBaseTable: () => null,
      getActiveVisualizations: () => activeVisualizations,
      buildLayerContextForViz: () => ({}) as LayerContext
    });

    createDeckLayersMock.mockReturnValueOnce([createTestLayer('layer-1')]);
    updateLayers(
      new Map<string, ArrowTable>([['dataset-1', createRenderableTable()]]),
      new Map<string, FeatureCollection>()
    );

    expect(setProps).not.toHaveBeenCalled();
  });
});
