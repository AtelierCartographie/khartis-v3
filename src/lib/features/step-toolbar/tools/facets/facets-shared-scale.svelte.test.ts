import { describe, expect, it } from 'vitest';
import {
  FACET_SLOT,
  SCALE_MODE
} from '$lib/features/commons/constants/facets.constants';
import {
  resolveSharedFacetScaleColumns,
  resolveSharedFacetScaleStats
} from './facets-shared-scale';

function makeVisualization(overrides = {}) {
  return {
    id: 'viz',
    datasetId: 'dataset',
    mapping: {},
    style: {},
    ...overrides
  };
}

describe('resolveSharedFacetScaleStats', () => {
  it('resolves a shared point statistics domain for symbol size facets', () => {
    const result = resolveSharedFacetScaleStats({
      scaleMode: SCALE_MODE.SHARED,
      primarySlotPath: FACET_SLOT.SYMBOL_SIZE,
      visualizations: [
        makeVisualization({
          symbol: { sizeColumn: 'population' }
        }) as never,
        makeVisualization({
          symbol: { sizeColumn: 'area' }
        }) as never
      ],
      getColumnStatistics: (_datasetId, columnName) =>
        columnName === 'population'
          ? { min: 10, max: 100 }
          : { min: 1, max: 1000 }
    });

    expect(result).toEqual({
      statistics: { min: 1, max: 1000 },
      pointStatistics: { min: 1, max: 1000 }
    });
  });

  it('keeps proportional symbol facets independent outside shared mode', () => {
    const result = resolveSharedFacetScaleStats({
      scaleMode: SCALE_MODE.INDEPENDENT,
      primarySlotPath: FACET_SLOT.SYMBOL_SIZE,
      visualizations: [
        makeVisualization({
          symbol: { sizeColumn: 'population' }
        }) as never,
        makeVisualization({
          symbol: { sizeColumn: 'area' }
        }) as never
      ],
      getColumnStatistics: () => ({ min: 1, max: 1000 })
    });

    expect(result).toBeNull();
  });

  it('resolves the shared line statistics domain for proportional line size facets', () => {
    const result = resolveSharedFacetScaleStats({
      scaleMode: SCALE_MODE.SHARED,
      primarySlotPath: FACET_SLOT.LINE_SIZE,
      visualizations: [
        makeVisualization({
          line: { sizeColumn: 'traffic' }
        }) as never,
        makeVisualization({
          line: { sizeColumn: 'length' }
        }) as never
      ],
      getColumnStatistics: (_datasetId, columnName) =>
        columnName === 'traffic' ? { min: 20, max: 80 } : { min: 5, max: 200 }
    });

    expect(result).toEqual({
      lineStatistics: { min: 5, max: 200 }
    });
  });

  it('resolves the shared text statistics domain for proportional text size facets', () => {
    const result = resolveSharedFacetScaleStats({
      scaleMode: SCALE_MODE.SHARED,
      primarySlotPath: FACET_SLOT.TEXT_VALUE,
      visualizations: [
        makeVisualization({
          text: { valueColumn: 'population' }
        }) as never,
        makeVisualization({
          text: { valueColumn: 'density' }
        }) as never
      ],
      getColumnStatistics: (_datasetId, columnName) =>
        columnName === 'population'
          ? { min: 1000, max: 2000 }
          : { min: 10, max: 500 }
    });

    expect(result).toEqual({
      statistics: { min: 10, max: 2000 },
      textStatistics: { min: 10, max: 2000 }
    });
  });

  it('does not override statistics for classified color facets', () => {
    const result = resolveSharedFacetScaleStats({
      scaleMode: SCALE_MODE.SHARED,
      primarySlotPath: FACET_SLOT.POLYGON_VALUE,
      visualizations: [
        makeVisualization({
          polygon: { valueColumn: 'population' }
        }) as never,
        makeVisualization({
          polygon: { valueColumn: 'area' }
        }) as never
      ],
      getColumnStatistics: () => ({ min: 1, max: 1000 })
    });

    expect(result).toBeNull();
  });

  it('ignores non-numeric or missing statistics', () => {
    const result = resolveSharedFacetScaleStats({
      scaleMode: SCALE_MODE.SHARED,
      primarySlotPath: FACET_SLOT.SYMBOL_SIZE,
      visualizations: [
        makeVisualization({
          symbol: { sizeColumn: 'population' }
        }) as never,
        makeVisualization({
          symbol: { sizeColumn: 'name' }
        }) as never
      ],
      getColumnStatistics: (_datasetId, columnName) =>
        columnName === 'population'
          ? { min: 10, max: 100 }
          : { uniqueCount: 12 }
    });

    expect(result).toBeNull();
  });
});

describe('resolveSharedFacetScaleColumns', () => {
  const facetVisualizations = [
    makeVisualization({
      id: 'facet-a',
      symbol: { sizeColumn: 'population' }
    }) as never,
    makeVisualization({
      id: 'facet-b',
      symbol: { sizeColumn: 'area' }
    }) as never
  ];

  it('lists every facet column merged by a shared symbol size scale', () => {
    expect(
      resolveSharedFacetScaleColumns({
        visualizations: facetVisualizations,
        scaleMode: SCALE_MODE.SHARED,
        primarySlotPath: FACET_SLOT.SYMBOL_SIZE,
        visualizationId: 'facet-a',
        columnName: 'population'
      })
    ).toEqual([
      {
        visualizationId: 'facet-a',
        datasetId: 'dataset',
        columnName: 'population'
      },
      { visualizationId: 'facet-b', datasetId: 'dataset', columnName: 'area' }
    ]);
  });

  it('ignores a column the shared slot does not vary', () => {
    expect(
      resolveSharedFacetScaleColumns({
        visualizations: facetVisualizations,
        scaleMode: SCALE_MODE.SHARED,
        primarySlotPath: FACET_SLOT.SYMBOL_SIZE,
        visualizationId: 'facet-a',
        columnName: 'density'
      })
    ).toEqual([]);
  });

  it('merges nothing when each facet keeps its own scale', () => {
    expect(
      resolveSharedFacetScaleColumns({
        visualizations: facetVisualizations,
        scaleMode: SCALE_MODE.INDEPENDENT,
        primarySlotPath: FACET_SLOT.SYMBOL_SIZE,
        visualizationId: 'facet-a',
        columnName: 'population'
      })
    ).toEqual([]);
  });

  it('merges nothing for a classified color slot, which shares its breaks', () => {
    expect(
      resolveSharedFacetScaleColumns({
        visualizations: [
          makeVisualization({
            id: 'facet-a',
            polygon: { valueColumn: 'population' }
          }) as never,
          makeVisualization({
            id: 'facet-b',
            polygon: { valueColumn: 'area' }
          }) as never
        ],
        scaleMode: SCALE_MODE.SHARED,
        primarySlotPath: FACET_SLOT.POLYGON_VALUE,
        visualizationId: 'facet-a',
        columnName: 'population'
      })
    ).toEqual([]);
  });
});
