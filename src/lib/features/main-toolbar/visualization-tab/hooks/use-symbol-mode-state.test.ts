import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLORS,
  FillMode,
  ProportionalType,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode,
  VISUALIZATION_DEFAULTS
} from '../../constants';
import {
  SYMBOL_MODE_STATE_KEYS,
  getDefaultSymbolModeStateFields,
  resolveSymbolModeTransition,
  snapshotSymbolModeState
} from './use-symbol-mode-state.svelte';
import {
  ClassificationMethod,
  type SymbolPrimitiveConfig
} from '$lib/features/commons/store/visualization.store.svelte';

function createSymbol(): SymbolPrimitiveConfig {
  return {
    enabled: true,
    mode: SymbolMode.PROPORTIONAL,
    size: 10,
    minSize: 2,
    maxSize: 16,
    barWidth: 6,
    sizeScale: 1,
    valueColumn: 'value',
    categoryColumn: 'category',
    sizeColumn: 'size',
    classification: { labels: ['A'] },
    fillValueColumn: 'fill_value',
    fillCategoryColumn: 'fill_category',
    fillClassification: { labels: ['Fill'] },
    categoryShape: 'unique',
    proportionalType: 'double',
    commonScale: false,
    positionMode: 'overlay',
    breakValueA: 5,
    breakValueB: 10,
    fillMode: FillMode.CLASSES,
    strokeMode: StrokeMode.CLASSES,
    strokeWidth: 2,
    strokeOpacity: 0.6,
    strokeDashed: true,
    strokeClassification: { labels: ['s'] },
    strokeValueColumn: 'stroke_value',
    strokeCategoryColumn: 'stroke_category',
    modeStates: {
      [SymbolMode.CATEGORIES]: {
        size: 7,
        minSize: 1,
        maxSize: 12,
        barWidth: 8,
        sizeScale: 1,
        valueColumn: undefined,
        categoryColumn: 'region',
        sizeColumn: undefined,
        classification: { labels: ['North', 'South'] },
        fillValueColumn: 'density',
        fillCategoryColumn: 'family',
        fillClassification: { labels: ['Cold', 'Warm'] },
        categoryShape: 'different',
        proportionalType: 'single',
        commonScale: true,
        positionMode: 'overlay',
        breakValueA: null,
        breakValueB: null,
        fillMode: FillMode.CATEGORIES,
        strokeMode: StrokeMode.NONE,
        strokeWidth: VISUALIZATION_DEFAULTS.strokeWidth,
        strokeOpacity: 1,
        strokeDashed: false,
        strokeClassification: undefined,
        strokeValueColumn: undefined,
        strokeCategoryColumn: undefined
      }
    }
  } as unknown as SymbolPrimitiveConfig;
}

describe('use-symbol-mode-state', () => {
  it('keeps the snapshot keys aligned with the exported key list', () => {
    const snapshotKeys = Object.keys(
      snapshotSymbolModeState(createSymbol())
    ).sort();
    expect(snapshotKeys).toEqual([...SYMBOL_MODE_STATE_KEYS].sort());
  });

  it('restores an existing mode snapshot when switching mode', () => {
    const transition = resolveSymbolModeTransition(
      createSymbol(),
      SymbolMode.CATEGORIES
    );
    expect(transition.nextModeStates[SymbolMode.PROPORTIONAL]).toMatchObject({
      size: 10,
      strokeDashed: true
    });
    expect(transition.restoredStateFields).toMatchObject({
      categoryColumn: 'region',
      fillValueColumn: 'density',
      fillCategoryColumn: 'family',
      fillMode: FillMode.CATEGORIES,
      strokeMode: StrokeMode.NONE
    });
  });

  it('defaults categories mode to automatic black 60% stroke when no snapshot exists', () => {
    const symbol = { ...createSymbol(), modeStates: undefined };
    const transition = resolveSymbolModeTransition(
      symbol,
      SymbolMode.CATEGORIES
    );
    expect(transition.restoredStateFields).toEqual(
      getDefaultSymbolModeStateFields(SymbolMode.CATEGORIES)
    );
    expect(transition.restoredStateFields.strokeWidth).toBe(
      VISUALIZATION_DEFAULTS.strokeWidth
    );
    expect(transition.restoredStateFields.strokeColor).toBe(
      DEFAULT_COLORS.black
    );
    expect(transition.restoredStateFields.strokeOpacity).toBe(0.6);
    expect(transition.restoredStateFields.proportionalType).toBe(
      ProportionalType.SINGLE
    );
    expect(transition.restoredStateFields.breakValueA).toBeNull();
    expect(transition.restoredStateFields.breakValueB).toBeNull();
  });

  it('clears stale quantitative classification when entering categories without a snapshot', () => {
    const symbol = {
      ...createSymbol(),
      mode: SymbolMode.CLASSES,
      modeStates: undefined,
      classification: {
        method: ClassificationMethod.KMEANS,
        classes: 1,
        labels: ['0-10']
      }
    };
    const transition = resolveSymbolModeTransition(
      symbol,
      SymbolMode.CATEGORIES
    );

    expect(transition.restoredStateFields.classification).toBeUndefined();
  });

  it('sanitizes proportional-only fields when switching to a non-proportional mode', () => {
    const transition = resolveSymbolModeTransition(
      createSymbol(),
      SymbolMode.CLASSES
    );
    expect(transition.restoredStateFields.proportionalType).toBe(
      ProportionalType.SINGLE
    );
    expect(transition.restoredStateFields.commonScale).toBe(true);
    expect(transition.restoredStateFields.positionMode).toBe(
      SymbolDoublePosition.OVERLAY
    );
    expect(transition.restoredStateFields.breakValueA).toBeNull();
    expect(transition.restoredStateFields.breakValueB).toBeNull();
  });

  it('does not inject category fill/stroke defaults for unique mode', () => {
    expect(getDefaultSymbolModeStateFields(SymbolMode.UNIQUE)).toMatchObject({
      proportionalType: ProportionalType.SINGLE,
      commonScale: true,
      positionMode: SymbolDoublePosition.OVERLAY,
      breakValueA: null,
      breakValueB: null
    });
    expect(
      getDefaultSymbolModeStateFields(SymbolMode.UNIQUE)
    ).not.toHaveProperty('strokeWidth');
  });
});
