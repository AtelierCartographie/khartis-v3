import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notifyChangeMock: vi.fn(),
  updateLegendItemMock: vi.fn(),
  datasets: [] as Array<unknown>,
  selectedDatasetId: undefined as string | undefined
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  persistenceRegistry: {
    register: vi.fn(),
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    get datasets() {
      return mocks.datasets;
    },
    get selectedDatasetId() {
      return mocks.selectedDatasetId;
    },
    get selectedDataset() {
      return (
        mocks.datasets.find(
          (dataset) =>
            (dataset as { id?: string }).id === mocks.selectedDatasetId
        ) ?? null
      );
    }
  }
}));

vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: {
    currentProject: undefined
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: vi.fn(() => null)
  }
}));

vi.mock('$lib/features/step-toolbar/tools/legend/legend.store.svelte', () => ({
  getLegendState: () => ({ items: [] }),
  legendActions: {
    updateLegendItem: mocks.updateLegendItemMock
  }
}));

import {
  ClassificationMethod,
  PrimitiveFilterType,
  visualizationStore,
  VisualizationType
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  DEFAULT_COLORS,
  FillMode,
  SymbolMode
} from '$lib/features/main-toolbar/constants';
import {
  applyBlankVisualizationPreset,
  applySuggestionToVisualization,
  mapSuggestionToType,
  SUGGESTION_BEHAVIOR_IDS,
  isVisualizationBlank,
  isVisualizationMatchingSuggestion
} from './suggestion.service';

type SuggestionTestDataset = Parameters<
  typeof isVisualizationMatchingSuggestion
>[1];

type SuggestionScenario = {
  suggestionId: string;
  dataset: SuggestionTestDataset;
  geometry: 'point' | 'polygon' | 'line';
};

function createPointDataset(): SuggestionTestDataset {
  return {
    id: 'dataset-1',
    name: 'Point dataset',
    sourceFileId: 'source-1',
    tableName: 'point_dataset',
    rowCount: 12,
    geometry: {
      type: 'Point'
    },
    metadata: {
      processedAt: new Date(),
      fileType: 'geojson',
      parserUsed: 'test'
    },
    columns: [
      { name: 'geometry', type: 'geometry', stats: {}, values: [] },
      { name: 'category', type: 'string', stats: {}, values: [] },
      { name: 'population_total', type: 'number', stats: {}, values: [] },
      { name: 'year', type: 'number', stats: {}, values: [] }
    ]
  } as unknown as SuggestionTestDataset;
}

function createPolygonDataset(): SuggestionTestDataset {
  return {
    id: 'dataset-2',
    name: 'Polygon dataset',
    sourceFileId: 'source-2',
    tableName: 'polygon_dataset',
    rowCount: 12,
    geometry: {
      type: 'Polygon'
    },
    metadata: {
      processedAt: new Date(),
      fileType: 'geojson',
      parserUsed: 'test'
    },
    columns: [
      { name: 'geometry', type: 'geometry', stats: {}, values: [] },
      { name: 'name', type: 'string', stats: {}, values: [] },
      { name: 'population_total', type: 'number', stats: {}, values: [] }
    ]
  } as unknown as SuggestionTestDataset;
}

function createLineDataset(): SuggestionTestDataset {
  return {
    id: 'dataset-3',
    name: 'Line dataset',
    sourceFileId: 'source-3',
    tableName: 'line_dataset',
    rowCount: 12,
    geometry: {
      type: 'LineString'
    },
    metadata: {
      processedAt: new Date(),
      fileType: 'geojson',
      parserUsed: 'test'
    },
    columns: [
      { name: 'geometry', type: 'geometry', stats: {}, values: [] },
      { name: 'category', type: 'string', stats: {}, values: [] },
      { name: 'population_total', type: 'number', stats: {}, values: [] },
      { name: 'density', type: 'number', stats: {}, values: [] }
    ]
  } as unknown as SuggestionTestDataset;
}

function createSuggestionById(
  suggestionId: string,
  geometry: 'point' | 'polygon' | 'line'
): Parameters<typeof applySuggestionToVisualization>[1] {
  const isOrdered = suggestionId.includes('QLO');
  const isCategorical = suggestionId.includes('_QL') || isOrdered;
  const isClassed =
    suggestionId === 'choropleth' ||
    suggestionId.includes('_QTR') ||
    suggestionId === 'lines_colorful_QTR';
  const isText = suggestionId.startsWith('texts_');
  const isDouble = suggestionId === 'symbols_proportional_double';
  const isProportional =
    suggestionId.includes('proportional') ||
    suggestionId === 'lines_proportional';

  let columns: string[] = [];
  let semioTypes: Array<'QTA' | 'QTR' | 'QL' | 'QLO'> = [];

  if (isText) {
    columns =
      suggestionId === 'texts_colorful_QL'
        ? ['name', 'category']
        : ['name', 'population_total'];
    semioTypes =
      suggestionId === 'texts_proportional'
        ? ['QL', 'QTA']
        : suggestionId === 'texts_colorful_QTR'
          ? ['QL', 'QTR']
          : ['QL', 'QL'];
  } else if (isDouble) {
    columns = ['population_total', 'density'];
    semioTypes = ['QTA', 'QTA'];
  } else if (isProportional && isCategorical) {
    columns = ['population_total', 'category'];
    semioTypes = ['QTA', isOrdered ? 'QLO' : 'QL'];
  } else if (isProportional && isClassed) {
    columns = ['population_total', 'density'];
    semioTypes = ['QTA', 'QTR'];
  } else if (isProportional) {
    columns = ['population_total'];
    semioTypes = ['QTA'];
  } else if (isCategorical) {
    columns = ['category'];
    semioTypes = [isOrdered ? 'QLO' : 'QL'];
  } else if (isClassed) {
    columns = ['population_total'];
    semioTypes = ['QTR'];
  }

  return {
    id: suggestionId,
    label: suggestionId,
    nbColumns: columns.length,
    semioTypes,
    geometries: [geometry],
    columns,
    score: 50
  };
}

describe('suggestion.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    visualizationStore.clear();

    const dataset = createPointDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;
  });

  it('recognizes a qualitative point suggestion right after it is applied', () => {
    const dataset = createPointDataset();
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      dataset.id
    );
    const suggestion: Parameters<typeof applySuggestionToVisualization>[1] = {
      id: 'symbols_uniques_colorful_QL',
      label: 'Symboles colorés (qualitatif)',
      nbColumns: 1,
      semioTypes: ['QL'],
      geometries: ['point'],
      columns: ['category'],
      score: 46
    };

    applySuggestionToVisualization(visualization.id, suggestion);

    const updatedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(updatedVisualization).toBeDefined();
    expect(
      isVisualizationMatchingSuggestion(
        updatedVisualization!,
        dataset,
        suggestion
      )
    ).toBe(true);
  });

  it('keeps matching a suggestion after derived classification metadata changes', () => {
    const dataset = createPointDataset();
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      dataset.id
    );
    const suggestion: Parameters<typeof applySuggestionToVisualization>[1] = {
      id: 'symbols_uniques_colorful_QL',
      label: 'Symboles colorés (qualitatif)',
      nbColumns: 1,
      semioTypes: ['QL'],
      geometries: ['point'],
      columns: ['category'],
      score: 46
    };

    applySuggestionToVisualization(visualization.id, suggestion);
    visualizationStore.updateVisualization(visualization.id, {
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 2,
        colors: ['#1192e8', '#ff832b'],
        labels: ['private', 'public']
      }
    });

    const updatedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(updatedVisualization).toBeDefined();
    expect(
      isVisualizationMatchingSuggestion(
        updatedVisualization!,
        dataset,
        suggestion
      )
    ).toBe(true);
  });

  it('resets polygon visualizations to a neutral blank state', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      dataset.id
    );

    applyBlankVisualizationPreset(visualization.id, dataset);

    const updatedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(updatedVisualization).toBeDefined();
    expect(updatedVisualization?.type).toBe(VisualizationType.CHOROPLETH);
    expect(updatedVisualization?.modes?.fill).toBe(FillMode.NONE);
    expect(updatedVisualization?.mapping.geometryColumn).toBe('geometry');
    expect(updatedVisualization?.mapping.valueColumn).toBeUndefined();
    expect(updatedVisualization?.classification).toBeUndefined();
    expect(updatedVisualization?.style.fillOpacity).toBe(0.8);
    expect(updatedVisualization?.style.strokeColor).toBe(DEFAULT_COLORS.gray);
    expect(updatedVisualization?.style.lineColor).toBe(DEFAULT_COLORS.gray);
    expect(updatedVisualization?.missingData?.show).toBe(false);
    expect(updatedVisualization?.style.labelHalo).toBe(false);
    expect(updatedVisualization?.style.textCollisionDetection).toBe(false);
    expect(isVisualizationBlank(updatedVisualization!, dataset)).toBe(true);
  });

  it('resets point visualizations to a neutral symbol state', () => {
    const dataset = createPointDataset();
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      dataset.id
    );

    applyBlankVisualizationPreset(visualization.id, dataset);

    const updatedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(updatedVisualization).toBeDefined();
    expect(updatedVisualization?.type).toBe(VisualizationType.PROPORTIONAL);
    expect(updatedVisualization?.modes?.symbol).toBe(SymbolMode.UNIQUE);
    expect(updatedVisualization?.mapping.sizeColumn).toBeUndefined();
    expect(updatedVisualization?.mapping.valueColumn).toBeUndefined();
    expect(updatedVisualization?.style.fillColor).toBe(DEFAULT_COLORS.gray);
    expect(updatedVisualization?.style.strokeColor).toBe(DEFAULT_COLORS.gray);
    expect(updatedVisualization?.style.lineColor).toBe(DEFAULT_COLORS.gray);
    expect(updatedVisualization?.missingData?.show).toBe(false);
    expect(isVisualizationBlank(updatedVisualization!, dataset)).toBe(true);
  });

  it('keeps polygon text suggestions text-only by default', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      dataset.id
    );
    const suggestion: Parameters<typeof applySuggestionToVisualization>[1] = {
      id: 'texts_proportional',
      label: 'Textes proportionnels',
      nbColumns: 2,
      semioTypes: ['QL', 'QTA'],
      geometries: ['polygon'],
      columns: ['name', 'population_total'],
      score: 50
    };

    applySuggestionToVisualization(visualization.id, suggestion);

    const updatedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(updatedVisualization).toBeDefined();
    expect(updatedVisualization?.type).toBe(VisualizationType.BIVARIATE);
    expect(updatedVisualization?.mapping.labelColumn).toBe('name');
    expect(updatedVisualization?.mapping.sizeColumn).toBe('population_total');
    expect(updatedVisualization?.mapping.valueColumn).toBeUndefined();
    expect(updatedVisualization?.modes?.size).toBeDefined();
    expect(updatedVisualization?.modes?.symbol).toBe(SymbolMode.UNIQUE);
    expect(updatedVisualization?.primitiveFilters).toEqual([
      PrimitiveFilterType.POLYGON
    ]);
    expect(updatedVisualization?.style.fillOpacity).toBe(0);
    expect(updatedVisualization?.style.textOpacity).toBe(1);
    expect(updatedVisualization?.style.labelOpacity).toBe(0);
    expect(
      isVisualizationMatchingSuggestion(
        updatedVisualization!,
        dataset,
        suggestion
      )
    ).toBe(true);
  });

  it('keeps polygon symbol suggestions on points with neutral polygon support', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      dataset.id
    );
    const suggestion = createSuggestionById('symbols_proportional', 'polygon');

    applySuggestionToVisualization(visualization.id, suggestion);

    const updatedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(updatedVisualization?.primitiveFilters).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.POLYGON
    ]);
    expect(updatedVisualization?.modes?.symbol).toBe(SymbolMode.PROPORTIONAL);
    expect(updatedVisualization?.style.fillOpacity).toBe(0);
    expect(updatedVisualization?.symbols?.opacity).toBe(0.8);
    expect(
      isVisualizationMatchingSuggestion(
        updatedVisualization!,
        dataset,
        suggestion
      )
    ).toBe(true);
  });

  it('keeps choropleth suggestions polygon-only', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      dataset.id
    );
    const suggestion = createSuggestionById('choropleth', 'polygon');

    applySuggestionToVisualization(visualization.id, suggestion);

    const updatedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(updatedVisualization?.primitiveFilters).toEqual([
      PrimitiveFilterType.POLYGON
    ]);
    expect(updatedVisualization?.mapping.valueColumn).toBe('population_total');
    expect(updatedVisualization?.style.textOpacity).toBe(0);
    expect(updatedVisualization?.style.labelOpacity).toBe(0);
  });

  it('matches every registered suggestion immediately after application', () => {
    const pointDataset = createPointDataset();
    const polygonDataset = createPolygonDataset();
    const lineDataset = createLineDataset();

    const scenarios: SuggestionScenario[] = SUGGESTION_BEHAVIOR_IDS.flatMap(
      (suggestionId): SuggestionScenario[] => {
        if (suggestionId.startsWith('lines_')) {
          return [
            {
              suggestionId,
              dataset: lineDataset,
              geometry: 'line' as const
            }
          ];
        }

        if (
          suggestionId === 'choropleth' ||
          suggestionId.startsWith('polygons_')
        ) {
          return [
            {
              suggestionId,
              dataset: polygonDataset,
              geometry: 'polygon' as const
            }
          ];
        }

        return [
          {
            suggestionId,
            dataset: pointDataset,
            geometry: 'point' as const
          },
          {
            suggestionId,
            dataset: polygonDataset,
            geometry: 'polygon' as const
          }
        ];
      }
    );

    scenarios.forEach(({ suggestionId, dataset, geometry }) => {
      mocks.datasets = [dataset];
      mocks.selectedDatasetId = dataset.id;

      const suggestion = createSuggestionById(suggestionId, geometry);
      const visualization = visualizationStore.createVisualization(
        mapSuggestionToType(suggestionId),
        dataset.id
      );

      applySuggestionToVisualization(visualization.id, suggestion);

      const updatedVisualization = visualizationStore.visualizations.find(
        (item) => item.id === visualization.id
      );

      expect(updatedVisualization).toBeDefined();
      expect(
        isVisualizationMatchingSuggestion(
          updatedVisualization!,
          dataset,
          suggestion
        )
      ).toBe(true);

      visualizationStore.clear();
    });
  });
});
