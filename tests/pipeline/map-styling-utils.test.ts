import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  ScaleType: { LINEAR: 'linear', SQRT: 'sqrt', LOG: 'log' }
}));

import {
  getAbsoluteDomainMax,
  getColorForValue,
  getProportionalSymbolSizeForValue,
  getClassedSizeForValue,
  getCategoricalColorMap
} from '$lib/features/map/utils/data-styling.utils';
import { ScaleType } from '$lib/features/commons/stores/visualization.store.svelte';

// ─── getColorForValue ──────────────────────────────────────────────────────

describe('getColorForValue — n+1 colors for n internal breaks', () => {
  const breaks = [10, 20, 30];
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffffff'];

  it('returns first color for value below first break', () => {
    expect(getColorForValue(5, breaks, colors)).toEqual([255, 0, 0]);
  });

  it('returns middle color for value in middle class', () => {
    expect(getColorForValue(15, breaks, colors)).toEqual([0, 255, 0]);
  });

  it('returns last color for value above all breaks', () => {
    expect(getColorForValue(100, breaks, colors)).toEqual([255, 255, 255]);
  });

  it('returns fallback gray when colors array is empty', () => {
    expect(getColorForValue(5, [10], [])).toEqual([128, 128, 128]);
  });

  it('returns fallback gray when classification arrays are missing', () => {
    expect(getColorForValue(5, undefined, ['#ff0000'])).toEqual([
      128, 128, 128
    ]);
    expect(getColorForValue(5, [10], undefined)).toEqual([128, 128, 128]);
  });
});

describe('getColorForValue — n colors for n breaks (legacy lower-bounds path)', () => {
  const breaks = [0, 10, 20];
  const colors = ['#ff0000', '#00ff00', '#0000ff'];

  it('matches value to first lower-bound', () => {
    expect(getColorForValue(5, breaks, colors)).toEqual([255, 0, 0]);
  });

  it('matches value to last lower-bound when at top', () => {
    expect(getColorForValue(25, breaks, colors)).toEqual([0, 0, 255]);
  });
});

describe('getProportionalSymbolSizeForValue', () => {
  it('uses a zero-based square-root domain for circular proportional symbols', () => {
    expect(getProportionalSymbolSizeForValue(0, 100, 40, ScaleType.SQRT)).toBe(
      0
    );
    expect(
      getProportionalSymbolSizeForValue(25, 100, 40, ScaleType.SQRT)
    ).toBeCloseTo(20);
    expect(
      getProportionalSymbolSizeForValue(100, 100, 40, ScaleType.SQRT)
    ).toBe(40);
  });

  it('keeps bar and spike symbols on a zero-based linear scale', () => {
    expect(
      getProportionalSymbolSizeForValue(25, 100, 40, ScaleType.LINEAR)
    ).toBe(10);
  });

  it('uses absolute values for negative proportional symbols', () => {
    expect(
      getProportionalSymbolSizeForValue(-25, 100, 40, ScaleType.SQRT)
    ).toBeCloseTo(20);
    expect(
      getProportionalSymbolSizeForValue(-50, -100, 40, ScaleType.LINEAR)
    ).toBe(20);
  });

  it('returns zero for absent or unusable proportional values', () => {
    expect(
      getProportionalSymbolSizeForValue(Number.NaN, 100, 40, ScaleType.SQRT)
    ).toBe(0);
    expect(getProportionalSymbolSizeForValue(10, 0, 40, ScaleType.SQRT)).toBe(
      0
    );
  });
});

describe('getAbsoluteDomainMax', () => {
  it('uses the largest magnitude from min/max statistics', () => {
    expect(getAbsoluteDomainMax(-500, 100)).toBe(500);
    expect(getAbsoluteDomainMax(-500, -1)).toBe(500);
    expect(getAbsoluteDomainMax(0, 100)).toBe(100);
  });
});

// ─── getClassedSizeForValue ────────────────────────────────────────────────

describe('getClassedSizeForValue', () => {
  it('returns minSize when breaks has fewer than 2 elements', () => {
    expect(getClassedSizeForValue(5, [10], 2, 20)).toBe(2);
    expect(getClassedSizeForValue(5, [], 2, 20)).toBe(2);
  });

  it('returns minSize for non-finite value', () => {
    expect(getClassedSizeForValue(NaN, [0, 10, 20], 2, 20)).toBe(2);
    expect(getClassedSizeForValue(Infinity, [0, 10, 20], 2, 20)).toBe(2);
  });

  it('assigns first class size for value below first break (threshold-hint path)', () => {
    const size = getClassedSizeForValue(5, [10, 20, 30], 2, 10, 4);
    expect(size).toBe(2);
  });

  it('assigns last class size for value above all breaks (threshold-hint path)', () => {
    const size = getClassedSizeForValue(100, [10, 20, 30], 2, 20, 4);
    expect(size).toBe(20);
  });
});

// ─── getCategoricalColorMap ────────────────────────────────────────────────

describe('getCategoricalColorMap', () => {
  it('maps each category to a color', () => {
    const map = getCategoricalColorMap(
      ['A', 'B', 'C'],
      ['#ff0000', '#00ff00', '#0000ff']
    );
    expect(map.get('A')).toEqual([255, 0, 0]);
    expect(map.get('B')).toEqual([0, 255, 0]);
    expect(map.get('C')).toEqual([0, 0, 255]);
  });

  it('cycles colors when more categories than colors', () => {
    const map = getCategoricalColorMap(['A', 'B', 'C'], ['#ff0000', '#00ff00']);
    expect(map.get('A')).toEqual([255, 0, 0]);
    expect(map.get('B')).toEqual([0, 255, 0]);
    expect(map.get('C')).toEqual([255, 0, 0]);
  });
});
