import { describe, expect, it, vi } from 'vitest';
import type { Layer } from '@deck.gl/core';
import type { FeatureCollection } from 'geojson';
import { createGeoJsonLayers } from '$lib/features/map/layers/layer-factory';
import {
  getMapLayerRenderOrder,
  getThematicLayerRenderOrder,
  getVisualizationRenderOrder
} from '$lib/features/map/utils/layer-order.utils';
import { resolveProjectionForRender } from '$lib/features/map/utils/projection-priority';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { LayerContext } from '$lib/features/map/types';
import type { ProjectionLike } from 'geoarrow-deck-stream';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  ALL_PRIMITIVE_FILTERS: ['point', 'line', 'polygon'],
  PrimitiveFilterType: {
    POINT: 'point',
    LINE: 'line',
    POLYGON: 'polygon'
  },
  ScaleType: {
    LINEAR: 'linear',
    SQRT: 'sqrt',
    LOG: 'log'
  },
  VisualizationType: {
    CHOROPLETH: 'choropleth',
    PROPORTIONAL: 'proportional',
    CATEGORICAL: 'categorical',
    BIVARIATE: 'bivariate'
  }
}));

function createVisualizationStub(
  id: string,
  name: string
): VisualizationConfig {
  return {
    id,
    name
  } as VisualizationConfig;
}

function createLayerStub(id: string): Layer {
  return { id } as Layer;
}

function createLayerContextStub(
  overrides: Partial<LayerContext> = {}
): LayerContext {
  return {
    viz: null,
    datasetId: 'ds_test',
    fillColor: [120, 120, 120],
    strokeColor: [255, 255, 255],
    fillOpacity: 1,
    strokeWidth: 1,
    strokeOpacity: 1,
    statistics: { min: 0, max: 100 },
    categoryColorMap: null,
    ...overrides
  };
}

type ProjectionStub = ProjectionLike & { id: string };

function createProjectionStub(id: string): ProjectionStub {
  return Object.assign((coordinates: [number, number]) => coordinates, {
    id,
    stream: <T>(sink: T) => sink
  });
}

function createPolygonGeoJsonFixture(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Alpha' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0]
            ]
          ]
        }
      },
      {
        type: 'Feature',
        properties: { name: 'Beta' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [2, 0],
              [3, 0],
              [3, 1],
              [2, 1],
              [2, 0]
            ]
          ]
        }
      }
    ]
  };
}

describe('getVisualizationRenderOrder', () => {
  it('renders the top layer in the UI above the lower ones', () => {
    const visualizations = [
      createVisualizationStub('viz-top', 'Visualisation'),
      createVisualizationStub('viz-middle', 'Visualisation (1)'),
      createVisualizationStub('viz-bottom', 'Visualisation (2)')
    ];

    const renderOrder = getVisualizationRenderOrder(visualizations);

    expect(renderOrder.map((viz) => viz.id)).toEqual([
      'viz-bottom',
      'viz-middle',
      'viz-top'
    ]);
  });

  it('does not mutate the original visualization order', () => {
    const visualizations = [
      createVisualizationStub('viz-top', 'Visualisation'),
      createVisualizationStub('viz-bottom', 'Visualisation (1)')
    ];

    const renderOrder = getVisualizationRenderOrder(visualizations);

    expect(visualizations.map((viz) => viz.id)).toEqual([
      'viz-top',
      'viz-bottom'
    ]);
    expect(renderOrder).not.toBe(visualizations);
  });
});

describe('getThematicLayerRenderOrder', () => {
  it('preserves the authored order so an upper text visualization can render above lower geometry', () => {
    const layers = [
      createLayerStub('polygon-layer-viz-bottom'),
      createLayerStub('label-layer-viz-bottom'),
      createLayerStub('point-layer-viz-top'),
      createLayerStub('text-layer-viz-top')
    ];

    const renderOrder = getThematicLayerRenderOrder(layers);

    expect(renderOrder.map((layer) => layer.id)).toEqual([
      'polygon-layer-viz-bottom',
      'label-layer-viz-bottom',
      'point-layer-viz-top',
      'text-layer-viz-top'
    ]);
  });

  it('does not mutate the original thematic order', () => {
    const layers = [
      createLayerStub('text-layer-viz-a'),
      createLayerStub('polygon-layer-viz-a'),
      createLayerStub('label-layer-viz-b'),
      createLayerStub('line-layer-viz-b')
    ];

    const renderOrder = getThematicLayerRenderOrder(layers);

    expect(renderOrder.map((layer) => layer.id)).toEqual([
      'text-layer-viz-a',
      'polygon-layer-viz-a',
      'label-layer-viz-b',
      'line-layer-viz-b'
    ]);
    expect(renderOrder).not.toBe(layers);
  });
});

describe('getMapLayerRenderOrder', () => {
  it('keeps basemap background below thematic layers and basemap foreground above them without rewriting thematic stacking', () => {
    const renderOrder = getMapLayerRenderOrder({
      basemapBackgroundLayers: [
        createLayerStub('basemap-mers'),
        createLayerStub('basemap-terre')
      ],
      thematicLayers: [
        createLayerStub('polygon-layer-viz-a'),
        createLayerStub('text-layer-viz-a'),
        createLayerStub('point-layer-viz-b')
      ],
      basemapForegroundLayers: [createLayerStub('basemap-frontieres')]
    });

    expect(renderOrder.map((layer) => layer.id)).toEqual([
      'basemap-mers',
      'basemap-terre',
      'polygon-layer-viz-a',
      'text-layer-viz-a',
      'point-layer-viz-b',
      'basemap-frontieres'
    ]);
  });
});

describe('resolveProjectionForRender', () => {
  it('keeps the basemap metadata projection as the default fallback', () => {
    const metadataProjection = createProjectionStub('france-default');

    expect(resolveProjectionForRender(metadataProjection, undefined)).toBe(
      metadataProjection
    );
  });

  it('keeps the basemap metadata projection authoritative for auto suggestions', () => {
    const metadataProjection = createProjectionStub('world-default');
    const userOverride = createProjectionStub('aitoff');

    expect(
      resolveProjectionForRender(metadataProjection, userOverride, 'auto')
    ).toBe(metadataProjection);
  });

  it('lets an explicit user override take precedence over the basemap metadata', () => {
    const metadataProjection = createProjectionStub('world-default');
    const userOverride = createProjectionStub('aitoff');

    expect(
      resolveProjectionForRender(metadataProjection, userOverride, 'manual')
    ).toBe(userOverride);
  });

  it('falls back to the user override when the basemap has no projection metadata', () => {
    const userOverride = createProjectionStub('aitoff');

    expect(resolveProjectionForRender(undefined, userOverride, 'auto')).toBe(
      userOverride
    );
  });

  it('keeps auto projection suggestions available when no basemap projection exists', () => {
    const userOverride = createProjectionStub('laea-europe');

    expect(
      resolveProjectionForRender(undefined, userOverride, 'auto', false)
    ).toBe(userOverride);
  });

  it('keeps projected datasets in pass-through mode even after a manual override', () => {
    const userOverride = createProjectionStub('mercator');

    expect(
      resolveProjectionForRender(undefined, userOverride, 'manual', false)
    ).toBeUndefined();
  });
});

describe('createGeoJsonLayers', () => {
  it('keeps the default raw polygon GeoJSON path limited to a single base layer', () => {
    const layers = createGeoJsonLayers(
      createPolygonGeoJsonFixture(),
      createLayerContextStub()
    );

    expect(layers).toHaveLength(1);

    const baseLayer = layers[0]!;
    const baseData = baseLayer.props.data as FeatureCollection;

    expect(
      baseData.features.map((feature) => feature.properties?.__id)
    ).toEqual([1, 2]);
    expect(baseLayer.props.getFillColor).toEqual([120, 120, 120, 255]);
    expect(baseLayer.props.autoHighlight).toBe(false);
    expect(baseLayer.props.highlightedObjectIndex).toBe(-1);
  });

  it('adds a persistent overlay when highlighted rows are provided', () => {
    const layers = createGeoJsonLayers(
      createPolygonGeoJsonFixture(),
      createLayerContextStub({
        highlightedRowIds: new Set([2]),
        highlightVersion: 1
      })
    );

    expect(layers).toHaveLength(2);

    const baseLayer = layers[0]!;
    const overlayLayer = layers[1]!;
    const overlayData = overlayLayer.props.data as FeatureCollection;

    expect(baseLayer.props.autoHighlight).toBe(false);
    expect(baseLayer.props.highlightedObjectIndex).toBe(-1);
    expect(overlayLayer.id).toContain('selection-overlay');
    expect(overlayData.features).toHaveLength(1);
    expect(overlayData.features[0]?.properties?.__id).toBe(2);
  });
});
