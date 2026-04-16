import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  VisualizationType: {
    CHOROPLETH: 'choropleth',
    PROPORTIONAL: 'proportional',
    CATEGORICAL: 'categorical',
    BIVARIATE: 'bivariate'
  },
  ScaleType: { LINEAR: 'linear', SQRT: 'sqrt', LOG: 'log' }
}));

import {
  getColorForValue,
  getSizeForValue,
  getClassedSizeForValue,
  getCategoricalColorMap,
  hasCompleteCategoricalColorMap,
  shouldApplyLineCategorical,
  shouldApplyLineChoropleth,
  shouldApplyChoropleth,
  shouldApplyProportionalSymbols,
  shouldApplyCategorical
} from '$lib/features/map/utils/data-styling.utils';
import {
  getVisualizationRenderOrder,
  getMapLayerRenderOrder
} from '$lib/features/map/utils/layer-order.utils';
import {
  ColorMode,
  FillMode,
  SymbolMode
} from '$lib/features/main-toolbar/constants';
import { ScaleType } from '$lib/features/commons/store/visualization.store.svelte';

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

// ─── getSizeForValue ───────────────────────────────────────────────────────

describe('getSizeForValue — LINEAR scale', () => {
  it('returns minSize for value at min', () => {
    expect(getSizeForValue(0, 0, 100, 5, 50)).toBe(5);
  });

  it('returns maxSize for value at max', () => {
    expect(getSizeForValue(100, 0, 100, 5, 50)).toBe(50);
  });

  it('returns midpoint for value at mid-range', () => {
    expect(getSizeForValue(50, 0, 100, 0, 100)).toBe(50);
  });

  it('clamps value below min to minSize', () => {
    expect(getSizeForValue(-10, 0, 100, 5, 50)).toBe(5);
  });

  it('clamps value above max to maxSize', () => {
    expect(getSizeForValue(150, 0, 100, 5, 50)).toBe(50);
  });

  it('returns midpoint when min === max', () => {
    expect(getSizeForValue(5, 5, 5, 10, 20)).toBe(15);
  });
});

describe('getSizeForValue — SQRT scale', () => {
  it('returns minSize for value at min', () => {
    expect(getSizeForValue(0, 0, 100, 0, 100, ScaleType.SQRT)).toBeCloseTo(0);
  });

  it('returns value larger than linear at mid-range (concave curve)', () => {
    const linear = getSizeForValue(25, 0, 100, 0, 100, ScaleType.LINEAR);
    const sqrt = getSizeForValue(25, 0, 100, 0, 100, ScaleType.SQRT);
    expect(sqrt).toBeGreaterThan(linear);
  });
});

describe('getSizeForValue — LOG scale', () => {
  it('returns value between minSize and maxSize', () => {
    const size = getSizeForValue(50, 0, 100, 0, 100, ScaleType.LOG);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(100);
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

// ─── hasCompleteCategoricalColorMap ───────────────────────────────────────

describe('hasCompleteCategoricalColorMap', () => {
  it('returns true when all categories are in the map', () => {
    const map = new Map([
      ['A', [255, 0, 0] as [number, number, number]],
      ['B', [0, 255, 0] as [number, number, number]]
    ]);
    expect(hasCompleteCategoricalColorMap(['A', 'B'], map)).toBe(true);
  });

  it('returns false when map is missing a category', () => {
    const map = new Map([['A', [255, 0, 0] as [number, number, number]]]);
    expect(hasCompleteCategoricalColorMap(['A', 'B'], map)).toBe(false);
  });

  it('returns false when map is null', () => {
    expect(hasCompleteCategoricalColorMap(['A'], null)).toBe(false);
  });
});

// ─── shouldApply* guards ───────────────────────────────────────────────────

describe('shouldApplyChoropleth', () => {
  const base = {
    modes: { fill: FillMode.CLASSES },
    mapping: { valueColumn: 'pop' },
    classification: {
      breaks: [0, 10, 20],
      colors: ['#f00', '#0f0', '#00f'],
      method: 'quantiles',
      classes: 3
    },
    type: 'choropleth' as never,
    id: 'v1',
    name: 'V',
    datasetId: 'd1',
    enabled: true,
    style: {}
  };

  it('returns true when all required fields are present', () => {
    expect(shouldApplyChoropleth(base as never)).toBe(true);
  });

  it('returns false when fill mode is not CLASSES', () => {
    expect(
      shouldApplyChoropleth({
        ...base,
        modes: { fill: FillMode.UNIQUE }
      } as never)
    ).toBe(false);
  });

  it('returns false when valueColumn is absent', () => {
    expect(shouldApplyChoropleth({ ...base, mapping: {} } as never)).toBe(
      false
    );
  });

  it('returns false when breaks has fewer than 2 values', () => {
    const noBreaks = {
      ...base,
      classification: { ...base.classification, breaks: [10] }
    };
    expect(shouldApplyChoropleth(noBreaks as never)).toBe(false);
  });
});

describe('shouldApplyCategorical', () => {
  const base = {
    modes: { fill: FillMode.CATEGORIES },
    mapping: { categoryColumn: 'type' },
    classification: { colors: ['#f00', '#0f0'], method: 'manual', classes: 2 },
    type: 'categorical' as never,
    id: 'v1',
    name: 'V',
    datasetId: 'd1',
    enabled: true,
    style: {}
  };

  it('returns true when all required fields are present', () => {
    expect(shouldApplyCategorical(base as never)).toBe(true);
  });

  it('returns false when fill mode is not CATEGORIES', () => {
    expect(
      shouldApplyCategorical({
        ...base,
        modes: { fill: FillMode.UNIQUE }
      } as never)
    ).toBe(false);
  });

  it('returns false when colors array is empty', () => {
    const empty = {
      ...base,
      classification: { ...base.classification, colors: [] }
    };
    expect(shouldApplyCategorical(empty as never)).toBe(false);
  });
});

describe('shouldApplyLineCategorical', () => {
  const base = {
    modes: { fill: FillMode.NONE, color: ColorMode.CATEGORIES },
    mapping: { categoryColumn: 'type' },
    classification: { colors: ['#f00', '#0f0'], method: 'manual', classes: 2 },
    type: 'categorical' as never,
    id: 'v1',
    name: 'V',
    datasetId: 'd1',
    enabled: true,
    style: {}
  };

  it('returns true when line color mode is CATEGORIES', () => {
    expect(shouldApplyLineCategorical(base as never)).toBe(true);
  });

  it('returns true for legacy fill-based categorical lines', () => {
    expect(
      shouldApplyLineCategorical({
        ...base,
        modes: { fill: FillMode.CATEGORIES, color: ColorMode.UNIQUE }
      } as never)
    ).toBe(true);
  });

  it('returns false when line color mode is not categorical', () => {
    expect(
      shouldApplyLineCategorical({
        ...base,
        modes: { fill: FillMode.NONE, color: ColorMode.UNIQUE }
      } as never)
    ).toBe(false);
  });
});

describe('shouldApplyLineChoropleth', () => {
  const base = {
    modes: { fill: FillMode.NONE, color: ColorMode.CLASSES },
    mapping: { valueColumn: 'pop' },
    classification: {
      breaks: [0, 10, 20],
      colors: ['#f00', '#0f0', '#00f'],
      method: 'quantiles',
      classes: 3
    },
    type: 'choropleth' as never,
    id: 'v1',
    name: 'V',
    datasetId: 'd1',
    enabled: true,
    style: {}
  };

  it('returns true when line color mode is CLASSES', () => {
    expect(shouldApplyLineChoropleth(base as never)).toBe(true);
  });

  it('returns true for legacy fill-based classed lines', () => {
    expect(
      shouldApplyLineChoropleth({
        ...base,
        modes: { fill: FillMode.CLASSES, color: ColorMode.UNIQUE }
      } as never)
    ).toBe(true);
  });

  it('returns false when line color mode is not classed', () => {
    expect(
      shouldApplyLineChoropleth({
        ...base,
        modes: { fill: FillMode.NONE, color: ColorMode.UNIQUE }
      } as never)
    ).toBe(false);
  });
});

// ─── shouldApplyProportionalSymbols ───────────────────────────────────────

describe('shouldApplyProportionalSymbols', () => {
  const base = {
    modes: { symbol: SymbolMode.PROPORTIONAL },
    mapping: { sizeColumn: 'pop' },
    symbols: { type: 'circle', size: 30 },
    type: 'proportional' as never,
    id: 'v1',
    name: 'V',
    datasetId: 'd1',
    enabled: true,
    style: {}
  };

  it('returns true when symbol mode is PROPORTIONAL with sizeColumn and symbols', () => {
    expect(shouldApplyProportionalSymbols(base as never)).toBe(true);
  });

  it('returns true when symbol mode is CLASSES', () => {
    expect(
      shouldApplyProportionalSymbols({
        ...base,
        modes: { symbol: SymbolMode.CLASSES }
      } as never)
    ).toBe(true);
  });

  it('returns false when sizeColumn is absent', () => {
    expect(
      shouldApplyProportionalSymbols({ ...base, mapping: {} } as never)
    ).toBe(false);
  });

  it('returns false when symbols block is absent', () => {
    expect(
      shouldApplyProportionalSymbols({ ...base, symbols: undefined } as never)
    ).toBe(false);
  });
});

// ─── getVisualizationRenderOrder ───────────────────────────────────────────

describe('getVisualizationRenderOrder', () => {
  it('reverses the input array (UI top-to-bottom → Deck.gl last-on-top)', () => {
    const vizs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = getVisualizationRenderOrder(vizs as never);
    expect(result.map((v) => v.id)).toEqual(['c', 'b', 'a']);
  });

  it('does not mutate the original array', () => {
    const vizs = [{ id: 'a' }, { id: 'b' }];
    getVisualizationRenderOrder(vizs as never);
    expect(vizs[0].id).toBe('a');
  });
});

describe('getMapLayerRenderOrder', () => {
  it('returns background + thematic + foreground in correct order', () => {
    const bg = [{ id: 'bg' }];
    const thematic = [{ id: 'th' }];
    const fg = [{ id: 'fg' }];
    const result = getMapLayerRenderOrder({
      basemapBackgroundLayers: bg as never,
      thematicLayers: thematic as never,
      basemapForegroundLayers: fg as never
    });
    expect(result.map((l) => (l as { id: string }).id)).toEqual([
      'bg',
      'th',
      'fg'
    ]);
  });
});
