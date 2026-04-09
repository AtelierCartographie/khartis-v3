import { describe, expect, it } from 'vitest';
import type { Layer } from '@deck.gl/core';
import {
  getMapLayerRenderOrder,
  getThematicLayerRenderOrder,
  getVisualizationRenderOrder
} from '$lib/features/map/utils/layer-order.utils';
import { resolveProjectionForRender } from '$lib/features/map/utils/projection-priority';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';

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
  it('keeps text overlays below geometry layers', () => {
    const layers = [
      createLayerStub('polygon-layer-viz-bottom'),
      createLayerStub('text-layer-viz-top'),
      createLayerStub('point-layer-viz-top'),
      createLayerStub('label-layer-viz-bottom')
    ];

    const renderOrder = getThematicLayerRenderOrder(layers);

    expect(renderOrder.map((layer) => layer.id)).toEqual([
      'text-layer-viz-top',
      'label-layer-viz-bottom',
      'polygon-layer-viz-bottom',
      'point-layer-viz-top'
    ]);
  });

  it('preserves relative order inside text and geometry groups', () => {
    const layers = [
      createLayerStub('text-layer-viz-a'),
      createLayerStub('polygon-layer-viz-a'),
      createLayerStub('label-layer-viz-b'),
      createLayerStub('line-layer-viz-b')
    ];

    const renderOrder = getThematicLayerRenderOrder(layers);

    expect(renderOrder.map((layer) => layer.id)).toEqual([
      'text-layer-viz-a',
      'label-layer-viz-b',
      'polygon-layer-viz-a',
      'line-layer-viz-b'
    ]);
  });
});

describe('getMapLayerRenderOrder', () => {
  it('keeps basemap background below text and geometry while preserving basemap foreground above data', () => {
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
      'text-layer-viz-a',
      'polygon-layer-viz-a',
      'point-layer-viz-b',
      'basemap-frontieres'
    ]);
  });
});

describe('resolveProjectionForRender', () => {
  it('keeps the basemap metadata projection as the default fallback', () => {
    const metadataProjection = { id: 'france-default' };

    expect(resolveProjectionForRender(metadataProjection, undefined)).toBe(
      metadataProjection
    );
  });

  it('keeps the basemap metadata projection authoritative for auto suggestions', () => {
    const metadataProjection = { id: 'world-default' };
    const userOverride = { id: 'aitoff' };

    expect(
      resolveProjectionForRender(metadataProjection, userOverride, 'auto')
    ).toBe(metadataProjection);
  });

  it('lets an explicit user override take precedence over the basemap metadata', () => {
    const metadataProjection = { id: 'world-default' };
    const userOverride = { id: 'aitoff' };

    expect(
      resolveProjectionForRender(metadataProjection, userOverride, 'manual')
    ).toBe(userOverride);
  });

  it('falls back to the user override when the basemap has no projection metadata', () => {
    const userOverride = { id: 'aitoff' };

    expect(resolveProjectionForRender(undefined, userOverride, 'auto')).toBe(
      userOverride
    );
  });

  it('keeps projected datasets in pass-through mode even after a manual override', () => {
    const userOverride = { id: 'mercator' };

    expect(
      resolveProjectionForRender(undefined, userOverride, 'manual', false)
    ).toBeUndefined();
  });
});
