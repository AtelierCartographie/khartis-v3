import { duckDBOrchestrator } from '$lib/features/duckdb';
import type { UploadedFile } from '../store/create-project.types';
import { datasetsStore } from '../store/datasets.store.svelte';
import { projectStore } from '../store/project.store.svelte';
import { visualizationStore } from '../store/visualization.store.svelte';
import { LogCategory, logger } from '../utils/logger';

interface ImportSnapshot {
  fileId: string;
  fileName: string;
  timestamp: Date;

  hadProjectFile: boolean;
  hadDataset: boolean;
  datasetId?: string;
  hadDuckDBTable: boolean;
  duckDBTableName?: string;
  visualizationIds: string[];
}

class ImportRollbackService {
  createSnapshot(file: UploadedFile): ImportSnapshot {
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
      timestamp: new Date(),
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

  async rollback(snapshot: ImportSnapshot): Promise<void> {
    const cleanupResults = {
      projectFile: false,
      dataset: false,
      duckDBTable: false,
      visualizations: 0,
      duckDBCache: false
    };

    try {
      if (!snapshot.hadProjectFile) {
        const currentProject = projectStore.currentProject;
        if (currentProject?.data?.sourceFiles) {
          const fileIndex = currentProject.data.sourceFiles.findIndex(
            (f) => f.id === snapshot.fileId
          );
          if (fileIndex !== -1) {
            currentProject.data.sourceFiles.splice(fileIndex, 1);
            cleanupResults.projectFile = true;
          }
        }
      }

      if (!snapshot.hadDataset) {
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

      if (!snapshot.hadDuckDBTable) {
        const duckDataset = duckDBOrchestrator
          .getAllDatasets()
          .find((d) => d.sourceFileId === snapshot.fileId);

        if (duckDataset) {
          await duckDBOrchestrator.dropTable(duckDataset.tableName);

          await this.cleanupDuckDBResources(duckDataset.tableName);
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

  private async cleanupDuckDBResources(tableName: string): Promise<void> {
    try {
      const { Duck } = await import('$lib/features/duckdb');

      if (!Duck) {
        return;
      }

      if (Duck.loaded_files.has(tableName)) {
        Duck.loaded_files.delete(tableName);
      }

      const registeredFile = Array.from(Duck.registered_files).find((id) =>
        id.includes(tableName)
      );
      if (registeredFile) {
        Duck.registered_files.delete(registeredFile);
      }

      if (Duck.table_metadata.has(tableName)) {
        Duck.table_metadata.delete(tableName);
      }

      if (Duck.table_geoparquet_cache.has(tableName)) {
        Duck.table_geoparquet_cache.delete(tableName);
      }
    } catch (error) {
      logger.warn(
        'Failed to cleanup DuckDB state during rollback',
        LogCategory.DUCKDB,
        error
      );
    }
  }
}

export const importRollbackService = new ImportRollbackService();
