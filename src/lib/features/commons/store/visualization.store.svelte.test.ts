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
  getTextPrimitive,
  visualizationStore,
  type VisualizationConfig
} from './visualization.store.svelte';
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
