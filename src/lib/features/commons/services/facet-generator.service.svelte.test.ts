import { m } from '$lib/paraglide/messages';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calculateBreaks: vi.fn(),
  getUniqueValues: vi.fn(),
  loadDistinctCategoryLabels: vi.fn(),
  resolveRowScopeClause: vi.fn(() => null as string | null)
}));

// A visualization carries the store id, which stops matching the source file
// id as soon as a project has been saved and reopened.
vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    datasets: [{ id: 'table1', tableName: 'table1', sourceFileId: 'source1' }],
    getUniqueValues: mocks.getUniqueValues
  }
}));

vi.mock('./row-scope.service', () => ({
  resolveRowScopeClause: mocks.resolveRowScopeClause
}));

vi.mock('$lib/features/commons/utils/category-labels.utils', () => ({
  loadDistinctCategoryLabels: mocks.loadDistinctCategoryLabels
}));

vi.mock('./classification.service', () => ({
  calculateBreaks: mocks.calculateBreaks
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn() },
  LogCategory: { STORE: 'STORE' }
}));

import {
  buildFacetSlotUpdates,
  buildFacetVisualizationUpdates,
  generateFacetVisualizations
} from './facet-generator.service';
import {
  FACET_SLOT,
  SCALE_MODE
} from '$lib/features/commons/constants/facets.constants';
import { PrimitiveFilterType } from '$lib/features/commons/stores/visualization.store.svelte';

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
    mocks.resolveRowScopeClause.mockReturnValue(null);
    mocks.loadDistinctCategoryLabels.mockResolvedValue([]);
    mocks.calculateBreaks.mockResolvedValue({
      breaks: [20, 30, 40],
      counts: [1, 1, 1, 1],
      min: 10,
      max: 50
    });
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

  it('should target text background stroke facets without overwriting fill facets', async () => {
    const fillClassification = {
      method: 'equal_interval',
      numClasses: 4,
      classes: 4,
      colors: ['#100', '#200', '#300', '#400']
    };
    const strokeClassification = {
      method: 'equal_interval',
      numClasses: 4,
      classes: 4,
      colors: ['#010', '#020', '#030', '#040']
    };
    const base = makeBaseViz({
      text: {
        background: {
          fillMode: 'classes',
          valueColumn: 'fill-value',
          classification: fillClassification,
          strokeMode: 'classes',
          strokeValueColumn: 'stroke-value',
          strokeClassification
        }
      }
    });

    const result = await generateFacetVisualizations(
      base as never,
      ['stroke-next'],
      SCALE_MODE.SHARED,
      FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE
    );

    expect(result[0].text?.background.valueColumn).toBe('fill-value');
    expect(result[0].text?.background.strokeValueColumn).toBe('stroke-next');
    expect(result[0].text?.background.classification).toEqual(
      fillClassification
    );
    expect(result[0].text?.background.strokeClassification).toEqual(
      strokeClassification
    );
  });

  it('should target symbol stroke facets without overwriting symbol fill facets', async () => {
    const fillClassification = {
      method: 'equal_interval',
      numClasses: 4,
      classes: 4,
      colors: ['#100', '#200', '#300', '#400']
    };
    const strokeClassification = {
      method: 'equal_interval',
      numClasses: 4,
      classes: 4,
      colors: ['#010', '#020', '#030', '#040']
    };
    const base = makeBaseViz({
      symbol: {
        fillValueColumn: 'fill-value',
        fillClassification,
        strokeValueColumn: 'stroke-value',
        strokeClassification
      }
    });

    const result = await generateFacetVisualizations(
      base as never,
      ['stroke-next'],
      SCALE_MODE.SHARED,
      FACET_SLOT.SYMBOL_STROKE_VALUE
    );

    expect(result[0].symbol?.fillValueColumn).toBe('fill-value');
    expect(result[0].symbol?.strokeValueColumn).toBe('stroke-next');
    expect(result[0].symbol?.fillClassification).toEqual(fillClassification);
    expect(result[0].symbol?.strokeClassification).toEqual(
      strokeClassification
    );
  });

  it('should target polygon stroke facets without overwriting polygon fill facets', async () => {
    const fillClassification = {
      method: 'equal_interval',
      numClasses: 4,
      classes: 4,
      colors: ['#100', '#200', '#300', '#400']
    };
    const strokeClassification = {
      method: 'equal_interval',
      numClasses: 4,
      classes: 4,
      colors: ['#010', '#020', '#030', '#040']
    };
    const base = makeBaseViz({
      polygon: {
        valueColumn: 'fill-value',
        classification: fillClassification,
        strokeValueColumn: 'stroke-value',
        strokeClassification
      }
    });

    const result = await generateFacetVisualizations(
      base as never,
      ['stroke-next'],
      SCALE_MODE.SHARED,
      FACET_SLOT.POLYGON_STROKE_VALUE
    );

    expect(result[0].polygon?.valueColumn).toBe('fill-value');
    expect(result[0].polygon?.strokeValueColumn).toBe('stroke-next');
    expect(result[0].polygon?.classification).toEqual(fillClassification);
    expect(result[0].polygon?.strokeClassification).toEqual(
      strokeClassification
    );
  });

  it('should seed labels for targeted categorical facets', async () => {
    mocks.getUniqueValues.mockReturnValue(['preview-only']);
    mocks.loadDistinctCategoryLabels.mockResolvedValue(['A', 'B', 'C']);
    const base = makeBaseViz({
      mapping: { categoryColumn: 'region' },
      classification: {
        method: 'equal_interval',
        numClasses: 3,
        classes: 3,
        colors: ['#111', '#222', '#333'],
        labels: ['old'],
        categoryValues: ['old']
      },
      symbol: {
        categoryColumn: 'region',
        classification: {
          method: 'equal_interval',
          numClasses: 3,
          classes: 3,
          colors: ['#111', '#222', '#333'],
          labels: ['old'],
          categoryValues: ['old']
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
    expect(result[0].symbol?.classification?.categoryValues).toEqual([
      'A',
      'B',
      'C'
    ]);
    expect(mocks.loadDistinctCategoryLabels).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'table1', tableName: 'table1' }),
      'country'
    );
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
    const base = makeBaseViz();
    const result = await generateFacetVisualizations(
      base as never,
      ['gdp'],
      SCALE_MODE.INDEPENDENT,
      FACET_SLOT.POLYGON_VALUE
    );

    expect(mocks.calculateBreaks).toHaveBeenCalledWith({
      datasetId: 'source1',
      columnName: 'gdp',
      method: 'equal_interval',
      rowScopeClause: null,
      numClasses: 4
    });
    expect(result[0].classification?.breaks).toEqual([20, 30, 40]);
    expect(result[0].classification?.counts).toEqual([1, 1, 1, 1]);
  });

  it('recomputes independent facet breaks over the filtered rows', async () => {
    mocks.resolveRowScopeClause.mockReturnValue('"pop" >= 1000');

    await generateFacetVisualizations(
      makeBaseViz() as never,
      ['gdp'],
      SCALE_MODE.INDEPENDENT,
      FACET_SLOT.POLYGON_VALUE
    );

    expect(mocks.resolveRowScopeClause).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: 'source1',
        primitive: PrimitiveFilterType.POLYGON
      })
    );
    expect(mocks.calculateBreaks).toHaveBeenCalledWith(
      expect.objectContaining({ rowScopeClause: '"pop" >= 1000' })
    );
  });

  it('should recalculate line thickness breaks in independent mode', async () => {
    const base = makeBaseViz({
      line: {
        valueColumn: 'traffic',
        thicknessClassification: {
          method: 'equal_interval',
          numClasses: 4,
          classes: 4,
          breaks: [0, 25, 50, 75, 100],
          colors: ['#aaa', '#bbb', '#ccc', '#ddd']
        }
      }
    });

    const result = await generateFacetVisualizations(
      base as never,
      ['length'],
      SCALE_MODE.INDEPENDENT,
      FACET_SLOT.LINE_THICKNESS_VALUE
    );

    expect(result[0].line?.valueColumn).toBe('length');
    expect(result[0].line?.thicknessClassification?.breaks).toEqual([
      20, 30, 40
    ]);
  });

  it('builds an in-place visualization update for scale mode changes without changing ids', async () => {
    const base = makeBaseViz();
    const update = await buildFacetVisualizationUpdates({
      baseViz: base as never,
      visualization: {
        ...makeBaseViz({
          id: 'facet-a',
          name: 'pop',
          polygon: {
            valueColumn: 'pop'
          }
        }),
        id: 'facet-a',
        name: 'pop'
      } as never,
      variable: 'gdp',
      scaleMode: SCALE_MODE.INDEPENDENT,
      primarySlotPath: FACET_SLOT.POLYGON_VALUE
    });

    expect(update.name).toBe('gdp');
    expect(update.mapping).toEqual({
      valueColumn: 'gdp',
      sizeColumn: 'area'
    });
    expect(update.polygon?.valueColumn).toBe('gdp');
    expect(update.classification?.breaks).toEqual([20, 30, 40]);
  });

  it('rebuilds the targeted categorical slot domain without changing the fill domain', async () => {
    mocks.loadDistinctCategoryLabels.mockResolvedValue(['AT11', 'AT12']);
    const fillClassification = {
      method: 'equal_interval',
      colors: ['#111', '#222'],
      labels: ['EU27', 'EFTA'],
      categoryValues: ['EU27', 'EFTA']
    };
    const strokeClassification = {
      method: 'equal_interval',
      colors: ['#333', '#444'],
      labels: ['EU27', 'EFTA'],
      categoryValues: ['EU27', 'EFTA']
    };
    const base = makeBaseViz({
      mapping: { categoryColumn: 'zone' },
      classification: fillClassification,
      polygon: {
        categoryColumn: 'zone',
        classification: fillClassification,
        strokeCategoryColumn: 'zone',
        strokeClassification
      }
    });

    const update = await buildFacetSlotUpdates({
      baseViz: base as never,
      visualization: base as never,
      variable: 'NUTS_ID',
      scaleMode: SCALE_MODE.INDEPENDENT,
      slotPath: FACET_SLOT.POLYGON_STROKE_CATEGORY
    });

    expect(update.classification).toEqual(fillClassification);
    expect(update.polygon?.categoryColumn).toBe('zone');
    expect(update.polygon?.classification).toEqual(fillClassification);
    expect(update.polygon?.strokeCategoryColumn).toBe('NUTS_ID');
    expect(update.polygon?.strokeClassification?.labels).toEqual([
      'AT11',
      'AT12'
    ]);
    expect(update.polygon?.strokeClassification?.categoryValues).toEqual([
      'AT11',
      'AT12'
    ]);
  });

  it('can sync non-faceted primitive changes from the base visualization', async () => {
    const base = makeBaseViz({
      symbol: {
        enabled: true,
        sizeColumn: 'population_total'
      },
      line: {
        enabled: true,
        valueColumn: 'traffic'
      },
      text: {
        enabled: true,
        labelColumn: 'place_name',
        opacity: 1
      }
    });

    const update = await buildFacetVisualizationUpdates({
      baseViz: base as never,
      visualization: base as never,
      variable: 'gdp',
      scaleMode: SCALE_MODE.SHARED,
      primarySlotPath: FACET_SLOT.POLYGON_VALUE
    });

    expect(update.polygon?.valueColumn).toBe('gdp');
    expect(update.symbol?.enabled).toBe(true);
    expect(update.symbol?.sizeColumn).toBe('population_total');
    expect(update.line?.enabled).toBe(true);
    expect(update.line?.valueColumn).toBe('traffic');
    expect(update.text?.enabled).toBe(true);
    expect(update.text?.labelColumn).toBe('place_name');
    expect(update.text?.opacity).toBe(1);
    // Bridage #177: the other primitives stay configured but the facet only
    // renders the collection's primitive, so it must restrict primitiveFilters.
    expect(update.primitiveFilters).toEqual([PrimitiveFilterType.POLYGON]);
  });

  it('should fall back to base breaks when break calculation returns null in independent mode', async () => {
    mocks.calculateBreaks.mockResolvedValueOnce(null);

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
    ).rejects.toThrow(m.error_facet_base_viz_no_dataset());
  });
});
