import { describe, expect, it } from 'vitest';
import {
  ClassificationMethod,
  type ClassificationConfig,
  type LinePrimitiveConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { ColorMode, ThicknessMode } from '../constants';
import { resolveLineModeTransition } from './use-line-mode-state.svelte';

function createClassification(
  overrides: Partial<ClassificationConfig> = {}
): ClassificationConfig {
  return {
    method: ClassificationMethod.KMEANS,
    classes: 5,
    ...overrides
  };
}

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
    classification: createClassification({ labels: ['A', 'B'] }),
    thicknessClassification: createClassification({
      classes: 4,
      numClasses: 4,
      breaks: [10, 20, 30]
    }),
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
      colorMode: ColorMode.UNIQUE,
      valueColumn: 'flow'
    });
    expect(transition.nextVisualizationUpdates).toEqual({
      lineClassification: undefined
    });
    expect(transition.nextMappingUpdates).toEqual({
      valueColumn: 'flow',
      categoryColumn: undefined
    });
  });

  it('restores the classed color state without overriding an active classed thickness value column', () => {
    const line = createLine({
      colorMode: ColorMode.CATEGORIES,
      thicknessMode: ThicknessMode.CLASSES,
      valueColumn: 'flow',
      categoryColumn: 'type',
      classification: createClassification({ labels: ['Category A'] }),
      colorModeStates: {
        [ColorMode.CLASSES]: {
          valueColumn: 'population',
          classification: createClassification({ labels: ['Class A'] })
        }
      }
    });

    const transition = resolveLineModeTransition(line, {
      color: ColorMode.CLASSES
    });

    expect(transition.nextLineUpdates).toMatchObject({
      colorMode: ColorMode.CLASSES,
      valueColumn: 'flow',
      classification: createClassification({ labels: ['Class A'] }),
      categoryColumn: undefined
    });
    expect(
      transition.nextLineUpdates.colorModeStates?.[ColorMode.CATEGORIES]
    ).toMatchObject({
      categoryColumn: 'type',
      classification: createClassification({ labels: ['Category A'] })
    });
    expect(transition.nextMappingUpdates).toEqual({
      valueColumn: 'flow',
      categoryColumn: undefined
    });
  });

  it('restores the categorical color state from the saved mode snapshot', () => {
    const line = createLine({
      colorMode: ColorMode.CLASSES,
      thicknessMode: ThicknessMode.UNIQUE,
      valueColumn: 'flow',
      classification: createClassification({ labels: ['Class A'] }),
      colorModeStates: {
        [ColorMode.CATEGORIES]: {
          categoryColumn: 'segment',
          classification: createClassification({ labels: ['Segment A'] })
        }
      }
    });

    const transition = resolveLineModeTransition(line, {
      color: ColorMode.CATEGORIES
    });

    expect(transition.nextLineUpdates).toMatchObject({
      colorMode: ColorMode.CATEGORIES,
      valueColumn: undefined,
      categoryColumn: 'segment',
      classification: createClassification({ labels: ['Segment A'] })
    });
    expect(
      transition.nextLineUpdates.colorModeStates?.[ColorMode.CLASSES]
    ).toMatchObject({
      valueColumn: 'flow',
      classification: createClassification({ labels: ['Class A'] })
    });
    expect(transition.nextVisualizationUpdates).toEqual({
      lineClassification: createClassification({ labels: ['Segment A'] })
    });
    expect(transition.nextMappingUpdates).toEqual({
      valueColumn: undefined,
      categoryColumn: 'segment'
    });
  });

  it('restores the proportional thickness state and clears the classed thickness mirror', () => {
    const line = createLine({
      colorMode: ColorMode.CATEGORIES,
      thicknessMode: ThicknessMode.CLASSES,
      maxWidth: 18,
      valueColumn: 'flow',
      thicknessClassification: createClassification({
        classes: 4,
        numClasses: 4,
        breaks: [10, 20, 30]
      }),
      thicknessModeStates: {
        [ThicknessMode.PROPORTIONAL]: {
          sizeColumn: 'magnitude',
          maxWidth: 12
        }
      }
    });

    const transition = resolveLineModeTransition(line, {
      thickness: ThicknessMode.PROPORTIONAL
    });

    expect(transition.nextLineUpdates).toMatchObject({
      thicknessMode: ThicknessMode.PROPORTIONAL,
      sizeColumn: 'magnitude',
      maxWidth: 12,
      thicknessClassification: undefined
    });
    expect(transition.nextVisualizationUpdates).toEqual({
      lineThicknessClassification: undefined
    });
    expect(transition.nextMappingUpdates).toEqual({
      valueColumn: undefined,
      sizeColumn: 'magnitude'
    });
  });

  it('restores the unique thickness width from its saved mode snapshot', () => {
    const line = createLine({
      colorMode: ColorMode.UNIQUE,
      thicknessMode: ThicknessMode.PROPORTIONAL,
      sizeColumn: 'magnitude',
      maxWidth: 16,
      thicknessModeStates: {
        [ThicknessMode.UNIQUE]: {
          width: 4
        }
      }
    });

    const transition = resolveLineModeTransition(line, {
      thickness: ThicknessMode.UNIQUE
    });

    expect(transition.nextLineUpdates).toMatchObject({
      thicknessMode: ThicknessMode.UNIQUE,
      width: 4,
      sizeColumn: undefined
    });
    expect(transition.nextMappingUpdates).toEqual({
      valueColumn: undefined,
      sizeColumn: undefined
    });
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
    expect(transition.nextMappingUpdates).toEqual({
      valueColumn: undefined,
      categoryColumn: undefined,
      sizeColumn: undefined
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
      valueColumn: 'population',
      sizeColumn: undefined
    });
    expect(transition.nextMappingUpdates).toEqual({
      valueColumn: 'population',
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
      valueColumn: undefined,
      sizeColumn: undefined
    });
  });
});
