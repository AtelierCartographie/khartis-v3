import { describe, expect, it } from 'vitest';
import {
  ColorMode,
  SizeMode
} from '$lib/features/commons/constants/visualization.constants';
import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import { getEnabledLegendPrimitives } from './legend-subtitle.utils';

function buildVisualization(
  text: Partial<NonNullable<VisualizationConfig['text']>>
): VisualizationConfig {
  return {
    mapping: {},
    text: {
      enabled: true,
      sizeMode: SizeMode.FIXED,
      colorMode: ColorMode.UNIQUE,
      ...text
    }
  } as unknown as VisualizationConfig;
}

describe('getEnabledLegendPrimitives — text', () => {
  it('should not claim a legend for labels drawn at a single size and colour', () => {
    expect(getEnabledLegendPrimitives(buildVisualization({}))).toEqual([]);
  });

  it('should claim a legend once the label size carries a variable', () => {
    expect(
      getEnabledLegendPrimitives(
        buildVisualization({
          sizeMode: SizeMode.PROPORTIONAL,
          valueColumn: 'population'
        })
      )
    ).toEqual(['text']);

    expect(
      getEnabledLegendPrimitives(
        buildVisualization({
          sizeMode: SizeMode.CLASSES,
          valueColumn: 'population'
        })
      )
    ).toEqual(['text']);
  });

  it('should claim a legend once the label colour carries a variable', () => {
    expect(
      getEnabledLegendPrimitives(
        buildVisualization({ colorMode: ColorMode.CLASSES })
      )
    ).toEqual(['text']);

    expect(
      getEnabledLegendPrimitives(
        buildVisualization({ colorMode: ColorMode.CATEGORIES })
      )
    ).toEqual(['text']);
  });

  it('should not claim a legend for a variable size without a column to read', () => {
    expect(
      getEnabledLegendPrimitives(
        buildVisualization({ sizeMode: SizeMode.PROPORTIONAL })
      )
    ).toEqual([]);
  });
});
