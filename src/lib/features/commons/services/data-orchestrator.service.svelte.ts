import type { DatasetResult } from '$lib/features/data-pipeline';
import { createFileFromUpload } from '$lib/features/data-pipeline';
import type { GeoJSONFeatureCollection as ParserGeoJSONFeatureCollection } from '$lib/features/data-pipeline/adapters/parsers/geojson.parser';
import { duckDBOrchestrator } from '$lib/features/duckdb';
import {
  isGeoJSONFeatureCollection,
  type GeoJSONFeatureCollection
} from '$lib/types/data';
import { layersActions } from '../../step-toolbar/tools/layers/layers.store.svelte';
import { projectionActions } from '../../step-toolbar/tools/projections/projection.store.svelte';
import {
  formatError,
  isFatalError,
  ParseError
} from '../errors/pipeline.errors';
import type { UploadedFile } from '../store/create-project.types';
import { FileType } from '../store/create-project.types';
import { datasetsStore } from '../store/datasets.store.svelte';
import { projectStore } from '../store/project.store.svelte';
import {
  visualizationStore,
  VisualizationType
} from '../store/visualization.store.svelte';
import { LogCategory, logger } from '../utils/logger';
import { showError, showWarning } from '../utils/notification.utils.svelte';
import { importRollbackService } from './import-rollback.service';

class DataOrchestratorService {
  private _geometryDatasetsVersion = $state(0);

  async initialize(): Promise<void> {
    await projectStore.waitForInit();

    const currentProject = projectStore.currentProject;

    if (currentProject?.data?.sourceFiles) {
      await this.processProjectFiles(currentProject.data.sourceFiles);
    }
  }

  async onFileAdded(file: UploadedFile): Promise<void> {
    // Create snapshot BEFORE any changes for potential rollback
    const snapshot = importRollbackService.createSnapshot(file);

    try {
      const dataset = await datasetsStore.addFile(file);

      if (!dataset) {
        logger.error('Dataset not found after processing', LogCategory.DATA, {
          fileId: file.id
        });
        return;
      }

      await this.processFileInDuckDB(file, dataset);

      // Mark file as processed to prevent reprocessing
      this.processedFileIds.add(file.id);
      // Legacy pipeline: no GeoParquet cache, rely on DuckDB state

      // Note: _geometryDatasetsVersion is now incremented inside processFileInDuckDB
      // after DuckDB dataset is fully ready (prevents 5s delay in map reaction)

      if (dataset.geometry) {
        projectionActions.suggestProjectionForCurrentData();
      }

      const existingVisualizations =
        visualizationStore.getVisualizationsByDataset(dataset.id);
      if (existingVisualizations.length === 0) {
        this.createDefaultVisualization(dataset.id);
      }

      layersActions.syncWithVisualizations();
    } catch (error) {
      // Log the error with full context
      logger.error('File import failed', LogCategory.DATA, formatError(error));

      // Check if error is fatal (requires rollback) or non-fatal (just show toast)
      if (isFatalError(error)) {
        // Rollback all changes
        await importRollbackService.rollback(snapshot);

        // Show error notification for fatal errors
        showError(
          "Erreur fatale lors de l'import",
          error instanceof Error ? error.message : 'Erreur inconnue'
        );
      } else {
        // Non-fatal error: just show warning toast, keep changes

        showWarning(
          'Avertissement',
          error instanceof Error
            ? error.message
            : "Avertissement lors de l'import"
        );
      }

      // Re-throw only fatal errors to stop further processing
      if (isFatalError(error)) {
        throw error;
      }
    }
  }

  get geometryDatasetsVersion() {
    return this._geometryDatasetsVersion;
  }

  async onFileRemoved(fileId: string): Promise<void> {
    const dataset = datasetsStore.getDatasetBySourceFile(fileId);

    if (dataset) {
      const visualizations = visualizationStore.getVisualizationsByDataset(
        dataset.id
      );
      visualizations.forEach((viz) => {
        visualizationStore.removeVisualization(viz.id);
      });

      const duckDataset = duckDBOrchestrator
        .getAllDatasets()
        .find((d) => d.sourceFileId === fileId);
      if (duckDataset) {
        await duckDBOrchestrator.dropTable(duckDataset.tableName);

        // Cleanup DuckDB cache and file handles to prevent memory leaks
        await this.cleanupDuckDBResources(duckDataset.tableName);

        this._geometryDatasetsVersion++;
      }

      datasetsStore.removeDataset(dataset.id);
      layersActions.syncWithVisualizations();
    }

    // Remove from processed files set
    this.processedFileIds.delete(fileId);

    // Clean up orphaned datasets (datasets whose sourceFileId no longer exists in project)
    this.cleanupOrphanedDatasets();
  }

  /**
   * Cleanup DuckDB resources to prevent memory leaks
   * Removes file handles, cache entries, and metadata
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

      // Remove from registered files (find by table name)
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

      // Remove from cache (will be handled by LRU but we can force it)
      if (Duck.table_geoparquet_cache.has(tableName)) {
        Duck.table_geoparquet_cache.delete(tableName);
      }
    } catch (error) {
      logger.warn(
        'Failed to cleanup DuckDB resources',
        LogCategory.DUCKDB,
        error
      );
    }
  }

  private cleanupOrphanedDatasets(): void {
    const currentProject = projectStore.currentProject;
    if (!currentProject?.data?.sourceFiles) return;

    const validSourceFileIds = new Set(
      currentProject.data.sourceFiles.map((f) => f.id)
    );

    const allDatasets = datasetsStore.getAllDatasets();
    const orphanedDatasets = allDatasets.filter(
      (d) => !validSourceFileIds.has(d.sourceFileId)
    );

    if (orphanedDatasets.length > 0) {
      orphanedDatasets.forEach((dataset) => {
        datasetsStore.removeDataset(dataset.id);
      });
    }
  }

  private async prepareFileForDuckDB(
    file: UploadedFile,
    dataset: DatasetResult | undefined
  ): Promise<UploadedFile | null> {
    const requiresGeoProcessing =
      !!dataset?.geometry ||
      file.fileType === FileType.GEOJSON ||
      file.fileType === FileType.SHAPEFILE ||
      file.fileType === FileType.GEOPACKAGE ||
      file.fileType === FileType.GEOPARQUET ||
      file.fileType === FileType.KML ||
      file.fileType === FileType.KMZ;

    if (!requiresGeoProcessing) {
      return null;
    }

    if (dataset?.metadata?.geoDuckTableReady && dataset.tableName) {
      return null;
    }

    if (dataset?.tableName) {
      return null;
    }

    if (file.fileType === FileType.KML || file.fileType === FileType.KMZ) {
      return await this.convertKMLForDuckDB(file);
    }

    return file;
  }

  // KML conversion is now handled directly by DuckDB ST_Read in kml.parser.ts
  private async convertKMLForDuckDB(file: UploadedFile): Promise<UploadedFile> {
    try {
      let geojsonObject: ParserGeoJSONFeatureCollection;

      if (file.parsedData && isGeoJSONFeatureCollection(file.parsedData)) {
        geojsonObject = file.parsedData as ParserGeoJSONFeatureCollection;
      } else {
        // KML parsing is now done via DuckDB in the data pipeline
        // This path should not be reached with the new architecture
        throw new Error(
          'KML files should be processed by the data pipeline, not here'
        );
      }

      const geojsonString =
        file.preparedGeoJSON ?? JSON.stringify(geojsonObject);
      file.preparedGeoJSON = geojsonString;
      const normalizedName = file.name.replace(/\.(kml|kmz)$/i, '.geojson');
      const parsedGeoJSON =
        geojsonObject as unknown as GeoJSONFeatureCollection;

      return {
        ...file,
        name: normalizedName,
        type: 'application/geo+json',
        fileType: FileType.GEOJSON,
        content: geojsonString,
        preparedGeoJSON: geojsonString,
        parsedData: parsedGeoJSON
      };
    } catch (error) {
      throw new ParseError(
        'Failed to convert KML/KMZ to GeoJSON',
        file.fileType,
        {
          fileId: file.id,
          fileName: file.name,
          originalError: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  private async processFileInDuckDB(
    file: UploadedFile,
    datasetOverride?: DatasetResult
  ): Promise<void> {
    const dataset =
      datasetOverride ?? datasetsStore.getDatasetBySourceFile(file.id);

    if (!dataset) {
      return;
    }

    const duckDBFile = await this.prepareFileForDuckDB(file, dataset);

    if (duckDBFile) {
      try {
        const duckResult = await duckDBOrchestrator.processFile(duckDBFile);
        if (duckResult && dataset) {
          datasetsStore.updateDatasetTableName(
            dataset.id,
            duckResult.tableName
          );

          // Mark dataset as DuckDB-processed to prevent reprocessing
          const updatedDataset = datasetsStore.datasets.find(
            (d) => d.id === dataset.id
          );
          if (updatedDataset) {
            updatedDataset.metadata = {
              ...updatedDataset.metadata,
              geoDuckTableReady: true
            };
          }

          // Increment geometry datasets version to trigger map reactivity
          this._geometryDatasetsVersion++;
        }
      } catch (error) {
        logger.error(
          'Failed to process Geo file via DuckDB orchestrator',
          LogCategory.DUCKDB,
          error
        );
        throw error;
      }
      return;
    }

    if (dataset.tableName) {
      try {
        const registered = await duckDBOrchestrator.registerExistingTable(
          dataset.tableName,
          dataset.sourceFileId || file.id,
          file.name,
          {
            geoDetection: dataset.geoDetection
          }
        );

        // If table doesn't exist (null returned), re-process the file
        if (registered === null) {
          logger.info(
            'DuckDB table missing, re-processing file from scratch',
            LogCategory.DUCKDB,
            {
              fileId: file.id,
              fileName: file.name,
              oldTableName: dataset.tableName
            }
          );

          // Re-process through the normal flow (will create new table)
          const duckDBFile = await this.prepareFileForDuckDB(file, dataset);
          if (duckDBFile) {
            const duckResult = await duckDBOrchestrator.processFile(duckDBFile);
            if (duckResult && dataset) {
              datasetsStore.updateDatasetTableName(
                dataset.id,
                duckResult.tableName
              );

              const updatedDataset = datasetsStore.datasets.find(
                (d) => d.id === dataset.id
              );
              if (updatedDataset) {
                updatedDataset.metadata = {
                  ...updatedDataset.metadata,
                  geoDuckTableReady: true
                };
              }

              this._geometryDatasetsVersion++;
            }
          }
        }
      } catch (registerError) {
        logger.error('Failed to register table', LogCategory.DUCKDB, {
          error:
            registerError instanceof Error
              ? registerError.message
              : 'Unknown error',
          tableName: dataset.tableName
        });
      }
    }
  }

  private createDefaultVisualization(datasetId: string): void {
    visualizationStore.createVisualization(
      VisualizationType.CHOROPLETH,
      datasetId
    );
  }

  async onProjectChanged(): Promise<void> {
    // Wait for DuckDB to be ready before processing files
    await duckDBOrchestrator.waitForInitialization();

    visualizationStore.clear();
    datasetsStore.clear();
    layersActions.reset();
    projectionActions.reset();

    // Clear processed file IDs when switching projects
    this.processedFileIds.clear();

    const currentProject = projectStore.currentProject;
    if (currentProject?.data?.sourceFiles) {
      await this.processProjectFiles(currentProject.data.sourceFiles);
    }
  }

  private processedFileIds = new Set<string>();

  private processingFiles = new Set<string>();

  /**
   * Process items with limited concurrency to prevent memory/CPU saturation
   */
  private async processWithLimit<T>(
    items: T[],
    limit: number,
    processor: (item: T, index: number, total: number) => Promise<void>
  ): Promise<void> {
    const queue = [...items];
    const workers: Promise<void>[] = [];
    let processed = 0;
    const total = items.length;

    for (let i = 0; i < Math.min(limit, queue.length); i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const item = queue.shift();
            if (item) {
              await processor(item, processed++, total);
            }
          }
        })()
      );
    }

    await Promise.all(workers);
  }

  private async processProjectFiles(files: UploadedFile[]): Promise<void> {
    // Filter out files that are already processed OR currently being processed
    const unprocessedFiles = files.filter(
      (f) => !this.processedFileIds.has(f.id) && !this.processingFiles.has(f.id)
    );

    if (unprocessedFiles.length === 0) {
      return;
    }

    // Mark files as processing BEFORE starting to prevent race conditions
    unprocessedFiles.forEach((f) => this.processingFiles.add(f.id));

    // Begin batch mode to suppress version bumps until all files AND transformations are applied
    // This prevents UI flash (old column names → new column names)
    duckDBOrchestrator.beginBatch();

    try {
      const concurrency = this.determineProjectConcurrency();

      await this.processWithLimit(
        unprocessedFiles,
        concurrency,
        async (file, index, total) => {
          // Restore companion files for shapefiles
          logger.debug(
            `[DataOrchestrator] Checking file restoration for ${file.name}`,
            LogCategory.DATA,
            {
              fileType: file.fileType,
              relatedFiles: file.relatedFiles,
              hasOriginal: !!file.originalFile
            }
          );

          if (
            file.fileType === FileType.SHAPEFILE &&
            (!file.relatedFileObjects || file.relatedFileObjects.length === 0)
          ) {
            if (file.relatedFilesData) {
              logger.debug(
                `[DataOrchestrator] Restoring companion files from data for ${file.name}`,
                LogCategory.DATA
              );
              const companionFiles: File[] = [];
              for (const [name, buffer] of Object.entries(
                file.relatedFilesData
              )) {
                try {
                  const restoredFile = new File([buffer], name);
                  companionFiles.push(restoredFile);
                } catch (err) {
                  logger.warn(
                    `Failed to restore companion file ${name}`,
                    LogCategory.DATA,
                    { error: err }
                  );
                }
              }
              if (companionFiles.length > 0) {
                file.relatedFileObjects = companionFiles;
                logger.debug(
                  `[DataOrchestrator] Restored ${companionFiles.length} companion files`,
                  LogCategory.DATA
                );
              }
            } else {
              logger.warn(
                `[DataOrchestrator] No relatedFilesData found for ${file.name}`,
                LogCategory.DATA
              );
            }
          }

          // Restore original file object if missing (needed for DuckDB ingestion)
          if (!file.originalFile) {
            try {
              file.originalFile = await createFileFromUpload(file);
            } catch (err) {
              logger.warn(
                `Failed to restore original file object for ${file.name}`,
                LogCategory.DATA,
                { error: err }
              );
            }
          }

          const progress = `${index + 1}/${total}`;
          logger.debug(
            `[DataOrchestrator] Processing file ${progress}: ${file.name}`,
            LogCategory.DATA
          );

          try {
            await this.onFileAdded(file);

            // Apply saved column transformations after file is loaded
            if (
              file.columnTransformations &&
              file.columnTransformations.length > 0
            ) {
              await this.applyColumnTransformations(file);
            }
          } catch (err) {
            // Individual file failure shouldn't stop the whole batch
            // Error is already logged in onFileAdded
          }
        }
      );
    } catch (error) {
      logger.error('Failed to process project files', LogCategory.DATA, error);
    } finally {
      // Clear processing flags
      unprocessedFiles.forEach((f) => this.processingFiles.delete(f.id));

      // End batch mode - triggers a single UI update with final state (renamed columns)
      duckDBOrchestrator.endBatch();
    }
  }

  private async applyColumnTransformations(file: UploadedFile): Promise<void> {
    const dataset = datasetsStore.getDatasetBySourceFile(file.id);

    if (!dataset?.tableName || !file.columnTransformations) {
      return;
    }

    logger.debug(
      `[DataOrchestrator] Applying ${file.columnTransformations.length} column transformations for ${file.name}`,
      LogCategory.DATA
    );

    for (const transformation of file.columnTransformations) {
      try {
        switch (transformation.type) {
          case 'rename':
            if (transformation.newValue) {
              await duckDBOrchestrator.renameColumn(
                dataset.tableName,
                transformation.column,
                transformation.newValue
              );
              datasetsStore.renameDatasetColumn(
                dataset.id,
                transformation.column,
                transformation.newValue
              );
            }
            break;
          case 'drop':
            await duckDBOrchestrator.dropColumn(
              dataset.tableName,
              transformation.column
            );
            break;
          case 'type_change':
            if (transformation.newValue) {
              await duckDBOrchestrator.changeColumnType(
                dataset.tableName,
                transformation.column,
                transformation.newValue
              );
            }
            break;
        }
      } catch (err) {
        logger.warn(
          `Failed to apply transformation ${transformation.type} on column ${transformation.column}`,
          LogCategory.DATA,
          { error: err }
        );
      }
    }
  }

  private determineProjectConcurrency(): number {
    // Use lower concurrency for mobile/tablet
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      return Math.max(1, Math.min(4, navigator.hardwareConcurrency - 1));
    }
    return 2;
  }
}

export const dataOrchestratorService = new DataOrchestratorService();
