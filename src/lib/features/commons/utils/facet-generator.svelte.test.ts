import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getColumnStatistics: vi.fn(),
  getUniqueValues: vi.fn()
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    getColumnStatistics: mocks.getColumnStatistics,
    getUniqueValues: mocks.getUniqueValues
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn() },
  LogCategory: { STORE: 'STORE' }
}));

import { generateFacetVisualizations } from './facet-generator';
import {
  FACET_SLOT,
  SCALE_MODE
} from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';

function makeBaseViz(overrides = {}) {
  return {
    id: 'base-viz',
    name: 'Base',
    datasetId: 'table1',
    mapping: { valueColumn: 'pop', sizeColumn: 'area' },
    polygon: {
      valueColumn: 'pop'
    },
    classification: {
      method: 'equal_interval',
      numClasses: 4,
      classes: 4,
      breaks: [0, 25, 50, 75, 100],
      colors: ['#aaa', '#bbb', '#ccc', '#ddd']
    },
    modes: { fill: 'classes' },
    style: { fillColor: '#ff0000', fillOpacity: 0.8 },
    ...overrides
  };
}

describe('generateFacetVisualizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate one config per variable', async () => {
    const base = makeBaseViz();
    const result = await generateFacetVisualizations(
      base as never,
      ['pop', 'gdp', 'area'],
      SCALE_MODE.SHARED,
      FACET_SLOT.POLYGON_VALUE
    );

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('pop');
    expect(result[1].name).toBe('gdp');
    expect(result[2].name).toBe('area');
  });

  it('should assign unique IDs to each facet', async () => {
    const base = makeBaseViz();
    const result = await generateFacetVisualizations(
      base as never,
      ['pop', 'gdp'],
      SCALE_MODE.SHARED,
      FACET_SLOT.POLYGON_VALUE
    );

    expect(result[0].id).not.toBe(result[1].id);
    expect(result[0].id).not.toBe('base-viz');
  });

  it('should set facet.baseVisualizationId on each config', async () => {
    const base = makeBaseViz();
    const result = await generateFacetVisualizations(
      base as never,
      ['pop'],
      SCALE_MODE.SHARED,
      FACET_SLOT.POLYGON_VALUE
    );

    expect(result[0].facet).toEqual({ baseVisualizationId: 'base-viz' });
  });

  it('should set the targeted polygon value column to the variable name', async () => {
    const base = makeBaseViz();
    const result = await generateFacetVisualizations(
      base as never,
      ['gdp'],
      SCALE_MODE.SHARED,
      FACET_SLOT.POLYGON_VALUE
    );

    expect(result[0].mapping.valueColumn).toBe('gdp');
    expect(result[0].polygon?.valueColumn).toBe('gdp');
  });

  it('should set the targeted symbol size column when faceting on proportional symbols', async () => {
    const base = makeBaseViz({
      symbol: {
        sizeColumn: 'pop'
      }
    });
    const result = await generateFacetVisualizations(
      base as never,
      ['gdp'],
      SCALE_MODE.SHARED,
      FACET_SLOT.SYMBOL_SIZE
    );

    expect(result[0].mapping.sizeColumn).toBe('gdp');
    expect(result[0].symbol?.sizeColumn).toBe('gdp');
  });

  it('should seed labels for targeted categorical facets', async () => {
    mocks.getColumnStatistics.mockReturnValue(null);
    mocks.getUniqueValues.mockReturnValue(['A', 'B', 'C']);
    const base = makeBaseViz({
      mapping: { categoryColumn: 'region' },
      classification: {
        method: 'equal_interval',
        numClasses: 3,
        classes: 3,
        colors: ['#111', '#222', '#333'],
        labels: ['old']
      },
      symbol: {
        categoryColumn: 'region',
        classification: {
          method: 'equal_interval',
          numClasses: 3,
          classes: 3,
          colors: ['#111', '#222', '#333'],
          labels: ['old']
        }
      }
    });
    const result = await generateFacetVisualizations(
      base as never,
      ['country'],
      SCALE_MODE.SHARED,
      FACET_SLOT.SYMBOL_CATEGORY
    );

    expect(result[0].mapping.categoryColumn).toBe('country');
    expect(result[0].symbol?.categoryColumn).toBe('country');
    expect(result[0].symbol?.classification?.labels).toEqual(['A', 'B', 'C']);
  });

  it('should reuse base classification in shared mode', async () => {
    const base = makeBaseViz();
    const result = await generateFacetVisualizations(
      base as never,
      ['pop'],
      SCALE_MODE.SHARED,
      FACET_SLOT.POLYGON_VALUE
    );

    expect(result[0].classification?.breaks).toEqual([0, 25, 50, 75, 100]);
  });

  it('should recalculate breaks in independent mode', async () => {
    mocks.getColumnStatistics.mockReturnValue({ min: 10, max: 50 });

    const base = makeBaseViz();
    const result = await generateFacetVisualizations(
      base as never,
      ['gdp'],
      SCALE_MODE.INDEPENDENT,
      FACET_SLOT.POLYGON_VALUE
    );

    expect(result[0].classification?.breaks).toEqual([10, 20, 30, 40, 50]);
  });

  it('should fall back to base breaks when stats are missing in independent mode', async () => {
    mocks.getColumnStatistics.mockReturnValue(null);

    const base = makeBaseViz();
    const result = await generateFacetVisualizations(
      base as never,
      ['gdp'],
      SCALE_MODE.INDEPENDENT,
      FACET_SLOT.POLYGON_VALUE
    );

    expect(result[0].classification?.breaks).toEqual([0, 25, 50, 75, 100]);
  });

  it('should deep clone base viz properties', async () => {
    const base = makeBaseViz();
    const result = await generateFacetVisualizations(
      base as never,
      ['pop'],
      SCALE_MODE.SHARED,
      FACET_SLOT.POLYGON_VALUE
    );

    expect(result[0].style).not.toBe(base.style);
    expect(result[0].modes).not.toBe(base.modes);
  });

  it('should throw when base viz has no datasetId', async () => {
    const base = makeBaseViz({ datasetId: undefined });

    await expect(
      generateFacetVisualizations(
        base as never,
        ['pop'],
        SCALE_MODE.SHARED,
        FACET_SLOT.POLYGON_VALUE
      )
    ).rejects.toThrow('Base visualization has no dataset');
  });
});
