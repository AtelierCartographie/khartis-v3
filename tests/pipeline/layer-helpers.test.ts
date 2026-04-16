import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  ScaleType: { LINEAR: 'linear', SQRT: 'sqrt', LOG: 'log' }
}));

import {
  withOpacity,
  createCategoricalColorAccessor,
  createProportionalSizeAccessor,
  createClassedSizeAccessor,
  createChoroplethColorAccessor,
  createGeoJsonCategoricalColorAccessor,
  HIGHLIGHT_FILL_COLOR
} from '$lib/features/map/layers/layer-helpers';
import { ScaleType } from '$lib/features/commons/store/visualization.store.svelte';

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

// ─── createProportionalSizeAccessor ───────────────────────────────────────

describe('createProportionalSizeAccessor', () => {
  const accessor = createProportionalSizeAccessor(
    'pop',
    0,
    100,
    5,
    50,
    ScaleType.LINEAR
  );

  it('returns proportional size for numeric value', () => {
    expect(accessor({ pop: 50 } as never)).toBeCloseTo(27.5);
  });

  it('returns minSize for null value', () => {
    expect(accessor({ pop: null } as never)).toBe(5);
  });

  it('returns minSize for non-finite string value', () => {
    expect(accessor({ pop: 'abc' } as never)).toBe(5);
  });

  it('returns maxSize for value at max', () => {
    expect(accessor({ pop: 100 } as never)).toBe(50);
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
