import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColumnType, type DatasetResult } from '$lib/features/data-pipeline';
import type { ExampleVisualizationPreset } from '$lib/features/commons/store/create-project.types';
import { ExampleCategory } from '$lib/features/commons/constants/ui.constants';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  ClassificationMethod: {
    KMEANS: 'kmeans',
    QUANTILES: 'quantiles',
    EQUAL_INTERVAL: 'equal_interval'
  },
  PrimitiveFilterType: {
    POINT: 'point',
    LINE: 'line',
    POLYGON: 'polygon'
  },
  visualizationStore: {
    getVisualizationsByDataset: vi.fn(() => []),
    createVisualization: vi.fn(),
    visualizations: [],
    updateVisualization: vi.fn()
  }
}));

vi.mock('$lib/features/main-toolbar/constants', () => ({
  FillMode: {
    UNIQUE: 'unique'
  },
  ShapeType: {
    CIRCLE: 'circle'
  },
  SymbolMode: {
    PROPORTIONAL: 'proportional'
  },
  ThicknessMode: {
    PROPORTIONAL: 'proportional'
  }
}));

vi.mock(
  '$lib/features/main-toolbar/visualization-tab/utils/suggestion.service',
  () => ({
    applySuggestionToVisualization: vi.fn(),
    buildSuggestionOrigin: vi.fn((_visualization, origin) => origin),
    mapSuggestionToType: vi.fn(() => 'choropleth')
  })
);

vi.mock(
  '$lib/features/main-toolbar/visualization-tab/utils/suggestion-selection',
  () => ({
    getSuggestionSignature: vi.fn((suggestion) => suggestion.id)
  })
);

import {
  applyExampleVisualizationPresets,
  buildExampleVisualizationSuggestion,
  resolveExampleColumnName
} from './example-visualization-preset.service';
import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import {
  applySuggestionToVisualization,
  buildSuggestionOrigin
} from '$lib/features/main-toolbar/visualization-tab/utils/suggestion.service';

function buildDataset(columns: Array<{ name: string; type: ColumnType }>) {
  return {
    id: 'dataset',
    name: 'Example',
    sourceFileId: 'file',
    tableName: 'example',
    rowCount: 10,
    columns: columns.map((column) => ({
      ...column,
      values: [],
      stats: {
        name: column.name,
        type: column.type,
        count: 10,
        nulls: 0,
        uniques: 10
      }
    })),
    metadata: {
      processedAt: new Date('2026-04-29T00:00:00Z'),
      fileType: 'csv',
      parserUsed: 'test'
    }
  } satisfies DatasetResult;
}

describe('example visualization presets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    visualizationStore.visualizations.length = 0;
    vi.mocked(visualizationStore.getVisualizationsByDataset).mockReturnValue(
      []
    );
    vi.mocked(visualizationStore.createVisualization).mockImplementation(
      (type, datasetId, name) => {
        const visualization: VisualizationConfig = {
          id: 'viz-1',
          type,
          datasetId,
          name: name ?? 'Example visualization',
          enabled: true,
          style: {},
          mapping: {},
          origin: { mode: 'legacy' }
        };
        visualizationStore.visualizations.push(visualization);
        return visualization;
      }
    );
  });

  it('resolves declared display names against normalized dataset columns', () => {
    const dataset = buildDataset([
      { name: 'population_2023', type: ColumnType.NUMBER }
    ]);

    expect(resolveExampleColumnName(dataset.columns, 'Population 2023')).toBe(
      'population_2023'
    );
  });

  it.each([
    [
      { type: 'choropleth', variable: 'Population 2023' },
      'choropleth',
      ['population_2023']
    ],
    [
      { type: 'proportional', variable: 'population' },
      'symbols_proportional',
      ['population']
    ],
    [{ type: 'simple' }, 'polygons_uniques', []],
    [
      {
        type: 'bivariate',
        variable1: 'gdp_per_capita',
        variable2: 'growth_rate'
      },
      'symbols_proportional_colorful_QTR',
      ['gdp_per_capita', 'growth_rate']
    ],
    [{ type: 'flow', variable: 'volume' }, 'lines_proportional', ['volume']]
  ] satisfies Array<[ExampleVisualizationPreset, string, string[]]>)(
    'maps %s to the expected visualization suggestion',
    (preset, expectedId, expectedColumns) => {
      const dataset = buildDataset([
        { name: 'population_2023', type: ColumnType.NUMBER },
        { name: 'population', type: ColumnType.NUMBER },
        { name: 'gdp_per_capita', type: ColumnType.NUMBER },
        { name: 'growth_rate', type: ColumnType.NUMBER },
        { name: 'volume', type: ColumnType.NUMBER }
      ]);

      expect(
        buildExampleVisualizationSuggestion(preset, dataset)
      ).toMatchObject({
        id: expectedId,
        columns: expectedColumns
      });
    }
  );

  it('keeps declared example presets from being auto-overwritten by generic suggestions', () => {
    const dataset = buildDataset([
      { name: 'population_2023', type: ColumnType.NUMBER }
    ]);

    applyExampleVisualizationPresets(
      {
        id: 'world-population',
        title: 'Population Europe 2023',
        subtitle: '',
        description: '',
        category: ExampleCategory.POLYGONS,
        visualizations: [
          {
            type: 'choropleth',
            variable: 'Population 2023'
          }
        ]
      },
      dataset
    );

    expect(buildSuggestionOrigin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'viz-1' }),
      expect.objectContaining({
        mode: 'custom',
        suggestionKey: 'choropleth'
      })
    );
    expect(applySuggestionToVisualization).toHaveBeenCalledWith(
      'viz-1',
      expect.objectContaining({ id: 'choropleth' }),
      expect.objectContaining({
        origin: expect.objectContaining({ mode: 'custom' })
      })
    );
  });
});
