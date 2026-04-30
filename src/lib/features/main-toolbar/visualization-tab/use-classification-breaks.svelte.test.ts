import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeMocks = vi.hoisted(() => ({
  ClassificationMethod: {
    KMEANS: 'kmeans',
    MANUAL: 'manual',
    QUANTILES: 'quantiles',
    EQUAL_INTERVAL: 'equal_interval',
    Q6: 'q6',
    NESTED_MEANS: 'nested_means',
    HEAD_TAIL: 'head_tail'
  } as const,
  PrimitiveFilterType: {
    POLYGON: 'polygon'
  } as const
}));

const serviceMocks = vi.hoisted(() => ({
  applyPaletteInversion: vi.fn((colors: string[]) => colors),
  calculateBreakCounts: vi.fn(),
  calculateDivergingBreaks: vi.fn(),
  calculateBreaks: vi.fn(),
  computeDivergingSplit: vi.fn(() => ({
    hasCenterClass: false,
    lowerCount: 2,
    upperCount: 2
  })),
  generateColorsForBreaks: vi.fn((count: number) =>
    Array.from({ length: count }, (_, index) => `#auto-${index}`)
  )
}));

const paletteMocks = vi.hoisted(() => ({
  DEFAULT_QUALITATIVE_PRESET: 'qualitative-default',
  findPaletteById: vi.fn(),
  generateCategoricalColorsFromSeed: vi.fn((_seed: string, count: number) =>
    Array.from({ length: count }, (_, index) => `#seed-${index}`)
  ),
  generatePaletteColors: vi.fn((_, count: number) =>
    Array.from({ length: count }, (_, index) => `#palette-${index}`)
  )
}));

vi.mock('$lib/features/commons/services/classification.service', () => ({
  ...serviceMocks
}));

vi.mock(
  '$lib/features/commons/components/palette-popover/palette.constants',
  () => ({
    PALETTE_TYPE: {
      PATTERN: 'pattern',
      SEQUENTIAL: 'sequential',
      DIVERGING: 'diverging',
      QUALITATIVE: 'qualitative'
    },
    ...paletteMocks
  })
);

vi.mock(
  '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte',
  () => ({
    getColorBlindnessState: () => ({ enabled: false, simulationType: 'none' }),
    isColorBlindnessActive: () => false
  })
);

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  ClassificationMethod: storeMocks.ClassificationMethod,
  PrimitiveFilterType: storeMocks.PrimitiveFilterType,
  DEFAULT_CATEGORICAL_COLORS: ['#cat-0', '#cat-1', '#cat-2']
}));

import {
  ClassificationMethod,
  PrimitiveFilterType,
  type ClassificationConfig
} from '$lib/features/commons/store/visualization.store.svelte';

import {
  CLASSIFICATION_BREAKS_TRIGGER,
  areClassificationColorsEqual,
  buildClassificationColorParamsKey,
  buildClassificationScopeKey,
  computeClassificationBreaks,
  resolveClassificationColors,
  resolveClassificationBreakColors,
  useClassificationBreaksController
} from './use-classification-breaks.svelte';

describe('use-classification-breaks', () => {
  beforeEach(() => {
    serviceMocks.applyPaletteInversion.mockClear();
    serviceMocks.calculateBreakCounts.mockReset();
    serviceMocks.calculateDivergingBreaks.mockReset();
    serviceMocks.calculateBreaks.mockReset();
    serviceMocks.computeDivergingSplit.mockClear();
    serviceMocks.generateColorsForBreaks.mockClear();
    paletteMocks.findPaletteById.mockReset();
    paletteMocks.generateCategoricalColorsFromSeed.mockClear();
    paletteMocks.generatePaletteColors.mockClear();
  });

  it('centralizes scope keys and trigger labels for break orchestration', () => {
    expect(
      buildClassificationScopeKey('fill', PrimitiveFilterType.POLYGON)
    ).toBe('fill:polygon');
    expect(CLASSIFICATION_BREAKS_TRIGGER.MISSING_BREAKS).toBe('missing-breaks');
  });

  describe('buildClassificationColorParamsKey', () => {
    it('returns a "<key>:none" sentinel when target is missing', () => {
      expect(buildClassificationColorParamsKey('polygon', null)).toBe(
        'polygon:none'
      );
      expect(buildClassificationColorParamsKey('polygon', undefined)).toBe(
        'polygon:none'
      );
    });

    it('encodes sequential params (no breakpoint) without break info', () => {
      const key = buildClassificationColorParamsKey('polygon', {
        usesCategories: false,
        classification: {
          paletteId: 'blues',
          inverted: false,
          classes: 5
        } as ClassificationConfig
      });
      expect(key).toBe('polygon:blues:false:5:sequential:::false');
    });

    it('encodes diverging params with breakpoint and breaks joined', () => {
      const key = buildClassificationColorParamsKey('polygon', {
        usesCategories: false,
        classification: {
          paletteId: 'red-blue',
          inverted: true,
          classes: 4,
          breakpointValue: 0,
          breaks: [-1, 0, 1]
        } as ClassificationConfig
      });
      expect(key).toBe('polygon:red-blue:true:4:diverging:0:-1,0,1:false');
    });

    it('uses label count when usesCategories is true', () => {
      const key = buildClassificationColorParamsKey('symbol', {
        usesCategories: true,
        classification: {
          paletteId: 'set1',
          inverted: false,
          labels: ['a', 'b', 'c']
        } as ClassificationConfig
      });
      expect(key).toBe('symbol:set1:false:3:sequential:::true');
    });
  });

  it('resolves categorical colors through the shared helper', () => {
    const colors = resolveClassificationColors({
      classification: {
        labels: ['A', 'B', 'C'],
        colors: ['#old'],
        classes: 3
      } as ClassificationConfig,
      usesCategories: true
    });

    expect(colors).toEqual(['#cat-0', '#cat-1', '#cat-2']);
    expect(
      paletteMocks.generateCategoricalColorsFromSeed
    ).not.toHaveBeenCalled();
  });

  it('reuses existing colors when the class count already matches', () => {
    const colors = resolveClassificationBreakColors(
      {
        colors: ['#111111', '#222222'],
        inverted: false
      } as ClassificationConfig,
      2,
      [5],
      null
    );

    expect(colors).toEqual(['#111111', '#222222']);
    expect(serviceMocks.generateColorsForBreaks).not.toHaveBeenCalled();
  });

  it('regenerates colors when the breakpoint moves', () => {
    const colors = resolveClassificationBreakColors(
      {
        colors: ['#111111', '#222222', '#333333'],
        breaks: [10, 20],
        breakpointValue: 10,
        inverted: false
      } as ClassificationConfig,
      3,
      [10, 20],
      20
    );

    expect(colors).toEqual(['#auto-0', '#auto-1', '#auto-2']);
    expect(serviceMocks.computeDivergingSplit).toHaveBeenCalledWith(
      3,
      [10, 20],
      20
    );
    expect(serviceMocks.generateColorsForBreaks).toHaveBeenCalled();
  });

  it('regenerates diverging colors when break values change', () => {
    const colors = resolveClassificationBreakColors(
      {
        colors: ['#111111', '#222222', '#333333'],
        breaks: [10, 20],
        breakpointValue: 15,
        inverted: false
      } as ClassificationConfig,
      3,
      [12, 24],
      15
    );

    expect(colors).toEqual(['#auto-0', '#auto-1', '#auto-2']);
    expect(serviceMocks.computeDivergingSplit).toHaveBeenCalledWith(
      3,
      [12, 24],
      15
    );
    expect(serviceMocks.generateColorsForBreaks).toHaveBeenCalled();
  });

  it('regenerates sequential colors when a breakpoint is cleared', () => {
    const colors = resolveClassificationBreakColors(
      {
        colors: ['#111111', '#222222', '#333333'],
        breaks: [10, 20],
        breakpointValue: 15,
        inverted: false
      } as ClassificationConfig,
      3,
      [10, 20],
      null
    );

    expect(colors).toEqual(['#auto-0', '#auto-1', '#auto-2']);
    expect(serviceMocks.generateColorsForBreaks).toHaveBeenCalled();
  });

  it('compares color arrays without false positives', () => {
    expect(
      areClassificationColorsEqual(
        ['#111111', '#222222'],
        ['#111111', '#222222']
      )
    ).toBe(true);
    expect(
      areClassificationColorsEqual(['#111111'], ['#111111', '#222222'])
    ).toBe(false);
  });

  it('computes automatic breaks and resolves colors through the shared service', async () => {
    serviceMocks.calculateBreaks.mockResolvedValue({
      min: 0,
      max: 100,
      breaks: [25, 50, 75],
      counts: [1, 2, 3, 4]
    });

    const computation = await computeClassificationBreaks({
      datasetSourceFileId: 'dataset-source',
      valueColumn: 'population',
      classification: {
        method: ClassificationMethod.KMEANS,
        numClasses: 4,
        classes: 4
      } as ClassificationConfig
    });

    expect(serviceMocks.calculateBreaks).toHaveBeenCalledWith({
      datasetId: 'dataset-source',
      columnName: 'population',
      method: ClassificationMethod.KMEANS,
      numClasses: 4
    });
    expect(computation?.actualClassCount).toBe(4);
    expect(computation?.colors).toEqual([
      '#auto-0',
      '#auto-1',
      '#auto-2',
      '#auto-3'
    ]);
  });

  it('computes left and right breakpoint classes independently', async () => {
    serviceMocks.calculateDivergingBreaks.mockResolvedValue({
      min: 0,
      max: 100,
      breaks: [25, 50, 75],
      counts: [1, 2, 3, 4],
      breakpointLowerClassCount: 2
    });

    const computation = await computeClassificationBreaks({
      datasetSourceFileId: 'dataset-source',
      valueColumn: 'population',
      classification: {
        method: ClassificationMethod.KMEANS,
        numClasses: 4,
        classes: 4,
        breakpointValue: 50,
        breakpointLowerClassCount: 2
      } as ClassificationConfig
    });

    expect(serviceMocks.calculateDivergingBreaks).toHaveBeenCalledWith({
      datasetId: 'dataset-source',
      columnName: 'population',
      method: ClassificationMethod.KMEANS,
      breakpointValue: 50,
      lowerClassCount: 2,
      upperClassCount: 2
    });
    expect(serviceMocks.calculateBreaks).not.toHaveBeenCalled();
    expect(computation?.breakpointLowerClassCount).toBe(2);
    expect(computation?.actualClassCount).toBe(4);
  });

  it('uses break counts for manual mode when thresholds are already defined', async () => {
    serviceMocks.calculateBreakCounts.mockResolvedValue({
      min: 0,
      max: 100,
      breaks: [25, 50],
      counts: [3, 2, 1]
    });

    const computation = await computeClassificationBreaks({
      datasetSourceFileId: 'dataset-source',
      valueColumn: 'population',
      classification: {
        method: ClassificationMethod.MANUAL,
        numClasses: 3,
        classes: 3
      } as ClassificationConfig,
      breakValues: [25, 50]
    });

    expect(serviceMocks.calculateBreakCounts).toHaveBeenCalledWith({
      datasetId: 'dataset-source',
      columnName: 'population',
      breaks: [25, 50]
    });
    expect(computation?.actualClassCount).toBe(3);
  });

  it('retries empty computations and only applies the latest result per scope', async () => {
    vi.useFakeTimers();
    const applyUpdate = vi.fn();
    const controller = useClassificationBreaksController({
      retryDelayMs: 10,
      resolveDatasetSourceFileId: () => 'dataset-source'
    });

    serviceMocks.calculateBreaks
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        min: 0,
        max: 90,
        breaks: [30, 60],
        counts: [1, 1, 1]
      });

    await controller.compute({
      scopeKey: 'fill:polygon',
      datasetId: 'dataset-1',
      valueColumn: 'population',
      classification: {
        method: ClassificationMethod.KMEANS,
        numClasses: 3,
        classes: 3
      } as ClassificationConfig,
      applyUpdate
    });

    expect(applyUpdate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10);

    expect(applyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        breaks: [30, 60],
        counts: [1, 1, 1],
        colors: ['#auto-0', '#auto-1', '#auto-2']
      })
    );

    controller.destroy();
    vi.useRealTimers();
  });
});
