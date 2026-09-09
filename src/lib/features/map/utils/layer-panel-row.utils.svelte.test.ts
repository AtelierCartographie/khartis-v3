import { describe, expect, it } from 'vitest';
import {
  classifyThematicLayerPrimitive,
  computeDefaultLayerOrder,
  mergeLayerOrder,
  shouldRenderDeckBelowTiledLabels,
  TILED_BASEMAP_LABELS_ROW_ID,
  type LayerOrderRow
} from './layer-panel-row.utils';
import { PrimitiveFilterType } from '$lib/features/commons/stores/visualization.store.svelte';

const { TEXT, POINT, LINE, POLYGON } = PrimitiveFilterType;

function vizRow(vizId: string, primitive: PrimitiveFilterType): LayerOrderRow {
  return {
    id: `${vizId}::${primitive}`,
    kind: 'viz-primitive',
    primitive,
    parentId: vizId
  };
}

function basemapRow(
  id: string,
  group: 'foreground' | 'background',
  belowThematic = false
): LayerOrderRow {
  return {
    id,
    kind: 'basemap-aux',
    basemapRenderGroup: group,
    basemapRenderBelowThematic: belowThematic
  };
}

describe('computeDefaultLayerOrder', () => {
  it('reproduces the canonical hierarchy: markers → below-thematic basemap → polygons → background', () => {
    const rows: LayerOrderRow[] = [
      // deliberately shuffled input
      basemapRow('basemap::terre', 'background'),
      vizRow('v', POLYGON),
      vizRow('v', POINT),
      basemapRow('basemap::villes-labels', 'foreground'),
      vizRow('v', TEXT),
      basemapRow('basemap::frontieres', 'foreground', true),
      vizRow('v', LINE)
    ];

    expect(computeDefaultLayerOrder(rows, ['v'])).toEqual([
      'basemap::villes-labels', // foreground, above thematic
      'v::text',
      'v::point',
      'v::line',
      'basemap::frontieres', // foreground, below thematic
      'v::polygon',
      'basemap::terre' // background
    ]);
  });

  it('places a freshly created visualization on top within each primitive band (readability bonus)', () => {
    // Creation order A then B: B is the newest and must read in front.
    const rows = [vizRow('A', POLYGON), vizRow('B', POLYGON)];
    expect(computeDefaultLayerOrder(rows, ['A', 'B'])).toEqual([
      'B::polygon',
      'A::polygon'
    ]);
  });

  it('keeps newest-on-top per band across multiple primitives and visualizations', () => {
    const rows = [
      vizRow('A', POINT),
      vizRow('B', POINT),
      vizRow('A', POLYGON),
      vizRow('B', POLYGON)
    ];
    expect(computeDefaultLayerOrder(rows, ['A', 'B'])).toEqual([
      'B::point',
      'A::point',
      'B::polygon',
      'A::polygon'
    ]);
  });
});

describe('mergeLayerOrder', () => {
  const rows = [vizRow('v', POINT), vizRow('v', POLYGON)];

  it('honours a manual drag verbatim — polygon dragged BELOW the symbol stays there', () => {
    expect(mergeLayerOrder(rows, ['v::point', 'v::polygon'], ['v'])).toEqual([
      'v::point',
      'v::polygon'
    ]);
  });

  it('honours the opposite drag too — polygon ABOVE the symbol (symmetric freedom)', () => {
    expect(mergeLayerOrder(rows, ['v::polygon', 'v::point'], ['v'])).toEqual([
      'v::polygon',
      'v::point'
    ]);
  });

  it('falls back to the default order when nothing is persisted', () => {
    // No drags yet → canonical default (symbol over polygon).
    expect(mergeLayerOrder(rows, [], ['v'])).toEqual([
      'v::point',
      'v::polygon'
    ]);
  });

  it('drops stale ids and splices unseen rows at their default slot', () => {
    const live = [vizRow('v', TEXT), vizRow('v', POINT), vizRow('v', POLYGON)];
    // 'gone::polygon' no longer exists; 'v::text' was never dragged.
    const persisted = ['gone::polygon', 'v::point', 'v::polygon'];
    expect(mergeLayerOrder(live, persisted, ['v'])).toEqual([
      'v::text', // unseen → inserted at its default (top) slot
      'v::point',
      'v::polygon'
    ]);
  });

  it('inserts a newly added visualization on top of the existing one by default', () => {
    // 'A' is dragged/persisted; 'B' (newer) is added and unseen.
    const live = [vizRow('A', POLYGON), vizRow('B', POLYGON)];
    const persisted = ['A::polygon'];
    expect(mergeLayerOrder(live, persisted, ['A', 'B'])).toEqual([
      'B::polygon', // newest splices in front of the kept row
      'A::polygon'
    ]);
  });
});

describe('classifyThematicLayerPrimitive', () => {
  it('maps deck layer id prefixes to panel primitives (both text overlays → TEXT)', () => {
    expect(classifyThematicLayerPrimitive('text-layer-viz1')).toBe(TEXT);
    expect(classifyThematicLayerPrimitive('label-layer-viz1')).toBe(TEXT);
    expect(classifyThematicLayerPrimitive('point-layer-viz1')).toBe(POINT);
    expect(classifyThematicLayerPrimitive('line-layer-viz1')).toBe(LINE);
    expect(classifyThematicLayerPrimitive('polygon-layer-viz1')).toBe(POLYGON);
  });

  it('returns null for ids that carry no primitive (GeoJSON fallback, basemap)', () => {
    expect(classifyThematicLayerPrimitive('geojson-layer-viz1')).toBeNull();
    expect(classifyThematicLayerPrimitive('basemap-terre')).toBeNull();
  });
});

describe('shouldRenderDeckBelowTiledLabels', () => {
  it('keeps the labels on top while the order has never seen that row', () => {
    expect(shouldRenderDeckBelowTiledLabels([])).toBe(true);
    expect(shouldRenderDeckBelowTiledLabels(['v::polygon'])).toBe(true);
  });

  it('draws the deck stack under the labels when they sit above the viz rows', () => {
    expect(
      shouldRenderDeckBelowTiledLabels([
        TILED_BASEMAP_LABELS_ROW_ID,
        'v::point',
        'basemap::tiled-basemap::streets'
      ])
    ).toBe(true);
  });

  it('draws the deck stack over the whole style once the labels are dragged below a viz row', () => {
    expect(
      shouldRenderDeckBelowTiledLabels([
        'v::point',
        TILED_BASEMAP_LABELS_ROW_ID,
        'basemap::tiled-basemap::streets'
      ])
    ).toBe(false);
  });
});
