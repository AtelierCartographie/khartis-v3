import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatasetResult } from '$lib/features/data-pipeline/types';

const mockedDatasetsState: { datasets: DatasetResult[] } = {
  datasets: []
};

vi.mock('./datasets.store.svelte', () => ({
  datasetsStore: {
    get datasets() {
      return mockedDatasetsState.datasets;
    },
    addProcessedDataset(dataset: DatasetResult) {
      mockedDatasetsState.datasets.push(dataset);
    },
    clear() {
      mockedDatasetsState.datasets = [];
    }
  }
}));

import {
  ClassificationMethod,
  PrimitiveFilterType,
  VisualizationType,
  getEnabledPrimitiveFilters,
  getSymbolPrimitive,
  getTextPrimitive,
  visualizationStore,
  type VisualizationConfig
} from './visualization.store.svelte';
import {
  CategoryShapeMode,
  FillMode,
  ProportionalType,
  ShapeType,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode
} from '$lib/features/main-toolbar/constants';
import { ScaleType } from './visualization.store.svelte';
import { datasetsStore } from './datasets.store.svelte';
import {
  ColumnType,
  FileFormatEnum,
  type EnrichedColumn
} from '$lib/features/data-pipeline/types';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';

function buildColumn(name: string, type: ColumnType): EnrichedColumn {
  return {
    name,
    type,
    values: [],
    stats: {
      name,
      type,
      count: 0,
      nulls: 0,
      uniques: 0
    }
  };
}

function buildDataset(): DatasetResult {
  return {
    id: 'dataset-1',
    name: 'Legacy text dataset',
    sourceFileId: 'source-1',
    tableName: 'legacy_text_dataset',
    columns: [
      buildColumn('name', ColumnType.TEXT),
      buildColumn('geom', ColumnType.GEOMETRY)
    ],
    rowCount: 1,
    geometry: {
      type: 'LineString',
      columnName: 'geom',
      bounds: [0, 0, 1, 1],
      centroid: [0.5, 0.5],
      featureCount: 1
    },
    metadata: {
      processedAt: new Date('2026-04-16T00:00:00.000Z'),
      fileType: 'geojson',
      parserUsed: 'test'
    },
    format: FileFormatEnum.GEOJSON
  };
}

function buildLegacyLabelVisualization(
  styleOverrides: Partial<VisualizationConfig['style']> = {}
): VisualizationConfig {
  return {
    id: 'viz-1',
    name: 'Legacy labels',
    datasetId: 'dataset-1',
    enabled: true,
    type: VisualizationType.CATEGORICAL,
    primitiveFilters: [PrimitiveFilterType.LINE],
    primitiveOrder: [PrimitiveFilterType.LINE, PrimitiveFilterType.TEXT],
    modes: {},
    style: {
      labelOpacity: 0.72,
      labelColor: '#1357aa',
      labelSize: 14,
      labelAlign: 'left',
      labelHalo: true,
      labelHaloColor: '#ffffff',
      labelHaloWidth: 3,
      labelCollisionDetection: false,
      labelDxpMasking: true,
      textOpacity: 0,
      ...styleOverrides
    },
    mapping: {
      geometryColumn: 'geom',
      labelColumn: 'name'
    }
  };
}

describe('visualizationStore legacy label normalization', () => {
  afterEach(() => {
    visualizationStore.clear();
    datasetsStore.clear();
    persistenceRegistry.markClean();
  });

  it('migrates legacy label styling into texts and hides the legacy label layer', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    visualizationStore.restoreFromSerialized({
      visualizations: [buildLegacyLabelVisualization()],
      selectedVisualizationId: 'viz-1',
      activeVisualizationIds: ['viz-1']
    });

    const visualization = visualizationStore.selectedVisualization;
    expect(visualization).toBeDefined();
    expect(visualization?.style.textOpacity).toBe(0.72);
    expect(visualization?.style.textColor).toBe('#1357aa');
    expect(visualization?.style.textSize).toBe(14);
    expect(visualization?.style.textAlign).toBe('left');
    expect(visualization?.style.textHalo).toBe(true);
    expect(visualization?.style.textHaloColor).toBe('#ffffff');
    expect(visualization?.style.textHaloWidth).toBe(3);
    expect(visualization?.style.textCollisionDetection).toBe(false);
    expect(visualization?.style.textDxpMasking).toBe(true);
    expect(visualization?.style.labelOpacity).toBe(0);
  });

  it('does not override an existing text configuration when hiding legacy labels', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    visualizationStore.restoreFromSerialized({
      visualizations: [
        buildLegacyLabelVisualization({
          textOpacity: 0.41,
          textColor: '#ff5500',
          textSize: 9
        })
      ],
      selectedVisualizationId: 'viz-1',
      activeVisualizationIds: ['viz-1']
    });

    const visualization = visualizationStore.selectedVisualization;
    expect(visualization).toBeDefined();
    expect(visualization?.style.textOpacity).toBe(0.41);
    expect(visualization?.style.textColor).toBe('#ff5500');
    expect(visualization?.style.textSize).toBe(9);
    expect(visualization?.style.labelOpacity).toBe(0);
  });
});

describe('visualizationStore suggestion origin tracking', () => {
  afterEach(() => {
    visualizationStore.clear();
    datasetsStore.clear();
    persistenceRegistry.markClean();
  });

  it('keeps suggestion origin for derived classification updates', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1'
    );

    visualizationStore.updateVisualization(visualization.id, {
      origin: {
        mode: 'auto-suggestion',
        suggestionKey: 'symbols_proportional::1::population::polygon::QTA'
      }
    });

    visualizationStore.updateClassification(visualization.id, {
      breaks: [10, 20, 30],
      counts: [4, 5, 6],
      colors: ['#1192e8', '#78a9cf', '#c8ddf0'],
      labels: ['A', 'B', 'C']
    });

    const updatedVisualization = visualizationStore.selectedVisualization;

    expect(updatedVisualization?.origin).toEqual({
      mode: 'auto-suggestion',
      suggestionKey: 'symbols_proportional::1::population::polygon::QTA'
    });
  });

  it('keeps suggestion origin for preserved primitive classification updates', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1'
    );

    visualizationStore.updateVisualization(visualization.id, {
      origin: {
        mode: 'manual-suggestion',
        suggestionKey: 'lines_colorful_QL::1::segment::line::QL'
      }
    });

    visualizationStore.updatePrimitiveClassification(
      visualization.id,
      PrimitiveFilterType.LINE,
      {
        colors: ['#1192e8', '#78a9cf', '#c8ddf0'],
        labels: ['A', 'B', 'C']
      },
      { preserveOrigin: true }
    );

    const updatedVisualization = visualizationStore.selectedVisualization;

    expect(updatedVisualization?.origin).toEqual({
      mode: 'manual-suggestion',
      suggestionKey: 'lines_colorful_QL::1::segment::line::QL'
    });
    expect(updatedVisualization?.line?.classification?.labels).toEqual([
      'A',
      'B',
      'C'
    ]);
  });

  it('keeps suggestion origin for preserved polygon classification sync updates', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1'
    );

    visualizationStore.updateVisualization(visualization.id, {
      origin: {
        mode: 'manual-suggestion',
        suggestionKey: 'lines_colorful_QL::1::li_type::line::QL'
      },
      modes: {
        ...visualization.modes,
        fill: FillMode.NONE,
        stroke: StrokeMode.NONE
      },
      primitiveFilters: [PrimitiveFilterType.LINE],
      polygon: {
        ...visualization.polygon!,
        enabled: false,
        fillMode: FillMode.CATEGORIES,
        strokeMode: StrokeMode.NONE
      }
    });

    visualizationStore.updateClassification(
      visualization.id,
      {
        method: ClassificationMethod.MANUAL,
        classes: 0,
        colors: ['#1192e8', '#78a9cf', '#c8ddf0'],
        inverted: false,
        labels: ['A', 'B', 'C']
      },
      { preserveOrigin: true }
    );

    const updatedVisualization = visualizationStore.selectedVisualization;

    expect(updatedVisualization?.origin).toEqual({
      mode: 'manual-suggestion',
      suggestionKey: 'lines_colorful_QL::1::li_type::line::QL'
    });
    expect(updatedVisualization?.polygon?.classification?.labels).toEqual([
      'A',
      'B',
      'C'
    ]);
  });

  it('switches to custom for semantic classification changes', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1'
    );

    visualizationStore.updateVisualization(visualization.id, {
      origin: {
        mode: 'manual-suggestion',
        suggestionKey: 'choropleth::1::population::polygon::QTR',
        restoreState: {
          origin: { mode: 'manual-blank' },
          visualization: {
            type: visualization.type,
            modes: visualization.modes,
            primitiveFilters: visualization.primitiveFilters,
            primitiveOrder: visualization.primitiveOrder,
            style: visualization.style,
            mapping: visualization.mapping,
            classification: visualization.classification,
            symbols: visualization.symbols,
            missingData: visualization.missingData,
            density: visualization.density,
            yearFilter: visualization.yearFilter,
            dataFilters: visualization.dataFilters
          }
        }
      }
    });

    visualizationStore.updateClassification(visualization.id, {
      method: ClassificationMethod.MANUAL
    });

    const updatedVisualization = visualizationStore.selectedVisualization;

    expect(updatedVisualization?.origin).toEqual({
      mode: 'custom',
      restoreState: {
        origin: { mode: 'manual-blank' },
        visualization: {
          type: visualization.type,
          modes: visualization.modes,
          primitiveFilters: visualization.primitiveFilters,
          primitiveOrder: visualization.primitiveOrder,
          style: visualization.style,
          mapping: visualization.mapping,
          classification: visualization.classification,
          symbols: visualization.symbols,
          missingData: visualization.missingData,
          density: visualization.density,
          yearFilter: visualization.yearFilter,
          dataFilters: visualization.dataFilters
        }
      }
    });
  });
});

describe('visualizationStore text primitive enablement', () => {
  afterEach(() => {
    visualizationStore.clear();
    datasetsStore.clear();
    persistenceRegistry.markClean();
  });

  it('preserves per-primitive text enablement when legacy text opacity is zero', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1'
    );
    const initialText = getTextPrimitive(visualization);

    expect(initialText).toBeDefined();
    if (!initialText) {
      throw new Error('Expected createVisualization to initialize text config');
    }

    visualizationStore.updateVisualization(visualization.id, {
      style: {
        ...visualization.style,
        textOpacity: 0
      },
      text: {
        ...initialText,
        enabled: true,
        labelColumn: 'name',
        opacity: 1
      }
    });

    const updatedVisualization = visualizationStore.selectedVisualization;

    expect(getTextPrimitive(updatedVisualization)?.enabled).toBe(true);
    expect(getEnabledPrimitiveFilters(updatedVisualization)).toContain(
      PrimitiveFilterType.TEXT
    );
  });

  it('restores text opacity from legacy style when an enabled text primitive was persisted with zero opacity', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1'
    );
    const initialText = getTextPrimitive(visualization);

    expect(initialText).toBeDefined();
    if (!initialText) {
      throw new Error('Expected createVisualization to initialize text config');
    }

    visualizationStore.updateVisualization(visualization.id, {
      style: {
        ...visualization.style,
        textOpacity: 1
      },
      text: {
        ...initialText,
        enabled: true,
        labelColumn: 'name',
        opacity: 0
      }
    });

    const updatedVisualization = visualizationStore.selectedVisualization;

    expect(getTextPrimitive(updatedVisualization)?.enabled).toBe(true);
    expect(getTextPrimitive(updatedVisualization)?.opacity).toBe(1);
  });
});

describe('visualizationStore SymbolPrimitiveConfig round-trip persistence', () => {
  afterEach(() => {
    visualizationStore.clear();
    datasetsStore.clear();
    persistenceRegistry.markClean();
  });

  function buildRichSymbolVisualization(): VisualizationConfig {
    return {
      id: 'viz-symbol-full',
      name: 'Symbols full',
      datasetId: 'dataset-1',
      enabled: true,
      type: VisualizationType.CATEGORICAL,
      primitiveFilters: [PrimitiveFilterType.POINT],
      primitiveOrder: [PrimitiveFilterType.POINT],
      modes: {
        symbol: SymbolMode.CATEGORIES,
        fill: FillMode.CATEGORIES
      },
      style: {
        fillOpacity: 0.7,
        strokeOpacity: 0.9,
        strokeWidth: 2,
        strokeDashed: true
      },
      mapping: {
        geometryColumn: 'geom',
        categoryColumn: 'segment',
        valueColumn: 'capacity',
        sizeColumn: 'population'
      },
      classification: {
        method: ClassificationMethod.MANUAL,
        classes: 4,
        colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3'],
        labels: ['A', 'B', 'C', 'D'],
        categoryShapes: [
          ShapeType.CIRCLE,
          ShapeType.SQUARE,
          ShapeType.TRIANGLE,
          ShapeType.DIAMOND
        ],
        paletteId: 'categorical-set1'
      },
      symbolClassification: {
        method: ClassificationMethod.MANUAL,
        classes: 4,
        colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3'],
        labels: ['A', 'B', 'C', 'D'],
        categoryShapes: [
          ShapeType.CIRCLE,
          ShapeType.SQUARE,
          ShapeType.TRIANGLE,
          ShapeType.DIAMOND
        ],
        paletteId: 'categorical-set1'
      },
      symbol: {
        enabled: true,
        mode: SymbolMode.CATEGORIES,
        shape: ShapeType.CIRCLE,
        size: 18,
        minSize: 4,
        maxSize: 48,
        sizeScale: ScaleType.SQRT,
        opacity: 0.7,
        fillMode: FillMode.CATEGORIES,
        fillColor: '#e41a1c',
        strokeMode: StrokeMode.UNIQUE,
        strokeColor: '#333333',
        strokeWidth: 2,
        strokeOpacity: 0.9,
        strokeDashed: true,
        proportionalType: ProportionalType.SINGLE,
        categoryShape: CategoryShapeMode.DIFFERENT,
        commonScale: true,
        positionMode: SymbolDoublePosition.OVERLAY,
        breakValueA: null,
        breakValueB: null,
        valueColumn: 'capacity',
        categoryColumn: 'segment',
        sizeColumn: 'population',
        classification: {
          method: ClassificationMethod.MANUAL,
          classes: 4,
          colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3'],
          labels: ['A', 'B', 'C', 'D'],
          categoryShapes: [
            ShapeType.CIRCLE,
            ShapeType.SQUARE,
            ShapeType.TRIANGLE,
            ShapeType.DIAMOND
          ],
          paletteId: 'categorical-set1'
        },
        modeStates: {
          [SymbolMode.UNIQUE]: {
            size: 12,
            fillMode: FillMode.UNIQUE,
            strokeMode: StrokeMode.UNIQUE,
            strokeWidth: 3,
            strokeOpacity: 0.6,
            strokeDashed: false
          },
          [SymbolMode.PROPORTIONAL]: {
            minSize: 4,
            maxSize: 40,
            sizeScale: ScaleType.SQRT,
            sizeColumn: 'population',
            proportionalType: ProportionalType.DOUBLE,
            commonScale: false,
            positionMode: SymbolDoublePosition.JUXTAPOSITION,
            breakValueA: 100,
            breakValueB: 1000,
            strokeMode: StrokeMode.NONE,
            strokeWidth: 0,
            strokeOpacity: 1,
            strokeDashed: false
          }
        }
      }
    };
  }

  it('restores the full SymbolPrimitiveConfig from a serialized payload without losing any field', () => {
    datasetsStore.addProcessedDataset(buildDataset());
    const input = buildRichSymbolVisualization();

    visualizationStore.restoreFromSerialized({
      visualizations: [input],
      selectedVisualizationId: input.id,
      activeVisualizationIds: [input.id]
    });

    const viz = visualizationStore.selectedVisualization;
    expect(viz).toBeDefined();
    const symbol = getSymbolPrimitive(viz);
    expect(symbol).toBeDefined();
    if (!symbol || !viz) throw new Error('symbol config missing');

    expect(symbol.mode).toBe(SymbolMode.CATEGORIES);
    expect(symbol.shape).toBe(ShapeType.CIRCLE);
    expect(symbol.size).toBe(18);
    expect(symbol.minSize).toBe(4);
    expect(symbol.maxSize).toBe(48);
    expect(symbol.sizeScale).toBe(ScaleType.SQRT);
    expect(symbol.opacity).toBeCloseTo(0.7);
    expect(symbol.fillMode).toBe(FillMode.CATEGORIES);
    expect(symbol.strokeMode).toBe(StrokeMode.UNIQUE);
    expect(symbol.strokeWidth).toBe(2);
    expect(symbol.strokeOpacity).toBeCloseTo(0.9);
    expect(symbol.strokeDashed).toBe(true);
    expect(symbol.categoryShape).toBe(CategoryShapeMode.DIFFERENT);
    expect(symbol.proportionalType).toBe(ProportionalType.SINGLE);
    expect(symbol.valueColumn).toBe('capacity');
    expect(symbol.categoryColumn).toBe('segment');
    expect(symbol.sizeColumn).toBe('population');

    expect(symbol.classification?.method).toBe(ClassificationMethod.MANUAL);
    expect(symbol.classification?.colors).toEqual([
      '#e41a1c',
      '#377eb8',
      '#4daf4a',
      '#984ea3'
    ]);
    expect(symbol.classification?.labels).toEqual(['A', 'B', 'C', 'D']);
    expect(symbol.classification?.categoryShapes).toEqual([
      ShapeType.CIRCLE,
      ShapeType.SQUARE,
      ShapeType.TRIANGLE,
      ShapeType.DIAMOND
    ]);
    expect(symbol.classification?.paletteId).toBe('categorical-set1');

    expect(symbol.modeStates?.[SymbolMode.UNIQUE]?.size).toBe(12);
    expect(symbol.modeStates?.[SymbolMode.UNIQUE]?.fillMode).toBe(
      FillMode.UNIQUE
    );
    expect(symbol.modeStates?.[SymbolMode.UNIQUE]?.strokeMode).toBe(
      StrokeMode.UNIQUE
    );
    expect(symbol.modeStates?.[SymbolMode.UNIQUE]?.strokeWidth).toBe(3);
    expect(symbol.modeStates?.[SymbolMode.UNIQUE]?.strokeOpacity).toBeCloseTo(
      0.6
    );
    expect(symbol.modeStates?.[SymbolMode.UNIQUE]?.strokeDashed).toBe(false);

    const proportional = symbol.modeStates?.[SymbolMode.PROPORTIONAL];
    expect(proportional?.minSize).toBe(4);
    expect(proportional?.maxSize).toBe(40);
    expect(proportional?.sizeScale).toBe(ScaleType.SQRT);
    expect(proportional?.sizeColumn).toBe('population');
    expect(proportional?.proportionalType).toBe(ProportionalType.DOUBLE);
    expect(proportional?.commonScale).toBe(false);
    expect(proportional?.positionMode).toBe(SymbolDoublePosition.JUXTAPOSITION);
    expect(proportional?.breakValueA).toBe(100);
    expect(proportional?.breakValueB).toBe(1000);
    expect(proportional?.strokeMode).toBe(StrokeMode.NONE);
    expect(proportional?.strokeWidth).toBe(0);
    expect(proportional?.strokeOpacity).toBe(1);
    expect(proportional?.strokeDashed).toBe(false);
  });

  it('keeps mapping.categoryColumn and mapping.sizeColumn in sync with the symbol primitive after restore', () => {
    datasetsStore.addProcessedDataset(buildDataset());
    const input = buildRichSymbolVisualization();

    visualizationStore.restoreFromSerialized({
      visualizations: [input],
      selectedVisualizationId: input.id,
      activeVisualizationIds: [input.id]
    });

    const viz = visualizationStore.selectedVisualization;
    expect(viz?.mapping.categoryColumn).toBe('segment');
    expect(viz?.mapping.sizeColumn).toBe('population');
    expect(viz?.mapping.valueColumn).toBe('capacity');
  });

  it('falls back to the legacy symbolClassification mirror when symbol.classification is missing', () => {
    datasetsStore.addProcessedDataset(buildDataset());
    const input = buildRichSymbolVisualization();
    const legacyOnly: VisualizationConfig = {
      ...input,
      symbol: input.symbol
        ? { ...input.symbol, classification: undefined }
        : undefined
    };

    visualizationStore.restoreFromSerialized({
      visualizations: [legacyOnly],
      selectedVisualizationId: legacyOnly.id,
      activeVisualizationIds: [legacyOnly.id]
    });

    const viz = visualizationStore.selectedVisualization;
    const symbol = getSymbolPrimitive(viz);
    expect(symbol?.classification?.labels).toEqual(['A', 'B', 'C', 'D']);
  });

  it('keeps symbol stroke discretization fields through the persistence registry round-trip used by project saves', () => {
    datasetsStore.addProcessedDataset(buildDataset());
    const input = buildRichSymbolVisualization();
    const strokeAwareInput: VisualizationConfig = {
      ...input,
      symbol: input.symbol
        ? {
            ...input.symbol,
            strokeMode: StrokeMode.CATEGORIES,
            strokeColor: undefined,
            strokeCategoryColumn: 'outline_group',
            strokeClassification: {
              method: ClassificationMethod.MANUAL,
              classes: 4,
              colors: ['#111111', '#333333', '#555555', '#777777'],
              labels: ['North', 'South', 'East', 'West'],
              disabledLabels: ['West'],
              paletteId: 'categorical-dark2'
            },
            modeStates: {
              ...input.symbol.modeStates,
              [SymbolMode.CATEGORIES]: {
                size: 18,
                categoryColumn: 'segment',
                categoryShape: CategoryShapeMode.DIFFERENT,
                fillMode: FillMode.CATEGORIES,
                strokeMode: StrokeMode.CATEGORIES,
                strokeWidth: 2,
                strokeOpacity: 0.9,
                strokeDashed: true,
                strokeCategoryColumn: 'outline_group',
                strokeClassification: {
                  method: ClassificationMethod.MANUAL,
                  classes: 4,
                  colors: ['#111111', '#333333', '#555555', '#777777'],
                  labels: ['North', 'South', 'East', 'West'],
                  disabledLabels: ['West'],
                  paletteId: 'categorical-dark2'
                }
              }
            }
          }
        : undefined
    };

    visualizationStore.restoreFromSerialized({
      visualizations: [strokeAwareInput],
      selectedVisualizationId: strokeAwareInput.id,
      activeVisualizationIds: [strokeAwareInput.id]
    });

    const serializedStores = persistenceRegistry.serializeAll();

    visualizationStore.clear();

    persistenceRegistry.deserializeAll({
      visualization: serializedStores.visualization
    });

    const restoredVisualization = visualizationStore.selectedVisualization;
    const restoredSymbol = getSymbolPrimitive(restoredVisualization);

    expect(restoredVisualization?.id).toBe(strokeAwareInput.id);
    expect(restoredSymbol?.strokeMode).toBe(StrokeMode.CATEGORIES);
    expect(restoredSymbol?.strokeCategoryColumn).toBe('outline_group');
    expect(restoredSymbol?.strokeDashed).toBe(true);
    expect(restoredSymbol?.strokeClassification?.labels).toEqual([
      'North',
      'South',
      'East',
      'West'
    ]);
    expect(restoredSymbol?.strokeClassification?.disabledLabels).toEqual([
      'West'
    ]);
    expect(
      restoredSymbol?.modeStates?.[SymbolMode.CATEGORIES]?.strokeCategoryColumn
    ).toBe('outline_group');
    expect(
      restoredSymbol?.modeStates?.[SymbolMode.CATEGORIES]?.strokeClassification
        ?.labels
    ).toEqual(['North', 'South', 'East', 'West']);
  });
});
