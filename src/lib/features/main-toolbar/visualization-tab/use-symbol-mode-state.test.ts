import { describe, expect, it } from 'vitest';
import {
  FillMode,
  StrokeMode,
  SymbolMode,
  VISUALIZATION_DEFAULTS
} from '../constants';
import {
  SYMBOL_MODE_STATE_KEYS,
  getDefaultSymbolModeStateFields,
  resolveSymbolModeTransition,
  snapshotSymbolModeState
} from './use-symbol-mode-state.svelte';
import type { SymbolPrimitiveConfig } from '$lib/features/commons/store/visualization.store.svelte';

function createSymbol(): SymbolPrimitiveConfig {
  return {
    enabled: true,
    mode: SymbolMode.PROPORTIONAL,
    size: 10,
    minSize: 2,
    maxSize: 16,
    sizeScale: 1,
    valueColumn: 'value',
    categoryColumn: 'category',
    sizeColumn: 'size',
    classification: { labels: ['A'] },
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
        sizeScale: 1,
        valueColumn: undefined,
        categoryColumn: 'region',
        sizeColumn: undefined,
        classification: { labels: ['North', 'South'] },
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
      fillMode: FillMode.CATEGORIES,
      strokeMode: StrokeMode.NONE
    });
  });

  it('defaults categories mode to a borderless configuration when no snapshot exists', () => {
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
  });

  it('does not inject category defaults for non-category target modes', () => {
    expect(getDefaultSymbolModeStateFields(SymbolMode.UNIQUE)).toEqual({});
  });
});
