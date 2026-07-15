import { describe, expect, it, vi } from 'vitest';

// The visualization store pulls in the DuckDB worker bootstrap at import time;
// jsdom has no Worker. Stub it before the store module is evaluated.
vi.hoisted(() => {
  class WorkerStub {
    terminate() {}

    postMessage() {}

    addEventListener() {}

    removeEventListener() {}
  }
  Object.assign(globalThis, { Worker: WorkerStub });
});

import {
  getClassedSizeForValue,
  getColorForValue,
  shouldApplyChoropleth,
  shouldApplyCategorical
} from './data-styling.utils';
import { createClassedSizeAccessor } from '../layers/layer-helpers';
import {
  ColorMode,
  FillMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  PrimitiveFilterType,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';

const QUALITATIVE_COLORS = [
  '#e41a1c',
  '#377eb8',
  '#4daf4a',
  '#984ea3',
  '#ff7f00'
];
const COUNTRY_LABELS = ['France', 'Spain', 'Germany', 'Italy', 'Poland'];
// Population breaks left over from a previous "classes" choropleth.
const RESIDUAL_BREAKS = [0, 1_000_000, 5_000_000, 20_000_000, 80_000_000];

function makeViz(overrides: Partial<VisualizationConfig>): VisualizationConfig {
  return {
    id: 'viz-1',
    type: 'choropleth',
    style: {},
    mapping: { categoryColumn: 'country_name', valueColumn: 'population_2023' },
    modes: {},
    classification: undefined,
    ...overrides
  } as unknown as VisualizationConfig;
}

describe('classes/categories exclusivity per primitive', () => {
  it('should not apply choropleth when the polygon fill mode is categories despite a residual global modes.fill=classes', () => {
    const viz = makeViz({
      polygon: { enabled: true, fillMode: FillMode.CATEGORIES },
      // Legacy global mode left on "classes" after switching the primitive.
      modes: { fill: FillMode.CLASSES },
      classification: {
        colors: QUALITATIVE_COLORS,
        labels: COUNTRY_LABELS,
        categoryValues: COUNTRY_LABELS,
        breaks: RESIDUAL_BREAKS
      }
    } as unknown as Partial<VisualizationConfig>);

    expect(shouldApplyChoropleth(viz, PrimitiveFilterType.POLYGON)).toBe(false);
    expect(shouldApplyCategorical(viz, PrimitiveFilterType.POLYGON)).toBe(true);
  });

  it('should still apply choropleth for a legacy polygon that only carries the global modes.fill=classes', () => {
    const viz = makeViz({
      // No explicit fillMode: it must fall back to the legacy global mode.
      polygon: { enabled: true },
      modes: { fill: FillMode.CLASSES },
      classification: { colors: QUALITATIVE_COLORS, breaks: RESIDUAL_BREAKS }
    } as unknown as Partial<VisualizationConfig>);

    expect(shouldApplyChoropleth(viz, PrimitiveFilterType.POLYGON)).toBe(true);
    expect(shouldApplyCategorical(viz, PrimitiveFilterType.POLYGON)).toBe(
      false
    );
  });

  it('should not apply choropleth on symbols when the fill mode is categories despite residual classes column/breaks', () => {
    const viz = makeViz({
      symbol: {
        enabled: true,
        mode: SymbolMode.UNIQUE,
        fillMode: FillMode.CATEGORIES,
        // Column + classification left over from a previous classed fill.
        fillValueColumn: 'population_2023',
        fillCategoryColumn: 'country_name',
        fillClassification: {
          colors: QUALITATIVE_COLORS,
          labels: COUNTRY_LABELS,
          categoryValues: COUNTRY_LABELS,
          breaks: RESIDUAL_BREAKS
        }
      },
      modes: { fill: FillMode.CLASSES }
    } as unknown as Partial<VisualizationConfig>);

    expect(shouldApplyChoropleth(viz, PrimitiveFilterType.POINT)).toBe(false);
    expect(shouldApplyCategorical(viz, PrimitiveFilterType.POINT)).toBe(true);
  });
});

// 2 classes = 1 interior break: the store persists interior breaks only.
const TWO_CLASS_BREAKS = [50];
const TWO_CLASS_COLORS = ['#deebf7', '#3182bd'];
const TWO_CLASS_COUNT = 2;
const VALUE_BELOW_BREAK = 10;
const VALUE_ABOVE_BREAK = 80;

describe('two-class classification (1 interior break)', () => {
  it('should apply choropleth on polygons when a 2-class classification has a single interior break', () => {
    const viz = makeViz({
      polygon: { enabled: true, fillMode: FillMode.CLASSES },
      classification: {
        breaks: TWO_CLASS_BREAKS,
        colors: TWO_CLASS_COLORS,
        numClasses: TWO_CLASS_COUNT
      }
    } as unknown as Partial<VisualizationConfig>);

    expect(shouldApplyChoropleth(viz, PrimitiveFilterType.POLYGON)).toBe(true);
  });

  it('should apply choropleth on symbol fill when a 2-class classification has a single interior break', () => {
    const viz = makeViz({
      symbol: {
        enabled: true,
        mode: SymbolMode.UNIQUE,
        fillMode: FillMode.CLASSES,
        fillValueColumn: 'population_2023',
        fillClassification: {
          breaks: TWO_CLASS_BREAKS,
          colors: TWO_CLASS_COLORS,
          numClasses: TWO_CLASS_COUNT
        }
      }
    } as unknown as Partial<VisualizationConfig>);

    expect(shouldApplyChoropleth(viz, PrimitiveFilterType.POINT)).toBe(true);
  });

  it('should apply choropleth on lines and texts when a 2-class classification has a single interior break', () => {
    const viz = makeViz({
      line: {
        enabled: true,
        colorMode: ColorMode.CLASSES,
        classification: {
          breaks: TWO_CLASS_BREAKS,
          colors: TWO_CLASS_COLORS,
          numClasses: TWO_CLASS_COUNT
        }
      },
      text: {
        enabled: true,
        colorMode: ColorMode.CLASSES,
        classification: {
          breaks: TWO_CLASS_BREAKS,
          colors: TWO_CLASS_COLORS,
          numClasses: TWO_CLASS_COUNT
        }
      }
    } as unknown as Partial<VisualizationConfig>);

    expect(shouldApplyChoropleth(viz, PrimitiveFilterType.LINE)).toBe(true);
    expect(shouldApplyChoropleth(viz, PrimitiveFilterType.TEXT)).toBe(true);
  });

  it('should color the two classes distinctly when values fall on each side of the single break', () => {
    expect(
      getColorForValue(VALUE_BELOW_BREAK, TWO_CLASS_BREAKS, TWO_CLASS_COLORS)
    ).toEqual(hexToRgb(TWO_CLASS_COLORS[0]));
    expect(
      getColorForValue(VALUE_ABOVE_BREAK, TWO_CLASS_BREAKS, TWO_CLASS_COLORS)
    ).toEqual(hexToRgb(TWO_CLASS_COLORS[1]));
  });

  it('should size point symbols in two classes when the class count hint matches breaks.length + 1', () => {
    const minPointRadius = 4;
    const maxPointRadius = 20;
    const pointRadiusAccessor = createClassedSizeAccessor(
      'population_2023',
      TWO_CLASS_BREAKS,
      minPointRadius,
      maxPointRadius,
      TWO_CLASS_COUNT
    );

    expect(pointRadiusAccessor({ population_2023: VALUE_BELOW_BREAK })).toBe(
      minPointRadius
    );
    expect(pointRadiusAccessor({ population_2023: VALUE_ABOVE_BREAK })).toBe(
      maxPointRadius
    );
  });

  it('should size line widths in two classes when the class count hint matches breaks.length + 1', () => {
    const minLineWidth = 1;
    const maxLineWidth = 8;
    const lineWidthAccessor = createClassedSizeAccessor(
      'population_2023',
      TWO_CLASS_BREAKS,
      minLineWidth,
      maxLineWidth,
      TWO_CLASS_COUNT
    );

    expect(lineWidthAccessor({ population_2023: VALUE_BELOW_BREAK })).toBe(
      minLineWidth
    );
    expect(lineWidthAccessor({ population_2023: VALUE_ABOVE_BREAK })).toBe(
      maxLineWidth
    );
  });

  it('should size texts in two classes when the class count hint matches breaks.length + 1', () => {
    const minTextSize = 12;
    const maxTextSize = 24;

    expect(
      getClassedSizeForValue(
        VALUE_BELOW_BREAK,
        TWO_CLASS_BREAKS,
        minTextSize,
        maxTextSize,
        TWO_CLASS_COUNT
      )
    ).toBe(minTextSize);
    expect(
      getClassedSizeForValue(
        VALUE_ABOVE_BREAK,
        TWO_CLASS_BREAKS,
        minTextSize,
        maxTextSize,
        TWO_CLASS_COUNT
      )
    ).toBe(maxTextSize);
  });

  it('should keep returning the minimum size when a single break comes without a matching class count hint', () => {
    expect(
      getClassedSizeForValue(VALUE_ABOVE_BREAK, TWO_CLASS_BREAKS, 4, 20)
    ).toBe(4);
  });
});
