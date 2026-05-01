import { describe, expect, it } from 'vitest';
import {
  CategoryShapeMode,
  FillMode,
  ProportionalType,
  ShapeType,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode
} from '../constants';
import type { SymbolPrimitiveConfig } from '$lib/features/commons/store/visualization.store.svelte';
import { resolveSymbolModeTransition } from './use-symbol-mode-state.svelte';

function createProportionalSymbol(): SymbolPrimitiveConfig {
  return {
    enabled: true,
    mode: SymbolMode.PROPORTIONAL,
    shape: ShapeType.CIRCLE,
    size: 10,
    minSize: 2,
    maxSize: 16,
    sizeScale: 'linear' as SymbolPrimitiveConfig['sizeScale'],
    opacity: 1,
    sizeColumn: 'population',
    valueColumn: undefined,
    categoryColumn: 'region',
    fillMode: FillMode.UNIQUE,
    strokeMode: StrokeMode.UNIQUE,
    strokeWidth: 1,
    strokeOpacity: 1,
    strokeDashed: false,
    proportionalType: ProportionalType.SINGLE,
    categoryShape: CategoryShapeMode.UNIQUE,
    commonScale: true,
    positionMode: SymbolDoublePosition.OVERLAY,
    breakValueA: null,
    breakValueB: null,
    modeStates: undefined
  };
}

describe('resolveSymbolModeTransition', () => {
  it('uses the proportional size column as the default class variable', () => {
    const transition = resolveSymbolModeTransition(
      createProportionalSymbol(),
      SymbolMode.CLASSES
    );

    expect(transition.restoredStateFields).toMatchObject({
      valueColumn: 'population',
      sizeColumn: undefined
    });
  });
});
