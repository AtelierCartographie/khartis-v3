import { duckDBOrchestrator } from '$lib/features/duckdb';
import type { UploadedFile } from '../store/create-project.types';
import { datasetsStore } from '../store/datasets.store.svelte';
import { projectStore } from '../store/project.store.svelte';
import { visualizationStore } from '../store/visualization.store.svelte';
import { LogCategory, logger } from '../utils/logger';

/**
 * Snapshot of the state before import attempt
 * Used to rollback on fatal errors
 */
interface ImportSnapshot {
  fileId: string;
  fileName: string;
  timestamp: Date;

  // State to restore
  hadProjectFile: boolean;
  hadDataset: boolean;
  datasetId?: string;
  hadDuckDBTable: boolean;
  duckDBTableName?: string;
  visualizationIds: string[];
}

/**
 * Import Rollback Service
 *
 * Handles automatic rollback of file imports on fatal errors.
 * - Takes snapshot before import
 * - Restores state if fatal error occurs
 * - Does NOT rollback for non-fatal errors (duplicates, warnings)
 */
class ImportRollbackService {
  /**
   * Create snapshot of current state before import
   */
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

  /**
   * Rollback to snapshot state
   * Only called on FATAL errors
   */
  async rollback(snapshot: ImportSnapshot): Promise<void> {
    const cleanupResults = {
      projectFile: false,
      dataset: false,
      duckDBTable: false,
      visualizations: 0,
      duckDBCache: false
    };

    try {
      // 1. Remove file from project if it wasn't there before
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

      // 2. Remove dataset if it wasn't there before
      if (!snapshot.hadDataset) {
        const dataset = datasetsStore.getDatasetBySourceFile(snapshot.fileId);
        if (dataset) {
          // Remove visualizations created for this dataset
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

      // 3. Drop DuckDB table if it wasn't there before
      if (!snapshot.hadDuckDBTable) {
        const duckDataset = duckDBOrchestrator
          .getAllDatasets()
          .find((d) => d.sourceFileId === snapshot.fileId);

        if (duckDataset) {
          await duckDBOrchestrator.dropTable(duckDataset.tableName);

          // 4. Clean up DuckDB cache and file handles
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

      // Even if rollback fails, we log it but don't throw
      // Better to have some cleanup than none
    }
  }

  /**
   * Cleanup DuckDB resources (cache, file handles, metadata)
   * Same as in DataOrchestrator but extracted for reuse
   */
  private async cleanupDuckDBResources(tableName: string): Promise<void> {
    try {
      const { Duck } = await import('$lib/features/duckdb');

      if (!Duck) {
        return;
      }

      // Remove from loaded files tracking
      if (Duck.loaded_files.has(tableName)) {
        Duck.loaded_files.delete(tableName);
      }

      // Remove from registered files
      const registeredFile = Array.from(Duck.registered_files).find((id) =>
        id.includes(tableName)
      );
      if (registeredFile) {
        Duck.registered_files.delete(registeredFile);
      }

      // Remove from table metadata
      if (Duck.table_metadata.has(tableName)) {
        Duck.table_metadata.delete(tableName);
      }

      // Remove from cache with LRU update
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
