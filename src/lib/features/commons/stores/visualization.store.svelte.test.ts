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
  getPrimitiveClassification,
  getSymbolPrimitive,
  getTextPrimitive,
  resolveAllowedPrimitiveFilters,
  visualizationStore,
  type VisualizationConfig
} from './visualization.store.svelte';
import { GEO_COLUMN_TYPE } from '$lib/features/commons/constants/data.constants';
import {
  ColorMode,
  CategoryShapeMode,
  FillMode,
  MissingDataShape,
  ProportionalType,
  ShapeType,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import { ScaleType } from './visualization.store.svelte';
import { datasetsStore } from './datasets.store.svelte';
import {
  ColumnType,
  FileFormatEnum,
  type EnrichedColumn
} from '$lib/features/data-pipeline/types';
import {
  SavePriority,
  persistenceRegistry
} from '$lib/features/project-management/core/persistence-registry';

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

function buildDatasetWithHiddenNumericId(): DatasetResult {
  return {
    id: 'dataset-hidden-id',
    name: 'Dataset with hidden numeric id',
    sourceFileId: 'source-hidden-id',
    tableName: 'dataset_with_hidden_numeric_id',
    columns: [
      buildColumn('__id', ColumnType.NUMBER),
      buildColumn('id', ColumnType.NUMBER),
      buildColumn('li_type', ColumnType.TEXT),
      buildColumn('geom', ColumnType.GEOMETRY)
    ],
    rowCount: 10,
    geometry: {
      type: 'LineString',
      columnName: 'geom',
      bounds: [0, 0, 1, 1],
      centroid: [0.5, 0.5],
      featureCount: 10
    },
    metadata: {
      processedAt: new Date('2026-04-22T00:00:00.000Z'),
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
      labelFontFamily: 'Inter',
      labelSize: 14,
      labelBold: true,
      labelItalic: true,
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
    expect(visualization?.style.textFontFamily).toBe('Inter');
    expect(visualization?.style.textSize).toBe(14);
    expect(visualization?.style.textBold).toBe(true);
    expect(visualization?.style.textItalic).toBe(true);
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

describe('visualizationStore duplication', () => {
  afterEach(() => {
    visualizationStore.clear();
    datasetsStore.clear();
    persistenceRegistry.markClean();
  });

  it('duplicates suggestion-backed visualizations as independent custom copies', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    const original = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1',
      'Suggested visualization'
    );
    visualizationStore.updateVisualization(original.id, {
      origin: {
        mode: 'auto-suggestion',
        suggestionKey: 'symbols_differents::name',
        restoreState: {
          origin: { mode: 'legacy' },
          visualization: {
            type: original.type,
            modes: original.modes,
            primitiveFilters: original.primitiveFilters,
            style: original.style,
            mapping: original.mapping
          }
        }
      }
    });

    const duplicated = visualizationStore.duplicateVisualization(original.id);

    expect(duplicated).not.toBeNull();
    if (!duplicated) {
      return;
    }

    expect(duplicated.id).not.toBe(original.id);
    expect(duplicated.origin).toEqual({
      mode: 'custom',
      suggestionKey: 'symbols_differents::name'
    });
    expect(duplicated.origin?.restoreState).toBeUndefined();
    expect(visualizationStore.selectedVisualization?.id).toBe(duplicated.id);
    expect(
      visualizationStore.activeVisualizations.map(
        (visualization) => visualization.id
      )
    ).toContain(duplicated.id);

    const storedOriginal = visualizationStore.visualizations.find(
      (visualization) => visualization.id === original.id
    );
    expect(storedOriginal?.origin?.restoreState).toBeDefined();
  });
});

describe('visualizationStore default mapping selection', () => {
  afterEach(() => {
    visualizationStore.clear();
    datasetsStore.clear();
    persistenceRegistry.markClean();
  });

  it('prefers a visible id column over hidden technical ids for numeric defaults', () => {
    const dataset = buildDatasetWithHiddenNumericId();
    datasetsStore.addProcessedDataset(dataset);

    const proportional = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      dataset.id
    );
    const choropleth = visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      dataset.id
    );

    expect(proportional.mapping.sizeColumn).toBe('id');
    expect(choropleth.mapping.valueColumn).toBe('id');
    expect(proportional.mapping.sizeColumn).not.toBe('__id');
    expect(choropleth.mapping.valueColumn).not.toBe('__id');
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
          dataFilters: visualization.dataFilters
        }
      }
    });
  });

  it('preserves the last applied suggestion key when semantic edits promote a suggestion to custom', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1'
    );

    visualizationStore.updateVisualization(visualization.id, {
      origin: {
        mode: 'manual-suggestion',
        suggestionKey: 'lines_colorful_QL::1::li_type::line::QL'
      }
    });

    visualizationStore.updateModes(visualization.id, {
      color: ColorMode.UNIQUE
    });

    expect(visualizationStore.selectedVisualization?.origin).toEqual({
      mode: 'custom',
      suggestionKey: 'lines_colorful_QL::1::li_type::line::QL'
    });
  });
});

describe('visualizationStore rename persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    visualizationStore.clear();
    datasetsStore.clear();
    persistenceRegistry.markClean();
  });

  it('persists explicit renames through the immediate save path', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1'
    );
    const notifyChangeSpy = vi.spyOn(persistenceRegistry, 'notifyChange');

    notifyChangeSpy.mockClear();
    visualizationStore.renameVisualization(visualization.id, '  Atlas  ');

    expect(visualizationStore.selectedVisualization?.name).toBe('Atlas');
    expect(notifyChangeSpy).toHaveBeenCalledWith(
      'visualization',
      SavePriority.IMMEDIATE
    );
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

  it('merges source category metadata from the legacy symbolClassification mirror', () => {
    datasetsStore.addProcessedDataset(buildDataset());
    const input = buildRichSymbolVisualization();
    const sourceAwareClassification = {
      ...input.symbolClassification!,
      labels: ['Public label', 'private'],
      categoryValues: ['public', 'private'],
      disabledLabels: ['private']
    };
    const mirrorAware: VisualizationConfig = {
      ...input,
      symbolClassification: sourceAwareClassification,
      symbol: input.symbol
        ? {
            ...input.symbol,
            classification: {
              ...input.symbol.classification!,
              labels: ['public', 'private']
            }
          }
        : undefined
    };

    visualizationStore.restoreFromSerialized({
      visualizations: [mirrorAware],
      selectedVisualizationId: mirrorAware.id,
      activeVisualizationIds: [mirrorAware.id]
    });

    const viz = visualizationStore.selectedVisualization;
    const symbol = getSymbolPrimitive(viz);
    const runtimeClassification = getPrimitiveClassification(
      viz,
      PrimitiveFilterType.POINT
    );
    expect(symbol?.classification?.labels).toEqual(['Public label', 'private']);
    expect(symbol?.classification?.categoryValues).toEqual([
      'public',
      'private'
    ]);
    expect(symbol?.classification?.disabledLabels).toEqual(['private']);
    expect(runtimeClassification?.categoryValues).toEqual([
      'public',
      'private'
    ]);
    expect(runtimeClassification?.disabledLabels).toEqual(['private']);
    expect(symbol?.classification?.categoryShapes).toEqual(
      input.symbol?.classification?.categoryShapes
    );
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

describe('visualizationStore LinePrimitiveConfig round-trip persistence', () => {
  afterEach(() => {
    visualizationStore.clear();
    datasetsStore.clear();
    persistenceRegistry.markClean();
  });

  function buildRichLineVisualization(): VisualizationConfig {
    return {
      id: 'viz-line-full',
      name: 'Lines full',
      datasetId: 'dataset-1',
      enabled: true,
      type: VisualizationType.CATEGORICAL,
      primitiveFilters: [PrimitiveFilterType.LINE],
      primitiveOrder: [PrimitiveFilterType.LINE],
      modes: {
        color: ColorMode.CATEGORIES,
        thickness: ThicknessMode.PROPORTIONAL
      },
      style: {
        lineOpacity: 0.66,
        lineWidth: 2,
        lineMaxWidth: 14,
        lineDashed: true
      },
      mapping: {
        geometryColumn: 'geom',
        categoryColumn: 'segment',
        valueColumn: 'capacity',
        sizeColumn: 'population'
      },
      lineClassification: {
        method: ClassificationMethod.MANUAL,
        classes: 4,
        numClasses: 4,
        colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3'],
        labels: ['A', 'B', 'C', 'D'],
        disabledLabels: ['D'],
        paletteId: 'categorical-set1'
      },
      lineThicknessClassification: {
        method: ClassificationMethod.KMEANS,
        classes: 3,
        numClasses: 3,
        breaks: [10, 20],
        counts: [2, 3, 1],
        colors: ['#f7fbff', '#6baed6', '#08519c']
      },
      line: {
        enabled: true,
        colorMode: ColorMode.CATEGORIES,
        thicknessMode: ThicknessMode.PROPORTIONAL,
        color: '#e41a1c',
        width: 2,
        maxWidth: 14,
        opacity: 0.66,
        dashed: true,
        valueColumn: 'capacity',
        categoryColumn: 'segment',
        sizeColumn: 'population',
        classification: {
          method: ClassificationMethod.MANUAL,
          classes: 4,
          numClasses: 4,
          colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3'],
          labels: ['A', 'B', 'C', 'D'],
          disabledLabels: ['D'],
          paletteId: 'categorical-set1'
        },
        thicknessClassification: {
          method: ClassificationMethod.KMEANS,
          classes: 3,
          numClasses: 3,
          breaks: [10, 20],
          counts: [2, 3, 1],
          colors: ['#f7fbff', '#6baed6', '#08519c']
        },
        colorModeStates: {
          [ColorMode.CLASSES]: {
            valueColumn: 'capacity',
            classification: {
              method: ClassificationMethod.KMEANS,
              classes: 5,
              numClasses: 5,
              breaks: [5, 10, 20, 30],
              colors: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15']
            }
          },
          [ColorMode.UNIQUE]: {
            color: '#0055aa'
          }
        },
        thicknessModeStates: {
          [ThicknessMode.UNIQUE]: {
            width: 4
          },
          [ThicknessMode.CLASSES]: {
            valueColumn: 'capacity',
            maxWidth: 18,
            thicknessClassification: {
              method: ClassificationMethod.MANUAL,
              classes: 4,
              numClasses: 4,
              breaks: [8, 16, 24],
              counts: [3, 2, 1, 1]
            }
          }
        },
        missingData: {
          show: true,
          shape: MissingDataShape.CIRCLE,
          size: 3,
          color: '#bdbdbd',
          opacity: 0.5
        }
      }
    };
  }

  it('keeps proportional size mapping and categorical classification through the persistence registry round-trip used by project saves', () => {
    datasetsStore.addProcessedDataset(buildDataset());
    const input = buildRichLineVisualization();

    visualizationStore.restoreFromSerialized({
      visualizations: [input],
      selectedVisualizationId: input.id,
      activeVisualizationIds: [input.id]
    });

    const serialized = persistenceRegistry.serializeAll().visualization as {
      visualizations: VisualizationConfig[];
      selectedVisualizationId?: string;
      activeVisualizationIds?: string[];
    };

    visualizationStore.clear();

    visualizationStore.restoreFromSerialized({
      visualizations: serialized.visualizations,
      selectedVisualizationId: serialized.selectedVisualizationId,
      activeVisualizationIds: serialized.activeVisualizationIds ?? []
    });

    const viz = visualizationStore.selectedVisualization;
    expect(viz).toBeDefined();
    if (!viz) {
      throw new Error(
        'line visualization missing after persistence round-trip'
      );
    }

    expect(viz.mapping.categoryColumn).toBe('segment');
    expect(viz.mapping.valueColumn).toBe('capacity');
    expect(viz.mapping.sizeColumn).toBe('population');
    expect(viz.line?.colorMode).toBe(ColorMode.CATEGORIES);
    expect(viz.line?.thicknessMode).toBe(ThicknessMode.PROPORTIONAL);
    expect(viz.line?.opacity).toBeCloseTo(0.66);
    expect(viz.line?.maxWidth).toBe(14);
    expect(viz.line?.dashed).toBe(true);
    expect(viz.line?.classification?.labels).toEqual(['A', 'B', 'C', 'D']);
    expect(viz.line?.classification?.disabledLabels).toEqual(['D']);
    expect(viz.line?.classification?.paletteId).toBe('categorical-set1');
    expect(viz.line?.thicknessClassification?.breaks).toEqual([10, 20]);
    expect(viz.lineThicknessClassification?.counts).toEqual([2, 3, 1]);
    expect(viz.line?.colorModeStates?.[ColorMode.CLASSES]?.valueColumn).toBe(
      'capacity'
    );
    expect(viz.line?.colorModeStates?.[ColorMode.UNIQUE]?.color).toBe(
      '#0055aa'
    );
    expect(viz.line?.thicknessModeStates?.[ThicknessMode.UNIQUE]?.width).toBe(
      4
    );
    expect(
      viz.line?.thicknessModeStates?.[ThicknessMode.CLASSES]?.maxWidth
    ).toBe(18);
    expect(
      viz.line?.thicknessModeStates?.[ThicknessMode.CLASSES]
        ?.thicknessClassification?.breaks
    ).toEqual([8, 16, 24]);
    expect(viz.line?.missingData?.color).toBe('#bdbdbd');
  });
});

describe('resolveAllowedPrimitiveFilters geometry resolution', () => {
  function makeDataset(overrides: Partial<DatasetResult> = {}): DatasetResult {
    return {
      id: 'ds-geo-resolve',
      name: 'geo-resolve',
      sourceFileId: 'src-geo-resolve',
      tableName: 'geo_resolve',
      columns: [],
      rowCount: 0,
      metadata: {
        processedAt: new Date('2026-05-07T00:00:00.000Z'),
        fileType: 'geojson',
        parserUsed: 'test'
      },
      format: FileFormatEnum.GEOJSON,
      ...overrides
    };
  }

  function makeGeometry(type: string): DatasetResult['geometry'] {
    return {
      type,
      columnName: 'geom',
      bounds: [0, 0, 1, 1],
      centroid: [0.5, 0.5],
      featureCount: 1
    };
  }

  it('returns POINT, POLYGON and TEXT when geometry is Polygon', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.CHOROPLETH,
      makeDataset({ geometry: makeGeometry('Polygon') })
    );
    expect(result).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.TEXT
    ]);
  });

  it('returns POINT, POLYGON and TEXT for MultiPolygon', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.CHOROPLETH,
      makeDataset({ geometry: makeGeometry('MultiPolygon') })
    );
    expect(result).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.TEXT
    ]);
  });

  it('returns POINT, LINE and TEXT for LineString', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.CATEGORICAL,
      makeDataset({ geometry: makeGeometry('LineString') })
    );
    expect(result).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.TEXT
    ]);
  });

  it('returns POINT, LINE and TEXT for MultiLineString', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.CATEGORICAL,
      makeDataset({ geometry: makeGeometry('MultiLineString') })
    );
    expect(result).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.LINE,
      PrimitiveFilterType.TEXT
    ]);
  });

  it('returns POINT and TEXT for Point', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.PROPORTIONAL,
      makeDataset({ geometry: makeGeometry('Point') })
    );
    expect(result).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.TEXT
    ]);
  });

  it('returns POINT and TEXT for MultiPoint', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.PROPORTIONAL,
      makeDataset({ geometry: makeGeometry('MultiPoint') })
    );
    expect(result).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.TEXT
    ]);
  });

  it('returns POINT for a CSV with detected latitude and longitude columns', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.PROPORTIONAL,
      makeDataset({
        format: FileFormatEnum.CSV,
        geoDetection: {
          hasGeoColumns: true,
          geoColumns: [
            {
              index: 0,
              columnName: 'lat',
              type: GEO_COLUMN_TYPE.LATITUDE,
              confidence: 1
            },
            {
              index: 1,
              columnName: 'lon',
              type: GEO_COLUMN_TYPE.LONGITUDE,
              confidence: 1
            }
          ],
          warnings: []
        }
      })
    );
    expect(result).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.TEXT
    ]);
  });

  it('returns POINT and TEXT for a CSV with a single coordinates column', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.PROPORTIONAL,
      makeDataset({
        format: FileFormatEnum.CSV,
        geoDetection: {
          hasGeoColumns: true,
          geoColumns: [
            {
              index: 0,
              columnName: 'gps',
              type: GEO_COLUMN_TYPE.COORDINATES,
              confidence: 1
            }
          ],
          warnings: []
        }
      })
    );
    expect(result).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.TEXT
    ]);
  });

  it('does not infer POINT when only latitude is detected without longitude', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.PROPORTIONAL,
      makeDataset({
        format: FileFormatEnum.CSV,
        geoDetection: {
          hasGeoColumns: true,
          geoColumns: [
            {
              index: 0,
              columnName: 'lat',
              type: GEO_COLUMN_TYPE.LATITUDE,
              confidence: 1
            }
          ],
          warnings: []
        }
      })
    );
    expect(result).toEqual([]);
  });

  it('returns POINT, POLYGON and TEXT when the dataset is joined to a basemap', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.CHOROPLETH,
      makeDataset({
        format: FileFormatEnum.CSV,
        joinedBasemap: 'world-countries-50m'
      })
    );
    expect(result).toEqual([
      PrimitiveFilterType.POINT,
      PrimitiveFilterType.POLYGON,
      PrimitiveFilterType.TEXT
    ]);
  });

  it('disables primitives for an unjoined CSV without GPS detection', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.PROPORTIONAL,
      makeDataset({ format: FileFormatEnum.CSV })
    );
    expect(result).toEqual([]);
  });

  it('treats GeometryCollection as unknown rather than enabling incompatible primitives', () => {
    const result = resolveAllowedPrimitiveFilters(
      VisualizationType.CHOROPLETH,
      makeDataset({ geometry: makeGeometry('GeometryCollection') })
    );
    expect(result).toEqual([]);
  });
});

describe('visualizationStore togglePrimitiveFilter primitive sync', () => {
  afterEach(() => {
    visualizationStore.clear();
    datasetsStore.clear();
    persistenceRegistry.markClean();
  });

  it('disables text.enabled when toggling TEXT off, so the layer-factory stops rendering text labels', () => {
    datasetsStore.addProcessedDataset(buildDataset());
    const visualization = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1'
    );
    const initialText = getTextPrimitive(visualization);
    if (!initialText) {
      throw new Error('Expected createVisualization to initialize text config');
    }
    visualizationStore.updateVisualization(visualization.id, {
      primitiveFilters: [PrimitiveFilterType.LINE, PrimitiveFilterType.TEXT],
      text: {
        ...initialText,
        enabled: true,
        labelColumn: 'name',
        opacity: 1
      }
    });

    visualizationStore.togglePrimitiveFilter(
      visualization.id,
      PrimitiveFilterType.TEXT
    );

    const updated = visualizationStore.selectedVisualization;
    expect(getTextPrimitive(updated)?.enabled).toBe(false);
    expect(updated?.primitiveFilters).not.toContain(PrimitiveFilterType.TEXT);
  });

  it('restores text opacity when re-enabling TEXT through the toggle', () => {
    datasetsStore.addProcessedDataset(buildDataset());
    const visualization = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1'
    );
    const initialText = getTextPrimitive(visualization);
    if (!initialText) {
      throw new Error('Expected createVisualization to initialize text config');
    }
    visualizationStore.updateVisualization(visualization.id, {
      text: {
        ...initialText,
        enabled: false,
        labelColumn: 'name',
        opacity: 0
      }
    });

    visualizationStore.togglePrimitiveFilter(
      visualization.id,
      PrimitiveFilterType.TEXT
    );

    const updated = visualizationStore.selectedVisualization;
    const text = getTextPrimitive(updated);
    expect(text?.enabled).toBe(true);
    expect(text?.opacity ?? 0).toBeGreaterThan(0);
    expect(updated?.primitiveFilters).toContain(PrimitiveFilterType.TEXT);
  });

  it('keeps symbol.enabled in sync with primitiveFilters when toggling POINT', () => {
    datasetsStore.addProcessedDataset(buildDataset());
    const visualization = visualizationStore.createVisualization(
      VisualizationType.PROPORTIONAL,
      'dataset-1'
    );
    const initialSymbol = getSymbolPrimitive(visualization);
    if (!initialSymbol) {
      throw new Error('Expected symbol primitive to exist');
    }
    visualizationStore.updateVisualization(visualization.id, {
      primitiveFilters: [PrimitiveFilterType.POINT, PrimitiveFilterType.LINE],
      symbol: { ...initialSymbol, enabled: true }
    });

    visualizationStore.togglePrimitiveFilter(
      visualization.id,
      PrimitiveFilterType.POINT
    );

    const updated = visualizationStore.selectedVisualization;
    expect(getSymbolPrimitive(updated)?.enabled).toBe(false);
    expect(updated?.primitiveFilters).not.toContain(PrimitiveFilterType.POINT);
  });
});
