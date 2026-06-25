import type { Layer } from '@deck.gl/core';
import { describe, expect, it } from 'vitest';
import { applyPanelRenderOrder } from './layer-order.utils';

function makeLayer(id: string, rowId?: string): Layer {
  return { id, rowId } as unknown as Layer;
}

const rowIdForLayer = (layer: Layer): string | null =>
  (layer as unknown as { rowId?: string }).rowId ?? null;

describe('applyPanelRenderOrder', () => {
  it('draws the GPU array as the reverse of the flat panel (top of panel = front = drawn last)', () => {
    const layers = [
      makeLayer('basemap-terre', 'basemap::terre'),
      makeLayer('polygon-layer-viz1', 'viz1::polygon'),
      makeLayer('point-layer-viz1', 'viz1::point')
    ];
    // Panel top→bottom: symbol (front), polygon, basemap (back).
    const result = applyPanelRenderOrder(
      layers,
      ['viz1::point', 'viz1::polygon', 'basemap::terre'],
      rowIdForLayer
    );
    expect(result.map((l) => l.id)).toEqual([
      'basemap-terre',
      'polygon-layer-viz1',
      'point-layer-viz1'
    ]);
  });

  // The bug the flat order fixes: with the old five-dimension model a polygon
  // could be placed above a symbol but not directly below it. The flat order is
  // symmetric — the panel order alone decides, both directions are reachable.
  it('lets a polygon sit directly BELOW a symbol when the panel says so', () => {
    const layers = [
      makeLayer('point-layer-viz1', 'viz1::point'),
      makeLayer('polygon-layer-viz1', 'viz1::polygon')
    ];
    const result = applyPanelRenderOrder(
      layers,
      ['viz1::point', 'viz1::polygon'],
      rowIdForLayer
    );
    // Symbol in front (drawn last), polygon behind it (drawn first).
    expect(result.map((l) => l.id)).toEqual([
      'polygon-layer-viz1',
      'point-layer-viz1'
    ]);
  });

  it('lets the SAME polygon sit directly ABOVE the symbol when dragged there', () => {
    const layers = [
      makeLayer('point-layer-viz1', 'viz1::point'),
      makeLayer('polygon-layer-viz1', 'viz1::polygon')
    ];
    const result = applyPanelRenderOrder(
      layers,
      ['viz1::polygon', 'viz1::point'],
      rowIdForLayer
    );
    expect(result.map((l) => l.id)).toEqual([
      'point-layer-viz1',
      'polygon-layer-viz1'
    ]);
  });

  it('keeps layers sharing a panel row (fill + stroke) in their incoming sub-stack order', () => {
    const layers = [
      makeLayer('polygon-layer-viz1', 'viz1::polygon'),
      makeLayer('polygon-layer-viz1-stroke-solid', 'viz1::polygon'),
      makeLayer('point-layer-viz1', 'viz1::point')
    ];
    const result = applyPanelRenderOrder(
      layers,
      ['viz1::point', 'viz1::polygon'],
      rowIdForLayer
    );
    expect(result.map((l) => l.id)).toEqual([
      'polygon-layer-viz1',
      'polygon-layer-viz1-stroke-solid',
      'point-layer-viz1'
    ]);
  });

  it('carries an unmapped layer (e.g. GeoJSON fallback) forward on its neighbour rank', () => {
    const layers = [
      makeLayer('polygon-layer-viz1', 'viz1::polygon'),
      makeLayer('geojson-layer-viz1'),
      makeLayer('point-layer-viz1', 'viz1::point')
    ];
    const result = applyPanelRenderOrder(
      layers,
      ['viz1::point', 'viz1::polygon'],
      rowIdForLayer
    );
    expect(result.map((l) => l.id)).toEqual([
      'polygon-layer-viz1',
      'geojson-layer-viz1',
      'point-layer-viz1'
    ]);
  });

  it('keeps every layer in its incoming order when the panel order is empty', () => {
    const layers = [
      makeLayer('a', 'viz1::point'),
      makeLayer('b', 'viz1::polygon')
    ];
    const result = applyPanelRenderOrder(layers, [], rowIdForLayer);
    expect(result.map((l) => l.id)).toEqual(['a', 'b']);
  });
});
