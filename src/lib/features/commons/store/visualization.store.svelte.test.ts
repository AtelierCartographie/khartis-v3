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
  VisualizationType,
  visualizationStore
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

  it('preserves suggestion origin through semantic classification changes', () => {
    datasetsStore.addProcessedDataset(buildDataset());

    const visualization = visualizationStore.createVisualization(
      VisualizationType.CATEGORICAL,
      'dataset-1'
    );

    const suggestionOrigin = {
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
    } as const;

    visualizationStore.updateVisualization(visualization.id, {
      origin: suggestionOrigin
    });

    visualizationStore.updateClassification(visualization.id, {
      method: ClassificationMethod.MANUAL
    });

    const updatedVisualization = visualizationStore.selectedVisualization;

    expect(updatedVisualization?.origin).toEqual(suggestionOrigin);
  });
});
