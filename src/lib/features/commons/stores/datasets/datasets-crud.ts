import type {
  CsvImportOptions,
  DatasetResult
} from '$lib/features/data-pipeline';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import {
  disableFacets,
  getFacetsBaseVisualizationId
} from '$lib/features/step-toolbar/tools/facets';
import type { DatasetsState, DatasetsInternals } from './datasets-state.svelte';
import type { VisualizationStoreOperations } from './datasets-processing';
import { sanitizeTextInput } from '../../utils/sanitize.utils';
import { projectStore } from '../project.store.svelte';
import { dataTabActions, dataTabState } from '../data-tab.store.svelte';
import {
  findById,
  removeById,
  updateById,
  replaceAtIndex
} from '../../utils/array-helpers';

export function addProcessedDataset(
  state: DatasetsState,
  dataset: DatasetResult
): void {
  state.datasets = [...state.datasets, dataset];
  state.enabledDatasetIds.add(dataset.id);
  if (!state.selectedDatasetId) {
    state.selectedDatasetId = dataset.id;
  }
}

export function removeDataset(state: DatasetsState, datasetId: string): void {
  const filteredDatasets = removeById(state.datasets, datasetId);

  if (state.selectedDatasetId === datasetId) {
    const newSelectedId = filteredDatasets[0]?.id;
    state.selectedDatasetId = newSelectedId;
  }

  state.enabledDatasetIds.delete(datasetId);
  state.datasets = filteredDatasets;
}

export async function deleteDataset(
  state: DatasetsState,
  datasetId: string,
  vizOps?: VisualizationStoreOperations | null
): Promise<boolean> {
  const dataset = findById(state.datasets, datasetId);
  if (!dataset) {
    return false;
  }

  if (vizOps) {
    const vizs = vizOps.getVisualizationsByDataset(datasetId);
    const facetsBaseVizId = getFacetsBaseVisualizationId();
    const facetsBaseBeingDeleted =
      facetsBaseVizId !== null &&
      vizs.some((viz) => viz.id === facetsBaseVizId);

    for (const viz of vizs) {
      vizOps.removeVisualization(viz.id);
    }

    if (facetsBaseBeingDeleted) {
      disableFacets();
    }
  }

  await duckDBOrchestrator.dropTable(dataset.tableName);

  removeDataset(state, datasetId);

  if (dataTabState.enrichData.enrichmentDatasetId === datasetId) {
    dataTabActions.setEnrichDataState({
      enrichmentDatasetId: undefined,
      enrichmentColumn: undefined,
      targetColumn: undefined,
      isEnrichmentActive: false
    });
  }

  return true;
}

export function updateDataset(
  state: DatasetsState,
  datasetId: string,
  updates: Partial<
    Pick<
      DatasetResult,
      'tableName' | 'columns' | 'simplificationApplied' | 'metadata'
    >
  >
): void {
  const datasetIndex = state.datasets.findIndex((d) => d.id === datasetId);

  if (datasetIndex === -1) {
    return;
  }

  const updatedDataset = {
    ...state.datasets[datasetIndex],
    ...updates
  };

  state.datasets = replaceAtIndex(state.datasets, datasetIndex, updatedDataset);
}

export function updateDatasetJoinBasemap(
  state: DatasetsState,
  datasetId: string,
  joinedBasemap: string
): void {
  const datasetIndex = state.datasets.findIndex((d) => d.id === datasetId);

  if (datasetIndex === -1) {
    return;
  }

  if (state.datasets[datasetIndex].joinedBasemap === joinedBasemap) {
    return;
  }

  state.datasets = replaceAtIndex(state.datasets, datasetIndex, {
    ...state.datasets[datasetIndex],
    joinedBasemap
  });
}

export function updateDatasetRowCount(
  state: DatasetsState,
  datasetId: string,
  rowCount: number
): void {
  if (!findById(state.datasets, datasetId)) {
    return;
  }
  state.datasets = updateById(state.datasets, datasetId, { rowCount });
}

export function updateDatasetTableName(
  state: DatasetsState,
  datasetId: string,
  tableName: string
): void {
  state.datasets = state.datasets.map((dataset) =>
    dataset.id === datasetId ? { ...dataset, tableName } : dataset
  );
}

export function updateDatasetCsvOptions(
  state: DatasetsState,
  datasetId: string,
  csvOptions: CsvImportOptions
): void {
  const dataset = findById(state.datasets, datasetId);
  if (!dataset) {
    return;
  }
  state.datasets = updateById(state.datasets, datasetId, {
    metadata: { ...dataset.metadata, csvOptions }
  });
}

export async function renameDataset(
  state: DatasetsState,
  datasetId: string,
  newName: string
): Promise<boolean> {
  const dataset = findById(state.datasets, datasetId);
  if (!dataset) {
    return false;
  }

  const sanitizedName = sanitizeTextInput(newName);
  if (!sanitizedName) {
    return false;
  }

  if (dataset.sourceFileId) {
    await projectStore.renameFile(dataset.sourceFileId, sanitizedName);
  }

  state.datasets = updateById(state.datasets, datasetId, {
    name: sanitizedName
  });

  return true;
}

export function hasModifications(
  state: DatasetsState,
  datasetId: string
): boolean {
  const dataset = findById(state.datasets, datasetId);
  if (!dataset) {
    return false;
  }

  if ((dataset.metadata.transformations?.length ?? 0) > 0) {
    return true;
  }

  const sourceFile = dataset.sourceFileId
    ? projectStore.currentProject?.data?.sourceFiles?.find(
        (file) => file.id === dataset.sourceFileId
      )
    : undefined;

  return Boolean(
    sourceFile &&
    ((sourceFile.columnTransformations?.length ?? 0) > 0 ||
      (sourceFile.deletedRowIds?.length ?? 0) > 0)
  );
}

export function recordTransformation(
  state: DatasetsState,
  datasetId: string,
  description: string
): void {
  const dataset = findById(state.datasets, datasetId);
  if (!dataset) {
    return;
  }

  const entry = `${new Date().toISOString()} - ${description}`;
  const updatedTransformations = [
    ...(dataset.metadata.transformations ?? []),
    entry
  ];

  state.datasets = updateById(state.datasets, datasetId, {
    metadata: {
      ...dataset.metadata,
      transformations: updatedTransformations
    }
  });
}

export function waitForDatasetBySourceFile(
  state: DatasetsState,
  internals: DatasetsInternals,
  sourceFileId: string,
  timeoutMs = 30_000
): Promise<string> {
  const existing = state.datasets.find((d) => d.sourceFileId === sourceFileId);
  if (existing) {
    return Promise.resolve(existing.id);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const resolver = (datasetId: string) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      resolve(datasetId);
    };
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      const pendingResolvers =
        internals.pendingDatasetResolvers.get(sourceFileId);
      if (pendingResolvers) {
        const remainingResolvers = pendingResolvers.filter(
          (pendingResolver) => pendingResolver !== resolver
        );
        if (remainingResolvers.length > 0) {
          internals.pendingDatasetResolvers.set(
            sourceFileId,
            remainingResolvers
          );
        } else {
          internals.pendingDatasetResolvers.delete(sourceFileId);
        }
      }
      reject(
        new Error(
          `Dataset selection timed out for source file "${sourceFileId}"`
        )
      );
    }, timeoutMs);

    const resolvers = internals.pendingDatasetResolvers.get(sourceFileId) ?? [];
    resolvers.push(resolver);
    internals.pendingDatasetResolvers.set(sourceFileId, resolvers);
  });
}
