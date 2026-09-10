import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock(
  '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte',
  () => ({
    getColorBlindnessState: vi.fn(() => ({ active: false })),
    isColorBlindnessActive: vi.fn(() => false)
  })
);

vi.mock('./use-classification-breaks.svelte', () => ({
  areClassificationColorsEqual: vi.fn(
    (a, b) => JSON.stringify(a) === JSON.stringify(b)
  ),
  buildClassificationColorParamsKey: vi.fn(
    (scope, target) => `${scope}:${target?.classification?.method ?? 'none'}`
  ),
  resolveClassificationColors: vi.fn((args) => {
    if (args.usesCategories) return ['#aaa', '#bbb'];
    if (args.classification?.method) return ['#111', '#222'];
    return undefined;
  }),
  SYMBOL_FILL_SCOPE_TARGET: 'symbol-fill'
}));

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  PrimitiveFilterType: {
    POINT: 'point',
    POLYGON: 'polygon',
    LINE: 'line',
    TEXT: 'text'
  }
}));

import {
  buildPrimitiveColorParamsKey,
  buildStrokeColorParamsKey,
  syncPrimitiveColors,
  syncStrokeColors,
  type ClassificationTarget,
  type StrokeClassificationTarget,
  type UseClassificationColorSyncDeps
} from './use-classification-color-sync.svelte';

function makeTarget(
  overrides: Partial<ClassificationTarget> = {}
): ClassificationTarget {
  return {
    primitive: 'polygon' as never,
    valueColumn: 'col',
    categoryColumn: undefined,
    classification: undefined,
    usesBreaks: false,
    usesCategories: false,
    ...overrides
  };
}

function makeStrokeTarget(
  overrides: Partial<StrokeClassificationTarget> = {}
): StrokeClassificationTarget {
  return {
    primitive: 'polygon' as never,
    valueColumn: 'col',
    categoryColumn: undefined,
    classification: undefined,
    usesBreaks: false,
    usesCategories: false,
    ...overrides
  };
}

function emptyDeps(
  overrides: Partial<UseClassificationColorSyncDeps> = {}
): UseClassificationColorSyncDeps {
  return {
    getSelectedVisualizationId: () => 'viz-1',
    getPrimitiveTargets: () => [],
    getStrokeTargets: () => [],
    getSymbolFillTarget: () => null,
    updatePrimitiveClassificationState: vi.fn(),
    updatePrimitiveStrokeClassificationState: vi.fn(),
    applySymbolFillUpdate: vi.fn(),
    ...overrides
  };
}

describe('use-classification-color-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds primitive color params key from cb state + targets', () => {
    const key = buildPrimitiveColorParamsKey(
      [
        makeTarget({
          classification: { method: 'quantile' as never } as never,
          usesBreaks: true
        })
      ],
      null
    );
    expect(key).toContain('false');
    expect(key).toContain('polygon:quantile');
  });

  it('skips targets that use neither breaks nor categories', () => {
    const updateClass = vi.fn();
    syncPrimitiveColors(
      emptyDeps({
        getPrimitiveTargets: () => [makeTarget()],
        updatePrimitiveClassificationState: updateClass
      })
    );
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('applies new colors when classification has breaks but stale colors', () => {
    const updateClass = vi.fn();
    syncPrimitiveColors(
      emptyDeps({
        getPrimitiveTargets: () => [
          makeTarget({
            classification: {
              method: 'quantile' as never,
              colors: undefined
            } as never,
            usesBreaks: true
          })
        ],
        updatePrimitiveClassificationState: updateClass
      })
    );
    expect(updateClass).toHaveBeenCalledWith(
      'polygon',
      {
        colors: ['#111', '#222']
      },
      { preserveOrigin: true }
    );
  });

  it('applies derived symbol fill colors with preserved origin', () => {
    const applySymbolFillUpdate = vi.fn();
    syncPrimitiveColors(
      emptyDeps({
        getSymbolFillTarget: () => ({
          classification: { method: 'quantile' as never } as never,
          usesBreaks: true,
          usesCategories: false,
          valueColumn: 'population'
        }),
        applySymbolFillUpdate
      })
    );
    expect(applySymbolFillUpdate).toHaveBeenCalledWith(
      { colors: ['#111', '#222'] },
      { preserveOrigin: true }
    );
  });

  it('returns early when no selected visualization id', () => {
    const updateClass = vi.fn();
    syncPrimitiveColors(
      emptyDeps({
        getSelectedVisualizationId: () => undefined,
        getPrimitiveTargets: () => [
          makeTarget({
            classification: { method: 'quantile' as never } as never,
            usesBreaks: true
          })
        ],
        updatePrimitiveClassificationState: updateClass
      })
    );
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('builds stroke color params key from cb state alone when no target', () => {
    const key = buildStrokeColorParamsKey([]);
    expect(key).toBe('false');
  });

  it('applies stroke updates only when stroke target uses breaks/categories', () => {
    const updateStroke = vi.fn();
    syncStrokeColors(
      emptyDeps({
        getStrokeTargets: () => [
          makeStrokeTarget({
            classification: { method: 'jenks' as never } as never,
            usesBreaks: true
          })
        ],
        updatePrimitiveStrokeClassificationState: updateStroke
      })
    );
    expect(updateStroke).toHaveBeenCalledWith(
      'polygon',
      {
        colors: ['#111', '#222']
      },
      { preserveOrigin: true }
    );
  });
});
