import { describe, expect, it } from 'vitest';
import type { Layer } from '@deck.gl/core';
import {
  getMapLayerRenderOrder,
  getThematicLayerRenderOrder,
  getVisualizationRenderOrder
} from '$lib/features/map/utils/layer-order.utils';
import { resolveProjectionForRender } from '$lib/features/map/utils/projection-priority';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { ProjectionLike } from 'geoarrow-deck-stream';

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

type ProjectionStub = ProjectionLike & { id: string };

function createProjectionStub(id: string): ProjectionStub {
  return Object.assign((coordinates: [number, number]) => coordinates, {
    id,
    stream: <T>(sink: T) => sink
  });
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
