import type { Layer } from '@deck.gl/core';
import { describe, expect, it } from 'vitest';
import { getMapLayerRenderOrder } from './layer-order.utils';

function makeLayer(id: string): Layer {
  return { id } as unknown as Layer;
}

describe('getMapLayerRenderOrder', () => {
  it('keeps non-text thematic layers above basemap background but below the foreground frontiers', () => {
    const polygonFill = makeLayer('polygon-layer-viz1');
    const polygonStroke = makeLayer('polygon-layer-viz1-stroke-solid');
    const pointCentroid = makeLayer('point-layer-viz1-centroids');
    const result = getMapLayerRenderOrder({
      basemapBackgroundLayers: [makeLayer('basemap-terre')],
      thematicLayers: [polygonFill, polygonStroke, pointCentroid],
      basemapForegroundLayers: [makeLayer('basemap-frontieres')]
    });

    expect(result.map((layer) => layer.id)).toEqual([
      'basemap-terre',
      'polygon-layer-viz1',
      'polygon-layer-viz1-stroke-solid',
      'point-layer-viz1-centroids',
      'basemap-frontieres'
    ]);
  });

  it('preserves the position of thematic TextLayers inside the thematic block so primitiveOrder controls Z-stack', () => {
    const polygonFill = makeLayer('polygon-layer-viz1');
    const textLayer = makeLayer('text-layer-viz1');
    const labelLayer = makeLayer('label-layer-viz1');
    const result = getMapLayerRenderOrder({
      basemapBackgroundLayers: [makeLayer('basemap-terre')],
      thematicLayers: [textLayer, labelLayer, polygonFill],
      basemapForegroundLayers: [
        makeLayer('basemap-frontieres'),
        makeLayer('basemap-villes-labels')
      ]
    });

    expect(result.map((layer) => layer.id)).toEqual([
      'basemap-terre',
      'text-layer-viz1',
      'label-layer-viz1',
      'polygon-layer-viz1',
      'basemap-frontieres',
      'basemap-villes-labels'
    ]);
  });

  it('keeps every layer in the same input order when no basemap layers are provided', () => {
    const labelA = makeLayer('label-layer-vizA');
    const textA = makeLayer('text-layer-vizA');
    const labelB = makeLayer('label-layer-vizB');
    const textB = makeLayer('text-layer-vizB');
    const result = getMapLayerRenderOrder({
      basemapBackgroundLayers: [],
      thematicLayers: [labelA, textA, labelB, textB],
      basemapForegroundLayers: []
    });

    expect(result.map((layer) => layer.id)).toEqual([
      'label-layer-vizA',
      'text-layer-vizA',
      'label-layer-vizB',
      'text-layer-vizB'
    ]);
  });

  it('keeps basemap foreground helpers (e.g. basemap-villes-labels) in the foreground segment', () => {
    const villesLabels = makeLayer('basemap-villes-labels');
    const textLayer = makeLayer('text-layer-vizA');
    const result = getMapLayerRenderOrder({
      basemapBackgroundLayers: [],
      thematicLayers: [textLayer],
      basemapForegroundLayers: [villesLabels]
    });

    expect(result.map((layer) => layer.id)).toEqual([
      'text-layer-vizA',
      'basemap-villes-labels'
    ]);
  });
});
