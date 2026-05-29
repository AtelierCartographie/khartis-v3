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
  shouldApplyChoropleth,
  shouldApplyCategorical
} from './data-styling.utils';
import {
  FillMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  PrimitiveFilterType,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';

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
