import { describe, expect, it } from 'vitest';
import {
  ClassificationMethod,
  type LinePrimitiveConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { ColorMode, ThicknessMode } from '../constants';
import { resolveLineModeTransition } from './use-line-mode-state.svelte';

function createLine(
  overrides: Partial<LinePrimitiveConfig> = {}
): LinePrimitiveConfig {
  return {
    enabled: true,
    colorMode: ColorMode.CLASSES,
    thicknessMode: ThicknessMode.CLASSES,
    color: '#336699',
    width: 2,
    maxWidth: 9,
    opacity: 0.7,
    dashed: false,
    valueColumn: 'flow',
    categoryColumn: 'type',
    sizeColumn: 'magnitude',
    classification: {
      method: ClassificationMethod.JENKS,
      classes: 5,
      labels: ['A', 'B']
    },
    ...overrides
  };
}

describe('resolveLineModeTransition', () => {
  it('preserves the shared value column when only the color axis leaves classes', () => {
    const line = createLine({
      colorMode: ColorMode.CLASSES,
      thicknessMode: ThicknessMode.CLASSES
    });

    const transition = resolveLineModeTransition(line, {
      color: ColorMode.UNIQUE
    });

    expect(transition.nextLineUpdates).toMatchObject({
      colorMode: ColorMode.UNIQUE
    });
    expect(transition.nextLineUpdates.valueColumn).toBeUndefined();
    expect(Object.hasOwn(transition.nextLineUpdates, 'valueColumn')).toBe(
      false
    );
    expect(transition.nextMappingUpdates).toEqual({});
  });

  it('keeps the categorical mapping when only the thickness axis changes', () => {
    const line = createLine({
      colorMode: ColorMode.CATEGORIES,
      thicknessMode: ThicknessMode.CLASSES
    });

    const transition = resolveLineModeTransition(line, {
      thickness: ThicknessMode.UNIQUE
    });

    expect(transition.nextLineUpdates).toMatchObject({
      thicknessMode: ThicknessMode.UNIQUE
    });
    expect(Object.hasOwn(transition.nextLineUpdates, 'categoryColumn')).toBe(
      false
    );
    expect(transition.nextMappingUpdates.categoryColumn).toBeUndefined();
    expect(Object.hasOwn(transition.nextMappingUpdates, 'categoryColumn')).toBe(
      false
    );
  });

  it('clears only the columns no longer used by proportional plus categories', () => {
    const line = createLine({
      colorMode: ColorMode.CLASSES,
      thicknessMode: ThicknessMode.CLASSES
    });

    const transition = resolveLineModeTransition(line, {
      color: ColorMode.CATEGORIES,
      thickness: ThicknessMode.PROPORTIONAL
    });

    expect(transition.nextLineUpdates).toMatchObject({
      colorMode: ColorMode.CATEGORIES,
      thicknessMode: ThicknessMode.PROPORTIONAL,
      valueColumn: undefined
    });
    expect(Object.hasOwn(transition.nextLineUpdates, 'categoryColumn')).toBe(
      false
    );
    expect(Object.hasOwn(transition.nextLineUpdates, 'sizeColumn')).toBe(false);
    expect(transition.nextMappingUpdates).toEqual({
      valueColumn: undefined
    });
  });

  it('promotes the proportional size column to the shared value column when classes become active', () => {
    const line = createLine({
      colorMode: ColorMode.CATEGORIES,
      thicknessMode: ThicknessMode.PROPORTIONAL,
      valueColumn: '__id',
      sizeColumn: 'id'
    });

    const transition = resolveLineModeTransition(line, {
      thickness: ThicknessMode.CLASSES
    });

    expect(transition.nextLineUpdates).toMatchObject({
      thicknessMode: ThicknessMode.CLASSES,
      valueColumn: 'id',
      sizeColumn: undefined
    });
    expect(transition.nextMappingUpdates).toEqual({
      valueColumn: 'id',
      sizeColumn: undefined
    });
  });

  it('does not overwrite an active classes value column with the proportional size column', () => {
    const line = createLine({
      colorMode: ColorMode.CLASSES,
      thicknessMode: ThicknessMode.PROPORTIONAL,
      valueColumn: 'population',
      sizeColumn: 'id'
    });

    const transition = resolveLineModeTransition(line, {
      thickness: ThicknessMode.CLASSES
    });

    expect(transition.nextLineUpdates).toMatchObject({
      thicknessMode: ThicknessMode.CLASSES,
      sizeColumn: undefined
    });
    expect(Object.hasOwn(transition.nextLineUpdates, 'valueColumn')).toBe(
      false
    );
    expect(transition.nextMappingUpdates).toEqual({
      sizeColumn: undefined
    });
  });

  it('clears the size column when leaving proportional thickness', () => {
    const line = createLine({
      colorMode: ColorMode.UNIQUE,
      thicknessMode: ThicknessMode.PROPORTIONAL,
      valueColumn: undefined,
      categoryColumn: undefined
    });

    const transition = resolveLineModeTransition(line, {
      thickness: ThicknessMode.UNIQUE
    });

    expect(transition.nextLineUpdates).toMatchObject({
      thicknessMode: ThicknessMode.UNIQUE,
      sizeColumn: undefined
    });
    expect(transition.nextMappingUpdates).toEqual({
      sizeColumn: undefined
    });
  });
});
