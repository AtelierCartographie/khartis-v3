import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  computeClassificationBreaksMock: vi.fn(),
  notifyChangeMock: vi.fn(),
  updateLegendItemMock: vi.fn(),
  datasets: [] as Array<unknown>,
  selectedDatasetId: undefined as string | undefined
}));

vi.mock(
  '$lib/features/visualization-tab/hooks/use-classification-breaks.svelte',
  () => ({
    computeClassificationBreaks: mocks.computeClassificationBreaksMock
  })
);

vi.mock('$lib/features/project-management/core', () => ({
  SavePriority: {
    IMMEDIATE: 'immediate',
    DEBOUNCED: 'debounced'
  },
  persistenceRegistry: {
    register: vi.fn(),
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
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

vi.mock('$lib/features/commons/stores/project.store.svelte', () => ({
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
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  DEFAULT_COLORS,
  FillMode,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  applyBlankVisualizationPreset,
  applySuggestionToVisualization,
  buildSuggestionOrigin,
  mapSuggestionToType,
  resolveBlankVisualizationType,
  isVisualizationBlank,
  isVisualizationMatchingSuggestion,
  rememberAppliedSuggestionState,
  resolveDatasetGeometryType,
  restoreVisualizationFromSuggestion
} from './suggestion.service';
import { ORDERED_CATEGORY_PALETTE_ID } from '$lib/features/commons/components/palette-popover/palette.constants';
import { applyExampleVisualizationPresets } from '$lib/features/create-project/services/example-visualization-preset.service';
import { ExampleCategory } from '$lib/features/commons/constants/ui.constants';
import { resolveDisplayedSuggestionKey } from '../utils/suggestion-selection.utils';
import type { DatasetResult } from '$lib/features/data-pipeline';

type SuggestionTestDataset = Parameters<
  typeof isVisualizationMatchingSuggestion
>[1];

type SuggestionScenario = {
  suggestionId: string;
  dataset: SuggestionTestDataset;
  geometry: 'point' | 'polygon' | 'line';
};

const ALL_SUGGESTION_IDS = [
  'symbols_uniques',
  'polygons_uniques',
  'lines_uniques',
  'choropleth',
  'choropleth_labeled',
  'symbols_uniques_colorful_QTR',
  'lines_colorful_QTR',
  'symbols_proportional',
  'symbols_proportional_labeled',
  'lines_proportional',
  'polygons_colorful_QL',
  'symbols_differents',
  'symbols_uniques_colorful_QL',
  'lines_colorful_QL',
  'polygons_colorful_QLO',
  'symbols_differents_QLO',
  'symbols_uniques_colorful_QLO',
  'lines_colorful_QLO',
  'symbols_proportional_colorful_QL',
  'symbols_proportional_colorful_QTR',
  'symbols_proportional_double',
  'lines_proportional_colorful_QL',
  'lines_proportional_colorful_QTR',
  'texts_colorful_QL',
  'texts_colorful_QTR',
  'texts_proportional'
];

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

function createLineDatasetWithHiddenTechnicalId(): SuggestionTestDataset {
  return {
    id: 'dataset-4',
    name: 'Line dataset with hidden id',
    sourceFileId: 'source-4',
    tableName: 'line_dataset_hidden_id',
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
      { name: '__id', type: 'number', stats: {}, values: [] },
      { name: 'id', type: 'number', stats: {}, values: [] },
      { name: 'li_type', type: 'string', stats: {}, values: [] }
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
    mocks.computeClassificationBreaksMock.mockResolvedValue({
      normalizedMethod: ClassificationMethod.QUANTILES,
      requestedClassCount: 5,
      actualClassCount: 5,
      result: {
        breaks: [10, 20, 30, 40, 50],
        counts: [2, 2, 2, 2, 2]
      },
      colors: ['#e4e6e7', '#b1c4d9', '#7fa3ca', '#4f81bb', '#1b5eaa']
    });
    visualizationStore.clear();

    const dataset = createPointDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;
  });

  it('keeps example choropleth presets selected after declared overrides', async () => {
    const dataset = {
      ...createPolygonDataset(),
      columns: [
        { name: 'geometry', type: 'geometry', stats: {}, values: [] },
        { name: 'name', type: 'string', stats: {}, values: [] },
        { name: 'population_2023', type: 'number', stats: {}, values: [] }
      ]
    } as unknown as DatasetResult;
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    await applyExampleVisualizationPresets(
      {
        id: 'world-population',
        title: 'Population Europe 2023',
        subtitle: '',
        description: '',
        category: ExampleCategory.POLYGONS,
        visualizations: [
          {
            type: 'choropleth',
            variable: 'Population 2023',
            classification: 'quantile',
            classes: 5,
            palette: 'Blues'
          }
        ]
      },
      dataset
    );

    const [visualization] = visualizationStore.visualizations;
    expect(visualization).toBeDefined();
    expect(visualization.origin?.mode).toBe('manual-suggestion');
    expect(visualization.origin?.suggestionKey).toBe(
      'choropleth::1::population_2023::polygon::QTR'
    );
    expect(visualization.origin?.restoreState?.origin.mode).toBe(
      'manual-blank'
    );
    expect(visualization.origin?.appliedSuggestionState?.suggestionKey).toBe(
      visualization.origin?.suggestionKey
    );
    expect(visualization.polygon?.classification?.breaks).toEqual([
      10, 20, 30, 40, 50
    ]);
    expect(visualization.polygon?.classification?.colors).toEqual([
      '#e4e6e7',
      '#b1c4d9',
      '#7fa3ca',
      '#4f81bb',
      '#1b5eaa'
    ]);
    expect(
      resolveDisplayedSuggestionKey({
        persistedSuggestionKey: visualization.origin?.suggestionKey,
        matchedSuggestionKey: undefined,
        originMode: visualization.origin?.mode
      })
    ).toBe(visualization.origin?.suggestionKey);
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

    mocks.notifyChangeMock.mockClear();
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
    expect(mocks.notifyChangeMock).toHaveBeenCalledWith(
      'visualization',
      'immediate'
    );
  });

  it('gives an ordered qualitative suggestion an ordered palette, unlike its nominal twin', () => {
    const dataset = createPointDataset();

    const applied = (id: string) => {
      const visualization = visualizationStore.createVisualization(
        VisualizationType.PROPORTIONAL,
        dataset.id
      );
      applySuggestionToVisualization(visualization.id, {
        id,
        label: id,
        nbColumns: 1,
        semioTypes: [id.endsWith('QLO') ? 'QLO' : 'QL'],
        geometries: ['point'],
        columns: ['category'],
        score: 46
      });
      return visualizationStore.visualizations.find(
        (item) => item.id === visualization.id
      );
    };

    const nominal = applied('symbols_uniques_colorful_QL');
    const ordered = applied('symbols_uniques_colorful_QLO');

    expect(ordered?.symbol?.fillClassification?.paletteId).toBe(
      ORDERED_CATEGORY_PALETTE_ID
    );
    expect(nominal?.symbol?.fillClassification?.paletteId).not.toBe(
      ORDERED_CATEGORY_PALETTE_ID
    );
  });

  it('reactivates an inactive visualization when applying a suggestion', () => {
    const dataset = createPointDataset();
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      dataset.id
    );
    const suggestion = createSuggestionById('symbols_proportional', 'point');

    visualizationStore.toggleVisualization(visualization.id);
    expect(
      visualizationStore.activeVisualizations.some(
        (item) => item.id === visualization.id
      )
    ).toBe(false);

    mocks.notifyChangeMock.mockClear();
    applySuggestionToVisualization(visualization.id, suggestion);

    expect(
      visualizationStore.activeVisualizations.some(
        (item) => item.id === visualization.id
      )
    ).toBe(true);
    expect(mocks.notifyChangeMock).toHaveBeenCalledWith(
      'visualization',
      'immediate'
    );
  });

  it('overwrites stale symbol fill state when applying a qualitative point suggestion', () => {
    const dataset = {
      ...createPointDataset(),
      columns: [
        { name: 'geometry', type: 'geometry', stats: {}, values: [] },
        { name: 'place_name', type: 'text', stats: {}, values: [] },
        { name: 'category', type: 'text', stats: {}, values: [] },
        { name: 'population_total', type: 'number', stats: {}, values: [] }
      ]
    } as unknown as SuggestionTestDataset;
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.BIVARIATE,
      dataset.id
    );

    visualizationStore.updateVisualization(visualization.id, {
      symbol: {
        ...visualization.symbol!,
        fillMode: FillMode.CATEGORIES,
        fillCategoryColumn: 'place_name',
        fillClassification: {
          method: ClassificationMethod.MANUAL,
          classes: 2,
          colors: ['#111111', '#222222'],
          labels: ['Paris', 'Lyon']
        }
      }
    });

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

    expect(updatedVisualization?.symbol?.categoryColumn).toBe('category');
    expect(updatedVisualization?.symbol?.fillCategoryColumn).toBe('category');
    expect(updatedVisualization?.symbol?.fillClassification?.labels).toBe(
      undefined
    );
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
    expect(updatedVisualization?.style.strokeColor).toBe(
      DEFAULT_COLORS.neutralStroke
    );
    expect(updatedVisualization?.style.lineColor).toBe(
      DEFAULT_COLORS.neutralStroke
    );
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
    expect(updatedVisualization?.style.symbolFillColor).toBe(
      DEFAULT_COLORS.gray
    );
    expect(updatedVisualization?.style.strokeColor).toBe(
      DEFAULT_COLORS.neutralStroke
    );
    expect(updatedVisualization?.style.lineColor).toBe(
      DEFAULT_COLORS.neutralStroke
    );
    expect(updatedVisualization?.missingData?.show).toBe(false);
    expect(isVisualizationBlank(updatedVisualization!, dataset)).toBe(true);
  });

  it('keeps polygon text suggestions text-only with neutral gray polygon support', () => {
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
    expect(updatedVisualization?.mapping.valueColumn).toBe('population_total');
    expect(updatedVisualization?.mapping.sizeColumn).toBeUndefined();
    expect(updatedVisualization?.modes?.size).toBeDefined();
    expect(updatedVisualization?.modes?.symbol).toBe(SymbolMode.UNIQUE);
    expect(updatedVisualization?.primitiveFilters).toEqual([
      PrimitiveFilterType.POLYGON
    ]);
    expect(updatedVisualization?.style.textOpacity).toBe(1);
    expect(updatedVisualization?.text?.enabled).toBe(true);
    expect(updatedVisualization?.text?.opacity).toBe(1);
    expect(updatedVisualization?.text?.secondaryLabels.enabled).toBe(false);
    expect(updatedVisualization?.text?.secondaryLabels.labelColumn).toBe(
      'population_total'
    );
    expect(updatedVisualization?.polygon?.enabled).toBe(true);
    expect(updatedVisualization?.polygon?.fillMode).toBe(FillMode.UNIQUE);
    expect(updatedVisualization?.polygon?.fillColor).toBe(DEFAULT_COLORS.gray);
    expect(
      isVisualizationMatchingSuggestion(
        updatedVisualization!,
        dataset,
        suggestion
      )
    ).toBe(true);
  });

  it('keeps polygon symbol suggestions symbol-only', () => {
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
      PrimitiveFilterType.POINT
    ]);
    expect(updatedVisualization?.modes?.symbol).toBe(SymbolMode.PROPORTIONAL);
    expect(updatedVisualization?.polygon?.enabled).toBe(false);
    expect(updatedVisualization?.symbol?.enabled).toBe(true);
    expect(updatedVisualization?.symbols?.opacity).toBe(1);
    expect(
      isVisualizationMatchingSuggestion(
        updatedVisualization!,
        dataset,
        suggestion
      )
    ).toBe(true);
  });

  it('should initialize symbolFillColor when applying a symbol suggestion so mutations to polygon fillColor do not leak into symbols', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      dataset.id
    );
    const suggestion = createSuggestionById(
      'symbols_proportional_double',
      'polygon'
    );

    applySuggestionToVisualization(visualization.id, suggestion);

    const afterSuggestion = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );
    expect(afterSuggestion?.style.symbolFillColor).toBe(DEFAULT_COLORS.fill);

    visualizationStore.updateVisualization(visualization.id, {
      style: {
        ...afterSuggestion!.style,
        fillColor: '#f287ac'
      }
    });

    const afterPolygonFillChange = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );
    expect(afterPolygonFillChange?.style.fillColor).toBe('#f287ac');
    expect(afterPolygonFillChange?.style.symbolFillColor).toBe(
      DEFAULT_COLORS.fill
    );
  });

  it('defaults double proportional symbol suggestions to overlay position mode', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      dataset.id
    );
    const suggestion = createSuggestionById(
      'symbols_proportional_double',
      'polygon'
    );

    applySuggestionToVisualization(visualization.id, suggestion);

    const updatedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(updatedVisualization?.symbol?.positionMode).toBe(
      SymbolDoublePosition.OVERLAY
    );
  });

  it('keeps matching a proportional symbol suggestion after style tuning drift', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      dataset.id
    );
    const suggestion = createSuggestionById('symbols_proportional', 'polygon');

    applySuggestionToVisualization(visualization.id, suggestion);
    visualizationStore.updateVisualization(visualization.id, {
      origin: { mode: 'custom' },
      symbols: {
        ...visualizationStore.visualizations.find(
          (item) => item.id === visualization.id
        )!.symbols!,
        maxSize: 8,
        opacity: 1
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
    expect(updatedVisualization?.modes?.stroke).toBe(StrokeMode.NONE);
    expect(updatedVisualization?.polygon?.strokeMode).toBe(StrokeMode.NONE);
    expect(updatedVisualization?.style.textOpacity).toBe(0);
    expect(updatedVisualization?.style.labelOpacity).toBe(0);
  });

  it('does not leak hidden technical ids into line suggestions or proportional defaults', () => {
    const dataset = createLineDatasetWithHiddenTechnicalId();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      dataset.id
    );

    applySuggestionToVisualization(visualization.id, {
      id: 'lines_colorful_QL',
      label: 'Lignes colorées',
      nbColumns: 1,
      semioTypes: ['QL'],
      geometries: ['line'],
      columns: ['li_type'],
      score: 50
    });

    visualizationStore.updateVisualization(visualization.id, {
      line: {
        ...visualizationStore.visualizations.find(
          (item) => item.id === visualization.id
        )!.line!,
        thicknessMode: ThicknessMode.PROPORTIONAL
      }
    });

    const updatedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(updatedVisualization?.mapping.categoryColumn).toBe('li_type');
    expect(updatedVisualization?.mapping.valueColumn).toBeUndefined();
    expect(updatedVisualization?.mapping.sizeColumn).not.toBe('__id');
    expect(updatedVisualization?.line?.categoryColumn).toBe('li_type');
    expect(updatedVisualization?.line?.valueColumn).toBeUndefined();
    expect(updatedVisualization?.line?.sizeColumn).not.toBe('__id');
  });

  it('restores the previous manual visualization when a suggestion is deselected', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      dataset.id
    );

    visualizationStore.updateVisualization(visualization.id, {
      origin: { mode: 'custom' },
      primitiveFilters: [PrimitiveFilterType.POLYGON],
      modes: {
        ...visualization.modes,
        fill: FillMode.UNIQUE
      },
      style: {
        ...visualization.style,
        fillColor: '#ff5500',
        fillOpacity: 0.42,
        strokeWidth: 2
      },
      mapping: {
        ...visualization.mapping,
        valueColumn: undefined
      },
      classification: undefined
    });

    const manualVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    )!;

    const suggestion = createSuggestionById('symbols_proportional', 'polygon');

    applySuggestionToVisualization(visualization.id, suggestion, {
      origin: buildSuggestionOrigin(manualVisualization, {
        mode: 'manual-suggestion',
        suggestionKey: 'symbols_proportional::1::population_total::polygon::QTA'
      })
    });

    expect(restoreVisualizationFromSuggestion(visualization.id)).toBe(true);

    const restoredVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(restoredVisualization?.origin).toEqual({ mode: 'custom' });
    expect(restoredVisualization?.primitiveFilters).toEqual([
      PrimitiveFilterType.POLYGON
    ]);
    expect(restoredVisualization?.modes?.fill).toBe(FillMode.UNIQUE);
    expect(restoredVisualization?.mapping.valueColumn).toBeUndefined();
    expect(restoredVisualization?.style.fillColor).toBe('#ff5500');
    expect(restoredVisualization?.style.fillOpacity).toBe(0.42);
    expect(restoredVisualization?.style.strokeWidth).toBe(2);
    expect(restoredVisualization?.classification).toBeUndefined();
  });

  it('re-applies remembered example overrides after suggestion deselection', () => {
    const dataset = createPointDataset();
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      dataset.id
    );
    const suggestion = createSuggestionById('symbols_proportional', 'point');
    const suggestionKey =
      'symbols_proportional::1::population_total::point::QTA';

    applySuggestionToVisualization(visualization.id, suggestion, {
      origin: buildSuggestionOrigin(visualization, {
        mode: 'custom',
        suggestionKey
      })
    });

    const suggestedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    )!;
    visualizationStore.updateVisualization(visualization.id, {
      origin: suggestedVisualization.origin,
      style: {
        ...suggestedVisualization.style,
        symbolFillColor: '#E6142D'
      },
      symbol: suggestedVisualization.symbol
        ? {
            ...suggestedVisualization.symbol,
            fillColor: '#E6142D',
            minSize: 5,
            maxSize: 50
          }
        : undefined
    });
    rememberAppliedSuggestionState(visualization.id, suggestionKey);

    expect(restoreVisualizationFromSuggestion(visualization.id)).toBe(true);

    const restoredVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    )!;
    expect(restoredVisualization.origin?.suggestionKey).toBe(suggestionKey);
    expect(restoredVisualization.origin?.appliedSuggestionState).toBeDefined();

    applySuggestionToVisualization(visualization.id, suggestion, {
      origin: buildSuggestionOrigin(restoredVisualization, {
        mode: 'manual-suggestion',
        suggestionKey
      })
    });

    const reappliedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(reappliedVisualization?.style.symbolFillColor).toBe('#E6142D');
    expect(reappliedVisualization?.symbol?.fillColor).toBe('#E6142D');
    expect(reappliedVisualization?.symbol?.minSize).toBe(5);
    expect(reappliedVisualization?.symbol?.maxSize).toBe(50);
  });

  it('restores the manual visualization even after the suggestion has drifted to custom', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      dataset.id
    );

    visualizationStore.updateVisualization(visualization.id, {
      origin: { mode: 'manual-blank' },
      style: {
        ...visualization.style,
        textOpacity: 1
      }
    });

    const manualVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    )!;

    const suggestion = createSuggestionById('symbols_proportional', 'polygon');

    applySuggestionToVisualization(visualization.id, suggestion, {
      origin: buildSuggestionOrigin(manualVisualization, {
        mode: 'manual-suggestion',
        suggestionKey: 'symbols_proportional::1::population_total::polygon::QTA'
      })
    });

    visualizationStore.updateVisualization(visualization.id, {
      style: {
        ...visualizationStore.visualizations.find(
          (item) => item.id === visualization.id
        )!.style,
        strokeWidth: 3
      }
    });

    const driftedVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(driftedVisualization?.origin?.mode).toBe('custom');
    expect(driftedVisualization?.origin?.restoreState).toBeDefined();
    expect(restoreVisualizationFromSuggestion(visualization.id)).toBe(true);

    const restoredVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(restoredVisualization?.origin).toEqual({ mode: 'manual-blank' });
    expect(restoredVisualization?.style.textOpacity).toBe(1);
    expect(restoredVisualization?.style.strokeWidth).toBe(
      manualVisualization.style.strokeWidth
    );
  });

  it('restores the blank state when a suggestion is deselected from an empty visualization', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      dataset.id
    );

    applyBlankVisualizationPreset(visualization.id, dataset, {
      mode: 'manual-blank'
    });

    const blankVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    )!;

    const suggestion = createSuggestionById('symbols_proportional', 'polygon');

    applySuggestionToVisualization(visualization.id, suggestion, {
      origin: buildSuggestionOrigin(blankVisualization, {
        mode: 'manual-suggestion',
        suggestionKey: 'symbols_proportional::1::population_total::polygon::QTA'
      })
    });

    expect(restoreVisualizationFromSuggestion(visualization.id)).toBe(true);

    const restoredVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(restoredVisualization).toBeDefined();
    expect(isVisualizationBlank(restoredVisualization!, dataset)).toBe(true);
    expect(restoredVisualization?.origin).toEqual({ mode: 'manual-blank' });
  });

  it('restores manual text visibility after deselecting a suggestion', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      dataset.id
    );

    applyBlankVisualizationPreset(visualization.id, dataset, {
      mode: 'manual-blank'
    });

    visualizationStore.updateVisualization(visualization.id, {
      style: {
        ...visualizationStore.visualizations.find(
          (item) => item.id === visualization.id
        )!.style,
        textOpacity: 1
      }
    });

    const manualVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    )!;

    const suggestion = createSuggestionById('symbols_proportional', 'polygon');

    applySuggestionToVisualization(visualization.id, suggestion, {
      origin: buildSuggestionOrigin(manualVisualization, {
        mode: 'manual-suggestion',
        suggestionKey: 'symbols_proportional::1::population_total::polygon::QTA'
      })
    });

    expect(restoreVisualizationFromSuggestion(visualization.id)).toBe(true);

    const restoredVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(restoredVisualization?.origin).toEqual({ mode: 'manual-blank' });
    expect(restoredVisualization?.style.textOpacity).toBe(1);
  });

  it('restores the latest manual polygon fill after clearing an auto-applied suggestion', () => {
    const dataset = createPolygonDataset();
    mocks.datasets = [dataset];
    mocks.selectedDatasetId = dataset.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      dataset.id
    );
    const suggestion = createSuggestionById('symbols_proportional', 'polygon');

    applyBlankVisualizationPreset(visualization.id, dataset, {
      mode: 'auto-suggestion'
    });

    const autoBlankVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    )!;

    applySuggestionToVisualization(visualization.id, suggestion, {
      origin: buildSuggestionOrigin(autoBlankVisualization, {
        mode: 'auto-suggestion',
        suggestionKey: 'symbols_proportional::1::population_total::polygon::QTA'
      })
    });

    expect(restoreVisualizationFromSuggestion(visualization.id)).toBe(true);

    const blankVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    )!;

    expect(blankVisualization.origin).toEqual({ mode: 'manual-blank' });
    expect(isVisualizationBlank(blankVisualization, dataset)).toBe(true);

    visualizationStore.updateVisualization(visualization.id, {
      modes: {
        ...blankVisualization.modes,
        fill: FillMode.UNIQUE
      },
      style: {
        ...blankVisualization.style,
        fillColor: '#ff5500',
        fillOpacity: 0.42
      }
    });

    const manualVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    )!;

    applySuggestionToVisualization(visualization.id, suggestion, {
      origin: buildSuggestionOrigin(manualVisualization, {
        mode: 'manual-suggestion',
        suggestionKey: 'symbols_proportional::1::population_total::polygon::QTA'
      })
    });

    expect(restoreVisualizationFromSuggestion(visualization.id)).toBe(true);

    const restoredVisualization = visualizationStore.visualizations.find(
      (item) => item.id === visualization.id
    );

    expect(restoredVisualization?.origin).toEqual({ mode: 'manual-blank' });
    expect(restoredVisualization?.modes?.fill).toBe(FillMode.UNIQUE);
    expect(restoredVisualization?.style.fillColor).toBe('#ff5500');
    expect(restoredVisualization?.style.fillOpacity).toBe(0.42);
  });

  it('matches every registered suggestion immediately after application', () => {
    const pointDataset = createPointDataset();
    const polygonDataset = createPolygonDataset();
    const lineDataset = createLineDataset();

    const scenarios: SuggestionScenario[] = ALL_SUGGESTION_IDS.flatMap(
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
          suggestionId === 'choropleth_labeled' ||
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

describe('resolveDatasetGeometryType / MultiPoint + centroid routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    visualizationStore.clear();
    mocks.datasets = [];
    mocks.selectedDatasetId = undefined;
  });

  function buildDataset(type: string): SuggestionTestDataset {
    return {
      id: `dataset-${type}`,
      name: `${type} dataset`,
      sourceFileId: `source-${type}`,
      tableName: `${type.toLowerCase()}_dataset`,
      rowCount: 4,
      geometry: { type },
      metadata: {
        processedAt: new Date(),
        fileType: 'geojson',
        parserUsed: 'test'
      },
      columns: [
        { name: 'geometry', type: 'geometry', stats: {}, values: [] },
        { name: 'category', type: 'string', stats: {}, values: [] },
        { name: 'population_total', type: 'number', stats: {}, values: [] }
      ]
    } as unknown as SuggestionTestDataset;
  }

  it('returns MultiPoint geometry type for MultiPoint datasets (not downgraded)', () => {
    const ds = buildDataset('MultiPoint');
    const type = resolveDatasetGeometryType(ds);
    expect(type).toBe('MultiPoint');
  });

  it('returns MultiPolygon geometry type for MultiPolygon datasets', () => {
    const ds = buildDataset('MultiPolygon');
    const type = resolveDatasetGeometryType(ds);
    expect(type).toBe('MultiPolygon');
  });

  it('returns MultiLineString geometry type for MultiLineString datasets', () => {
    const ds = buildDataset('MultiLineString');
    const type = resolveDatasetGeometryType(ds);
    expect(type).toBe('MultiLineString');
  });

  it('treats a MultiPoint dataset as a point-compatible suggestion target', () => {
    const ds = buildDataset('MultiPoint');
    mocks.datasets = [ds];
    mocks.selectedDatasetId = ds.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      ds.id
    );
    const suggestion: Parameters<typeof applySuggestionToVisualization>[1] = {
      id: 'symbols_proportional',
      label: 'Symboles proportionnels',
      nbColumns: 1,
      semioTypes: ['QTA'],
      geometries: ['point'],
      columns: ['population_total'],
      score: 60
    };

    applySuggestionToVisualization(visualization.id, suggestion);

    const updated = visualizationStore.visualizations.find(
      (v) => v.id === visualization.id
    );
    expect(updated).toBeDefined();
    expect(updated?.modes?.symbol).toBe(SymbolMode.PROPORTIONAL);
    expect(updated?.mapping.sizeColumn).toBe('population_total');
  });

  it('treats a MultiPolygon dataset as a polygon-compatible target for centroid-based symbols', () => {
    const ds = buildDataset('MultiPolygon');
    mocks.datasets = [ds];
    mocks.selectedDatasetId = ds.id;

    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      ds.id
    );
    const suggestion: Parameters<typeof applySuggestionToVisualization>[1] = {
      id: 'symbols_proportional',
      label: 'Symboles proportionnels',
      nbColumns: 1,
      semioTypes: ['QTA'],
      geometries: ['polygon'],
      columns: ['population_total'],
      score: 58
    };

    applySuggestionToVisualization(visualization.id, suggestion);

    const updated = visualizationStore.visualizations.find(
      (v) => v.id === visualization.id
    );
    expect(updated?.modes?.symbol).toBe(SymbolMode.PROPORTIONAL);
    expect(updated?.primitiveFilters).toContain(PrimitiveFilterType.POINT);
  });

  it('returns null when geometry type is absent and no GPS fallback is available', () => {
    const ds = {
      id: 'dataset-bare',
      name: 'bare',
      sourceFileId: undefined,
      tableName: 'bare',
      rowCount: 0,
      metadata: {
        processedAt: new Date(),
        fileType: 'csv',
        parserUsed: 'test'
      },
      columns: []
    } as unknown as SuggestionTestDataset;
    expect(resolveDatasetGeometryType(ds)).toBeNull();
  });

  it('prioritizes GPS coordinates over an assisted joined basemap', () => {
    const ds = {
      id: 'dataset-gps-joined',
      name: 'GPS CSV with assisted basemap',
      sourceFileId: 'source-gps-joined',
      tableName: 'gps_joined_dataset',
      rowCount: 96,
      joinedBasemap: 'france-region-2025-medium',
      metadata: {
        processedAt: new Date(),
        fileType: 'csv',
        parserUsed: 'test'
      },
      geoDetection: {
        geoColumns: [
          { type: 'latitude', columnName: 'lat' },
          { type: 'longitude', columnName: 'long' },
          { type: 'city', columnName: 'commune' }
        ]
      },
      columns: [
        { name: 'lat', type: 'number', stats: {}, values: [] },
        { name: 'long', type: 'number', stats: {}, values: [] },
        { name: 'directive_ippc', type: 'text', stats: {}, values: [] }
      ]
    } as unknown as SuggestionTestDataset;

    expect(resolveDatasetGeometryType(ds)).toBe('Point');
    expect(resolveBlankVisualizationType(ds)).toBe(
      VisualizationType.PROPORTIONAL
    );
  });
});
