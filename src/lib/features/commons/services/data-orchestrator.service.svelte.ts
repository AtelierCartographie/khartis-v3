import { duckDBOrchestrator } from '$lib/features/duckdb';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { ColumnType } from '$lib/features/data-pipeline';
import type { GeoJSONFeatureCollection as ParserGeoJSONFeatureCollection } from '$lib/features/data-pipeline/adapters/parsers/geojson.parser';
import { convertKMLFileToGeoJSON } from '$lib/features/data-pipeline/adapters/parsers/kml.parser';
import {
  isGeoJSONFeatureCollection,
  type GeoJSONFeatureCollection
} from '$lib/types/data';
import { layersActions } from '../../step-toolbar/tools/layers/layers.store.svelte';
import { projectionActions } from '../../step-toolbar/tools/projections/projection.store.svelte';
import {
  DataValidationError,
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
  VisualizationType,
  type VisualizationConfig
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

      if (dataset.geometry) {
        this._geometryDatasetsVersion++;
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

    if (file.fileType === FileType.SHAPEFILE) {
      return await this.convertShapefileForDuckDB(file);
    }

    if (file.fileType === FileType.KML || file.fileType === FileType.KMZ) {
      return await this.convertKMLForDuckDB(file);
    }

    return file;
  }

  // Legacy pipeline: caching disabled. DuckDB remains the source of truth.

  private async convertShapefileForDuckDB(
    file: UploadedFile
  ): Promise<UploadedFile> {
    if (!file.parsedData) {
      throw new ParseError(
        'Missing parsed GeoJSON data for shapefile',
        FileType.SHAPEFILE,
        { fileId: file.id, fileName: file.name }
      );
    }

    let geojsonObject: unknown;
    try {
      geojsonObject =
        typeof file.parsedData === 'string'
          ? JSON.parse(file.parsedData)
          : file.parsedData;
    } catch (error) {
      throw new ParseError(
        'Invalid GeoJSON data generated from shapefile',
        FileType.SHAPEFILE,
        {
          fileId: file.id,
          fileName: file.name,
          originalError: error instanceof Error ? error.message : String(error)
        }
      );
    }

    const geojsonString = file.preparedGeoJSON ?? JSON.stringify(geojsonObject);
    file.preparedGeoJSON = geojsonString;

    const geojsonName = file.name.endsWith('.shp')
      ? file.name.replace(/\.shp$/i, '.geojson')
      : `${file.name}.geojson`;

    return {
      ...file,
      name: geojsonName,
      type: 'application/geo+json',
      fileType: FileType.GEOJSON,
      content: geojsonString,
      preparedGeoJSON: geojsonString,
      parsedData: geojsonObject as UploadedFile['parsedData']
    };
  }

  private async convertKMLForDuckDB(file: UploadedFile): Promise<UploadedFile> {
    try {
      let geojsonObject: ParserGeoJSONFeatureCollection;

      if (file.parsedData && isGeoJSONFeatureCollection(file.parsedData)) {
        geojsonObject = file.parsedData as ParserGeoJSONFeatureCollection;
      } else {
        const sourceFile = await this.ensureFileObject(
          file,
          'application/vnd.google-earth.kml+xml'
        );
        geojsonObject = await convertKMLFileToGeoJSON(sourceFile);
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

  private async ensureFileObject(
    file: UploadedFile,
    fallbackMime: string
  ): Promise<File> {
    if (file.originalFile) {
      return file.originalFile;
    }

    if (file.content instanceof ArrayBuffer) {
      return new File([file.content], file.name, { type: fallbackMime });
    }

    if (typeof file.content === 'string') {
      return new File([file.content], file.name, { type: fallbackMime });
    }

    throw new ParseError('Missing original file content', file.fileType, {
      fileId: file.id,
      fileName: file.name
    });
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
        await duckDBOrchestrator.registerExistingTable(
          dataset.tableName,
          dataset.sourceFileId || file.id,
          file.name,
          {
            geoDetection: dataset.geoDetection
          }
        );
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

    try {
      const concurrency = this.determineProjectConcurrency();

      await this.processWithLimit(
        unprocessedFiles,
        concurrency,
        async (file, index, total) => {
          const progress = `${index + 1}/${total}`;

          try {
            await this.onFileAdded(file);
          } catch (error) {
            logger.error(
              'Project file processing failed',
              LogCategory.PROJECT,
              {
                progress,
                fileName: file.name,
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            );
            logger.error(
              'Detailed project processing error',
              LogCategory.PROJECT,
              formatError(error)
            );
          } finally {
            this.processingFiles.delete(file.id);
          }
        }
      );

      layersActions.syncWithVisualizations();

      // No cache persistence – DuckDB remains the canonical storage during the session.
    } catch (error) {
      // Cleanup on error - remove all unprocessed files from processing
      unprocessedFiles.forEach((f) => this.processingFiles.delete(f.id));
      logger.error('Project files processing failed', LogCategory.PROJECT, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private determineProjectConcurrency(): number {
    if (typeof navigator === 'undefined' || !navigator.hardwareConcurrency) {
      return 1;
    }
    const cores = navigator.hardwareConcurrency;
    if (cores <= 2) return 1;
    if (cores <= 4) return 2;
    return 3;
  }

  private createDefaultVisualization(datasetId: string): void {
    const dataset = datasetsStore.datasets.find((d) => d.id === datasetId);
    if (!dataset) return;

    const numericColumns = dataset.columns.filter(
      (c) => c.type === ColumnType.NUMBER
    );
    const stringColumns = dataset.columns.filter(
      (c) => c.type === ColumnType.TEXT
    );

    let visualizationType;
    if (dataset.geometry && numericColumns.length > 0) {
      visualizationType = VisualizationType.CHOROPLETH;
    } else if (dataset.geometry && stringColumns.length > 0) {
      visualizationType = VisualizationType.CATEGORICAL;
    } else if (numericColumns.length > 0) {
      visualizationType = VisualizationType.PROPORTIONAL;
    } else {
      return;
    }

    visualizationStore.createVisualization(visualizationType, datasetId);
  }

  async exportData(format: 'csv' | 'geojson' | 'json'): Promise<Blob> {
    const { exportProjectData } = await import('../utils/file-export.utils');
    const currentProject = projectStore.currentProject;

    if (!currentProject?.data?.sourceFiles) {
      throw new DataValidationError('Aucune donnée à exporter');
    }

    return exportProjectData(currentProject.data.sourceFiles, format);
  }

  getVisualizationData(visualizationId: string): {
    visualization: VisualizationConfig;
    dataset: DatasetResult;
  } | null {
    const visualization = visualizationStore.visualizations.find(
      (v) => v.id === visualizationId
    );
    if (!visualization) return null;

    const dataset = datasetsStore.datasets.find(
      (d) => d.id === visualization.datasetId
    );
    if (!dataset) return null;

    return {
      visualization,
      dataset
    };
  }
}

export const dataOrchestrator = new DataOrchestratorService();
