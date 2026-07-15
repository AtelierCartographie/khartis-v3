import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  ScaleType: { LINEAR: 'linear', SQRT: 'sqrt', LOG: 'log' }
}));

import {
  withOpacity,
  createCategoricalColorAccessor,
  createProportionalLineWidthAccessor,
  createProportionalSymbolSizeAccessor,
  createClassedSizeAccessor,
  createChoroplethColorAccessor,
  createGeoJsonCategoricalColorAccessor,
  createGeoJsonProportionalSymbolSizeAccessor,
  HIGHLIGHT_FILL_COLOR,
  sortBySizeDescending
} from '$lib/features/map/layers/layer-helpers';
import { ScaleType } from '$lib/features/commons/stores/visualization.store.svelte';

// ─── withOpacity ───────────────────────────────────────────────────────────

describe('withOpacity', () => {
  it('appends 255 alpha for opacity 1', () => {
    expect(withOpacity([255, 0, 0], 1)).toEqual([255, 0, 0, 255]);
  });

  it('appends 0 alpha for opacity 0', () => {
    expect(withOpacity([255, 0, 0], 0)).toEqual([255, 0, 0, 0]);
  });

  it('clamps opacity above 1 to 255 alpha', () => {
    expect(withOpacity([0, 0, 0], 2)).toEqual([0, 0, 0, 255]);
  });

  it('clamps opacity below 0 to 0 alpha', () => {
    expect(withOpacity([0, 0, 0], -1)).toEqual([0, 0, 0, 0]);
  });

  it('rounds alpha correctly for mid-opacity', () => {
    const result = withOpacity([100, 100, 100], 0.5);
    expect(result[3]).toBe(128);
  });

  it('defaults to opacity 1 when not provided', () => {
    expect(withOpacity([10, 20, 30])).toEqual([10, 20, 30, 255]);
  });
});

// ─── createCategoricalColorAccessor ───────────────────────────────────────

describe('createCategoricalColorAccessor', () => {
  const colorMap = new Map<string, [number, number, number]>([
    ['A', [255, 0, 0]],
    ['B', [0, 255, 0]]
  ]);

  it('returns RGBA from colorMap for known category', () => {
    const accessor = createCategoricalColorAccessor('cat', colorMap);
    expect(accessor({ cat: 'A' } as never)).toEqual([255, 0, 0, 255]);
  });

  it('falls back to HIGHLIGHT_FILL_COLOR for unknown category', () => {
    const accessor = createCategoricalColorAccessor('cat', colorMap);
    const result = accessor({ cat: 'UNKNOWN' } as never);
    expect(result).toEqual([
      HIGHLIGHT_FILL_COLOR[0],
      HIGHLIGHT_FILL_COLOR[1],
      HIGHLIGHT_FILL_COLOR[2],
      255
    ]);
  });

  it('falls back when colorMap is null', () => {
    const accessor = createCategoricalColorAccessor('cat', null);
    const result = accessor({ cat: 'A' } as never);
    expect(result).toEqual([
      HIGHLIGHT_FILL_COLOR[0],
      HIGHLIGHT_FILL_COLOR[1],
      HIGHLIGHT_FILL_COLOR[2],
      255
    ]);
  });
});

// ─── createProportionalLineWidthAccessor ──────────────────────────────────

describe('createProportionalLineWidthAccessor', () => {
  const accessor = createProportionalLineWidthAccessor('pop', 0, 100, 50);

  it('scales the width linearly with the value so 50 vs 100 keeps a 1:2 ratio', () => {
    expect(accessor({ pop: 50 } as never)).toBe(25);
    expect(accessor({ pop: 100 } as never)).toBe(50);
  });

  it('returns zero width for zero values instead of a legibility floor', () => {
    expect(accessor({ pop: 0 } as never)).toBe(0);
  });

  it('uses the absolute value for negative flows', () => {
    const crossingAccessor = createProportionalLineWidthAccessor(
      'delta',
      -100,
      50,
      50
    );

    expect(crossingAccessor({ delta: -50 } as never)).toBe(25);
    expect(crossingAccessor({ delta: 50 } as never)).toBe(25);
  });

  it('returns zero for null or non-finite values', () => {
    expect(accessor({ pop: null } as never)).toBe(0);
    expect(accessor({ pop: 'abc' } as never)).toBe(0);
  });
});

describe('createProportionalSymbolSizeAccessor', () => {
  const accessor = createProportionalSymbolSizeAccessor(
    'pop',
    100,
    50,
    ScaleType.SQRT
  );

  it('returns zero for a zero value instead of applying a minimum radius', () => {
    expect(accessor({ pop: 0 } as never)).toBe(0);
  });

  it('uses square-root scaling over a zero-to-max domain', () => {
    expect(accessor({ pop: 25 } as never)).toBeCloseTo(25);
  });

  it('uses the absolute value for negative proportional symbol values', () => {
    expect(accessor({ pop: -25 } as never)).toBeCloseTo(25);
  });

  it('uses min/max magnitudes when the column statistics cross zero', () => {
    const crossingAccessor = createProportionalSymbolSizeAccessor(
      'delta',
      100,
      50,
      ScaleType.SQRT,
      -400
    );

    expect(crossingAccessor({ delta: -100 } as never)).toBeCloseTo(25);
    expect(crossingAccessor({ delta: 100 } as never)).toBeCloseTo(25);
  });

  it('returns zero for null or non-finite values', () => {
    expect(accessor({ pop: null } as never)).toBe(0);
    expect(accessor({ pop: 'abc' } as never)).toBe(0);
  });
});

describe('createGeoJsonProportionalSymbolSizeAccessor', () => {
  const accessor = createGeoJsonProportionalSymbolSizeAccessor(
    'pop',
    100,
    50,
    ScaleType.LINEAR
  );

  it('keeps GeoJSON symbol fallback on the same zero-based proportional contract', () => {
    expect(accessor({ properties: { pop: 0 } })).toBe(0);
    expect(accessor({ properties: { pop: 50 } })).toBe(25);
    expect(accessor({ properties: { pop: -50 } })).toBe(25);
    expect(accessor({ properties: { pop: null } })).toBe(0);
  });
});

// ─── createClassedSizeAccessor ────────────────────────────────────────────

describe('createClassedSizeAccessor', () => {
  const accessor = createClassedSizeAccessor('v', [0, 10, 20], 2, 20);

  it('returns minSize for non-finite value', () => {
    expect(accessor({ v: NaN } as never)).toBe(2);
    expect(accessor({ v: null } as never)).toBe(2);
  });

  it('returns a size in [minSize, maxSize] for valid value', () => {
    const size = accessor({ v: 15 } as never);
    expect(size).toBeGreaterThanOrEqual(2);
    expect(size).toBeLessThanOrEqual(20);
  });
});

// ─── createChoroplethColorAccessor ────────────────────────────────────────

describe('createChoroplethColorAccessor', () => {
  const breaks = [10, 20];
  const colors = ['#ff0000', '#00ff00', '#0000ff'];
  const accessor = createChoroplethColorAccessor('val', breaks, colors);

  it('returns color for value below first break', () => {
    expect(accessor({ val: 5 } as never)).toEqual([255, 0, 0, 255]);
  });

  it('returns last color for value above all breaks', () => {
    expect(accessor({ val: 100 } as never)).toEqual([0, 0, 255, 255]);
  });

  it('returns HIGHLIGHT_FILL_COLOR for null value', () => {
    const result = accessor({ val: null } as never);
    expect(result).toEqual([
      HIGHLIGHT_FILL_COLOR[0],
      HIGHLIGHT_FILL_COLOR[1],
      HIGHLIGHT_FILL_COLOR[2],
      255
    ]);
  });

  it('returns HIGHLIGHT_FILL_COLOR for non-finite value', () => {
    const result = accessor({ val: 'bad' } as never);
    expect(result).toEqual([
      HIGHLIGHT_FILL_COLOR[0],
      HIGHLIGHT_FILL_COLOR[1],
      HIGHLIGHT_FILL_COLOR[2],
      255
    ]);
  });
});

// ─── createGeoJsonCategoricalColorAccessor ────────────────────────────────

describe('createGeoJsonCategoricalColorAccessor', () => {
  const colorMap = new Map<string, [number, number, number]>([
    ['urban', [200, 100, 50]]
  ]);
  const defaultColor: [number, number, number] = [128, 128, 128];
  const accessor = createGeoJsonCategoricalColorAccessor(
    'type',
    colorMap,
    defaultColor
  );

  it('returns mapped color for known category in properties', () => {
    const result = accessor({ properties: { type: 'urban' } });
    expect(result).toEqual([200, 100, 50, 255]);
  });

  it('returns defaultColor for unknown category', () => {
    expect(accessor({ properties: { type: 'rural' } })).toEqual([
      128, 128, 128, 255
    ]);
  });

  it('returns defaultColor for null value', () => {
    expect(accessor({ properties: { type: null } })).toEqual([
      128, 128, 128, 255
    ]);
  });

  it('returns defaultColor for missing properties', () => {
    expect(accessor({})).toEqual([128, 128, 128, 255]);
  });
});

// ─── sortBySizeDescending ─────────────────────────────────────────────────

describe('sortBySizeDescending', () => {
  it('orders items from largest to smallest', () => {
    const items = [
      { id: 'a', size: 5 },
      { id: 'b', size: 12 },
      { id: 'c', size: 1 }
    ];
    const sorted = sortBySizeDescending(items, (item) => item.size);
    expect(sorted.map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });

  it('keeps a stable order for equal sizes', () => {
    const items = [
      { id: 'a', size: 4 },
      { id: 'b', size: 4 },
      { id: 'c', size: 9 },
      { id: 'd', size: 4 }
    ];
    const sorted = sortBySizeDescending(items, (item) => item.size);
    expect(sorted.map((item) => item.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('does not mutate the input array', () => {
    const items = [
      { id: 'a', size: 1 },
      { id: 'b', size: 9 }
    ];
    const snapshot = [...items];
    sortBySizeDescending(items, (item) => item.size);
    expect(items).toEqual(snapshot);
  });

  it('returns an empty array when given an empty input', () => {
    expect(sortBySizeDescending<unknown>([], () => 0)).toEqual([]);
  });
});
