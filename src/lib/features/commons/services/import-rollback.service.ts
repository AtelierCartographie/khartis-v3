import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import type { UploadedFile } from '../types/create-project.types';
import { datasetsStore } from '../stores/datasets.store.svelte';
import { projectStore } from '../stores/project.store.svelte';
import { visualizationStore } from '../stores/visualization.store.svelte';
import { cleanupDuckDBResources } from '../utils/duckdb-cleanup.utils';
import { LogCategory, logger } from '../utils/logger';

interface ImportSnapshot {
  fileId: string;
  fileName: string;

  hadProjectFile: boolean;
  hadDataset: boolean;
  datasetId?: string;
  hadDuckDBTable: boolean;
  duckDBTableName?: string;
  visualizationIds: string[];
}

function createImportRollbackService() {
  function createSnapshot(file: UploadedFile): ImportSnapshot {
    const currentProject = projectStore.currentProject;
    const existingDataset = datasetsStore.getDatasetBySourceFile(file.id);
    const existingVisualizationsIds = existingDataset
      ? visualizationStore
          .getVisualizationsByDataset(existingDataset.id)
          .map((v) => v.id)
      : [];
    const existingDuckDBDataset = duckDBOrchestrator
      .getAllDatasets()
      .find((d) => d.sourceFileId === file.id);

    const snapshot: ImportSnapshot = {
      fileId: file.id,
      fileName: file.name,
      hadProjectFile: !!currentProject?.data?.sourceFiles?.some(
        (f) => f.id === file.id
      ),
      hadDataset: !!existingDataset,
      datasetId: existingDataset?.id,
      hadDuckDBTable: !!existingDuckDBDataset,
      duckDBTableName: existingDuckDBDataset?.tableName,
      visualizationIds: existingVisualizationsIds
    };

    return snapshot;
  }

  async function rollback(snapshot: ImportSnapshot): Promise<void> {
    const cleanupResults = {
      projectFile: false,
      dataset: false,
      duckDBTable: false,
      visualizations: 0,
      duckDBCache: false
    };

    try {
      let removedViaProjectStore = false;

      if (!snapshot.hadProjectFile) {
        const currentProject = projectStore.currentProject;
        const shouldRemoveProjectFile = currentProject?.data?.sourceFiles?.some(
          (f) => f.id === snapshot.fileId
        );

        if (shouldRemoveProjectFile) {
          const dataset = datasetsStore.getDatasetBySourceFile(snapshot.fileId);
          const duckDataset = duckDBOrchestrator
            .getAllDatasets()
            .find((d) => d.sourceFileId === snapshot.fileId);

          const visualizationCount = dataset
            ? visualizationStore.getVisualizationsByDataset(dataset.id).length
            : 0;

          await projectStore.removeFileFromProject(snapshot.fileId);

          cleanupResults.projectFile = true;
          cleanupResults.dataset = !!dataset;
          cleanupResults.duckDBTable = !!duckDataset;
          cleanupResults.duckDBCache = !!duckDataset;
          cleanupResults.visualizations = visualizationCount;
          removedViaProjectStore = true;
        }
      }

      if (!snapshot.hadDataset && !removedViaProjectStore) {
        const dataset = datasetsStore.getDatasetBySourceFile(snapshot.fileId);
        if (dataset) {
          const visualizations = visualizationStore.getVisualizationsByDataset(
            dataset.id
          );
          visualizations.forEach((viz) => {
            visualizationStore.removeVisualization(viz.id);
            cleanupResults.visualizations++;
          });

          datasetsStore.removeDataset(dataset.id);
          cleanupResults.dataset = true;
        }
      }

      if (!snapshot.hadDuckDBTable && !removedViaProjectStore) {
        const duckDataset = duckDBOrchestrator
          .getAllDatasets()
          .find((d) => d.sourceFileId === snapshot.fileId);

        if (duckDataset) {
          await duckDBOrchestrator.dropTable(duckDataset.tableName);

          await cleanupDuckDBResources(duckDataset.tableName);
          cleanupResults.duckDBTable = true;
          cleanupResults.duckDBCache = true;
        }
      }
    } catch (rollbackError) {
      logger.error('Rollback failed partially', LogCategory.DATA, {
        fileId: snapshot.fileId,
        fileName: snapshot.fileName,
        cleanupResults,
        error: rollbackError
      });
    }
  }

  return {
    createSnapshot,
    rollback
  };
}

export const importRollbackService = createImportRollbackService();
