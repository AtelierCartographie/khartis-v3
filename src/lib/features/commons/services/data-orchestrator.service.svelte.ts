import { projectStore } from '../store/project.store.svelte';
import { datasetsStore } from '../store/datasets.store.svelte';
import {
  visualizationStore,
  VisualizationType,
  type VisualizationConfig
} from '../store/visualization.store.svelte';
import { layersActions } from '../../step-toolbar/tools/layers/layers.store.svelte';
import { projectionActions } from '../../step-toolbar/tools/projections/projection.store.svelte';
import type { UploadedFile } from '../store/create-project.types';
import { FileType } from '../store/create-project.types';
import { showError, showWarning } from '../utils/notification.utils.svelte';
import { duckDBOrchestrator } from '$lib/features/commons/services/duckdb-orchestrator.service.svelte';
import { logger, LogCategory } from '../utils/logger';
import {
  getParsedDataLength,
  isGeoJSONFeatureCollection,
  type GeoJSONFeatureCollection
} from '$lib/types/data';
import type { GeoJSONFeatureCollection as ParserGeoJSONFeatureCollection } from '$lib/features/data/infrastructure/parsers/geojson.parser';
import {
  DataValidationError,
  isFatalError,
  formatError,
  ParseError
} from '../errors/pipeline.errors';
import { ColumnType } from '$lib/features/data/domain';
import { convertKMLFileToGeoJSON } from '$lib/features/data/infrastructure/parsers/kml.parser';
import { importRollbackService } from './import-rollback.service';
import type { DatasetResult } from '$lib/features/data';

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
    logger.info('Processing file', LogCategory.DATA, {
      name: file.name,
      id: file.id,
      status: file.status,
      fileType: file.fileType,
      hasParsedData: !!file.parsedData,
      parsedDataLength: getParsedDataLength(file.parsedData)
    });

    // Create snapshot BEFORE any changes for potential rollback
    const snapshot = importRollbackService.createSnapshot(file);

    try {
      await datasetsStore.addFile(file);
      logger.info('File processed via datasetsStore', LogCategory.DATA);

      const dataset = datasetsStore.getDatasetBySourceFile(file.id);
      if (!dataset) {
        logger.warn('Dataset not found after processing', LogCategory.DATA, {
          fileId: file.id
        });
        return;
      }
      logger.info('Dataset retrieved after data pipeline', LogCategory.DATA, {
        datasetId: dataset.id,
        datasetName: dataset.name,
        sourceFileId: dataset.sourceFileId,
        tableName: dataset.tableName,
        hasGeometryFlag: !!dataset.geometry,
        columnCount: dataset.columns.length
      });

      await this.processFileInDuckDB(file, dataset);

      // Mark file as processed to prevent reprocessing
      this.processedFileIds.add(file.id);
      logger.debug('File marked as processed', LogCategory.DATA, {
        fileId: file.id,
        totalProcessedFiles: this.processedFileIds.size
      });

      if (dataset.geometry) {
        this._geometryDatasetsVersion++;
        projectionActions.suggestProjectionForCurrentData();
      }

      const existingVisualizations =
        visualizationStore.getVisualizationsByDataset(dataset.id);
      if (existingVisualizations.length === 0) {
        this.createDefaultVisualization(dataset.id);
        logger.info('Default visualization created', LogCategory.DATA, {
          datasetId: dataset.id
        });
      } else {
        logger.info(
          'Visualization already exists for dataset',
          LogCategory.DATA,
          { datasetId: dataset.id }
        );
      }

      layersActions.syncWithVisualizations();
    } catch (error) {
      // Log the error with full context
      logger.error('File import failed', LogCategory.DATA, formatError(error));

      // Check if error is fatal (requires rollback) or non-fatal (just show toast)
      if (isFatalError(error)) {
        logger.warn(
          'Fatal error detected, initiating rollback',
          LogCategory.DATA,
          {
            fileId: file.id,
            fileName: file.name
          }
        );

        // Rollback all changes
        await importRollbackService.rollback(snapshot);

        // Show error notification for fatal errors
        showError(
          "Erreur fatale lors de l'import",
          error instanceof Error ? error.message : 'Erreur inconnue'
        );
      } else {
        // Non-fatal error: just show warning toast, keep changes
        logger.info(
          'Non-fatal error, keeping partial import',
          LogCategory.DATA,
          {
            fileId: file.id,
            fileName: file.name
          }
        );

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
    logger.info('Removing file from project', LogCategory.DATA, { fileId });

    const dataset = datasetsStore.getDatasetBySourceFile(fileId);
    logger.debug('Dataset lookup result', LogCategory.DATA, {
      found: !!dataset,
      datasetId: dataset?.id,
      datasetName: dataset?.name
    });

    if (dataset) {
      const visualizations = visualizationStore.getVisualizationsByDataset(
        dataset.id
      );
      logger.info('Removing visualizations', LogCategory.DATA, {
        count: visualizations.length,
        datasetId: dataset.id
      });
      visualizations.forEach((viz) => {
        visualizationStore.removeVisualization(viz.id);
      });

      const duckDataset = duckDBOrchestrator
        .getAllDatasets()
        .find((d) => d.sourceFileId === fileId);
      if (duckDataset) {
        logger.info('Dropping DuckDB table', LogCategory.DUCKDB, {
          tableName: duckDataset.tableName
        });
        await duckDBOrchestrator.dropTable(duckDataset.tableName);

        // Cleanup DuckDB cache and file handles to prevent memory leaks
        await this.cleanupDuckDBResources(duckDataset.tableName);

        logger.success('DuckDB table dropped', LogCategory.DUCKDB, {
          tableName: duckDataset.tableName
        });
        this._geometryDatasetsVersion++;
      }

      logger.debug('Removing dataset from store', LogCategory.DATA, {
        datasetId: dataset.id
      });
      datasetsStore.removeDataset(dataset.id);
      layersActions.syncWithVisualizations();
      logger.success('File removal complete', LogCategory.DATA, { fileId });
    } else {
      logger.warn('No dataset found for fileId', LogCategory.DATA, { fileId });
    }

    // Remove from processed files set
    this.processedFileIds.delete(fileId);
    logger.debug('File removed from tracking', LogCategory.DATA, {
      fileId,
      remainingProcessedFiles: this.processedFileIds.size
    });

    // Clean up orphaned datasets (datasets whose sourceFileId no longer exists in project)
    this.cleanupOrphanedDatasets();
  }

  /**
   * Cleanup DuckDB resources to prevent memory leaks
   * Removes file handles, cache entries, and metadata
   */
  private async cleanupDuckDBResources(tableName: string): Promise<void> {
    try {
      const { Duck } = await import('./duckdb/duckdb');

      if (!Duck) {
        logger.warn(
          'DuckDB not initialized, skipping cleanup',
          LogCategory.DUCKDB
        );
        return;
      }

      // Remove from loaded files tracking
      if (Duck.loaded_files.has(tableName)) {
        Duck.loaded_files.delete(tableName);
        logger.debug('Removed from loaded_files', LogCategory.DUCKDB, {
          tableName
        });
      }

      // Remove from registered files (find by table name)
      const registeredFile = Array.from(Duck.registered_files).find((id) =>
        id.includes(tableName)
      );
      if (registeredFile) {
        Duck.registered_files.delete(registeredFile);
        logger.debug('Removed from registered_files', LogCategory.DUCKDB, {
          tableName,
          fileId: registeredFile
        });
      }

      // Remove from table metadata
      if (Duck.table_metadata.has(tableName)) {
        Duck.table_metadata.delete(tableName);
        logger.debug('Removed from table_metadata', LogCategory.DUCKDB, {
          tableName
        });
      }

      // Remove from cache (will be handled by LRU but we can force it)
      if (Duck.table_geoparquet_cache.has(tableName)) {
        const buffer = Duck.table_geoparquet_cache.get(tableName);
        Duck.table_geoparquet_cache.delete(tableName);

        logger.debug('Removed from cache', LogCategory.DUCKDB, {
          tableName,
          size: buffer
            ? `${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`
            : 'unknown'
        });
      }

      logger.success('DuckDB resources cleaned up', LogCategory.DUCKDB, {
        tableName
      });
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
      logger.info('Cleaning up orphaned datasets', LogCategory.DATA, {
        totalDatasets: allDatasets.length,
        validSourceFileIds: Array.from(validSourceFileIds),
        orphanedCount: orphanedDatasets.length,
        orphanedIds: orphanedDatasets.map((d) => ({
          datasetId: d.id,
          sourceFileId: d.sourceFileId,
          name: d.name
        }))
      });

      orphanedDatasets.forEach((dataset) => {
        logger.debug('Removing orphaned dataset', LogCategory.DATA, {
          datasetId: dataset.id,
          sourceFileId: dataset.sourceFileId,
          name: dataset.name
        });
        datasetsStore.removeDataset(dataset.id);
      });

      logger.success('Orphaned datasets cleaned', LogCategory.DATA, {
        count: orphanedDatasets.length
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

    logger.debug('Evaluating DuckDB preparation need', LogCategory.DUCKDB, {
      fileId: file.id,
      fileName: file.name,
      fileType: file.fileType,
      datasetId: dataset?.id,
      datasetGeometryDetected: !!dataset?.geometry,
      requiresGeoProcessing
    });

    if (!requiresGeoProcessing) {
      logger.debug(
        'Skipping DuckDB geo processing for file',
        LogCategory.DUCKDB,
        {
          fileId: file.id,
          reason: 'no_geometry_detected'
        }
      );
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

    const geojsonString = JSON.stringify(geojsonObject);

    const hasFeatures = (
      value: unknown
    ): value is { features: { length: number }[] } => {
      return (
        typeof value === 'object' &&
        value !== null &&
        Array.isArray((value as { features?: unknown }).features)
      );
    };

    const geojsonName = file.name.endsWith('.shp')
      ? file.name.replace(/\.shp$/i, '.geojson')
      : `${file.name}.geojson`;

    logger.info('Converted shapefile to GeoJSON for DuckDB', LogCategory.DATA, {
      originalName: file.name,
      normalizedName: geojsonName,
      originalSize: file.size,
      featureCount: hasFeatures(geojsonObject)
        ? geojsonObject.features.length
        : undefined
    });

    return {
      ...file,
      name: geojsonName,
      type: 'application/geo+json',
      fileType: FileType.GEOJSON,
      content: geojsonString,
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

      const geojsonString = JSON.stringify(geojsonObject);
      const normalizedName = file.name.replace(/\.(kml|kmz)$/i, '.geojson');
      const parsedGeoJSON =
        geojsonObject as unknown as GeoJSONFeatureCollection;

      return {
        ...file,
        name: normalizedName,
        type: 'application/geo+json',
        fileType: FileType.GEOJSON,
        content: geojsonString,
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
      logger.warn(
        'Cannot process file in DuckDB - dataset missing',
        LogCategory.DUCKDB,
        {
          fileId: file.id,
          fileName: file.name
        }
      );
      return;
    }

    const duckDBFile = await this.prepareFileForDuckDB(file, dataset);

    if (duckDBFile) {
      logger.info(
        'Running DuckDB Geo pipeline for uploaded file',
        LogCategory.DUCKDB,
        {
          originalFileName: file.name,
          normalizedFileName: duckDBFile.name,
          fileType: file.fileType,
          normalizedType: duckDBFile.fileType,
          hasParsedData: !!duckDBFile.parsedData,
          geometryDetected: !!dataset.geometry,
          datasetId: dataset.id,
          datasetTableName: dataset.tableName
        }
      );
      try {
        await duckDBOrchestrator.processFile(duckDBFile);
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
      logger.debug('Registering table from dataPipeline', LogCategory.DUCKDB, {
        tableName: dataset.tableName,
        sourceFileId: dataset.sourceFileId,
        fileId: file.id,
        fileName: file.name,
        datasetId: dataset.id,
        currentDuckDBDatasets: duckDBOrchestrator.getAllDatasets().length
      });

      try {
        const duckDataset = await duckDBOrchestrator.registerExistingTable(
          dataset.tableName,
          dataset.sourceFileId || file.id,
          file.name,
          {
            geoDetection: dataset.geoDetection
          }
        );
        logger.success('Table registered successfully', LogCategory.DUCKDB, {
          tableName: dataset.tableName,
          duckDatasetId: duckDataset?.id,
          totalDuckDBDatasets: duckDBOrchestrator.getAllDatasets().length
        });
      } catch (registerError) {
        logger.error('Failed to register table', LogCategory.DUCKDB, {
          error:
            registerError instanceof Error
              ? registerError.message
              : 'Unknown error',
          tableName: dataset.tableName
        });
      }
    } else {
      logger.warn('No tableName in dataset to register', LogCategory.DUCKDB, {
        datasetId: dataset.id,
        datasetName: dataset.name
      });
    }
  }

  async onProjectChanged(): Promise<void> {
    const endTiming = logger.startTiming(
      'Project changed',
      LogCategory.PROJECT
    );

    logger.info('Project change initiated', LogCategory.PROJECT);

    visualizationStore.clear();
    datasetsStore.clear();
    layersActions.reset();
    projectionActions.reset();

    // Clear processed file IDs when switching projects
    this.processedFileIds.clear();
    logger.debug('Cleared processed file tracking', LogCategory.PROJECT);

    const currentProject = projectStore.currentProject;
    if (currentProject?.data?.sourceFiles) {
      logger.info('Processing project files', LogCategory.PROJECT, {
        fileCount: currentProject.data.sourceFiles.length
      });
      await this.processProjectFiles(currentProject.data.sourceFiles);
    }

    endTiming();
    logger.success('Project change complete', LogCategory.PROJECT);
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
    const endTiming = logger.startTiming(
      'Process project files',
      LogCategory.PROJECT
    );

    logger.info('Processing project files', LogCategory.PROJECT, {
      fileCount: files.length,
      processedFileIds: Array.from(this.processedFileIds),
      processingFiles: Array.from(this.processingFiles)
    });

    // Filter out files that are already processed OR currently being processed
    const unprocessedFiles = files.filter(
      (f) => !this.processedFileIds.has(f.id) && !this.processingFiles.has(f.id)
    );

    if (unprocessedFiles.length === 0) {
      logger.info('All files already processed, skipping', LogCategory.PROJECT);
      return;
    }

    // Mark files as processing BEFORE starting to prevent race conditions
    unprocessedFiles.forEach((f) => this.processingFiles.add(f.id));
    logger.info('Marked files as processing', LogCategory.PROJECT, {
      count: unprocessedFiles.length,
      fileNames: unprocessedFiles.map((f) => f.name),
      processingFiles: Array.from(this.processingFiles)
    });

    try {
      // Yield to event loop to avoid blocking UI
      await new Promise((resolve) => setTimeout(resolve, 0));

      logger.info('Processing via datasetsStore', LogCategory.DATA);
      const datasetsStart = performance.now();
      await datasetsStore.processFiles(unprocessedFiles);
      const datasetsDuration = performance.now() - datasetsStart;

      logger.success('DatasetsStore processing complete', LogCategory.DATA, {
        duration: `${datasetsDuration.toFixed(2)}ms`
      });

      // Process DuckDB files with limited concurrency (max 3 concurrent)
      logger.info('Starting DuckDB processing', LogCategory.DUCKDB);
      const duckStart = performance.now();
      const validFiles = unprocessedFiles.filter(
        (file) => file.status === 'complete' && file.parsedData
      );
      logger.info('Files ready for DuckDB', LogCategory.DUCKDB, {
        count: validFiles.length,
        maxConcurrent: 3
      });

      // Process with limited concurrency to prevent memory/CPU saturation
      await this.processWithLimit(
        validFiles,
        3, // Max 3 concurrent files
        async (file, index, total) => {
          const fileStart = performance.now();
          logger.info('Processing file in DuckDB', LogCategory.DUCKDB, {
            progress: `${index + 1}/${total}`,
            fileName: file.name
          });

          // Create snapshot for potential rollback
          const snapshot = importRollbackService.createSnapshot(file);

          // Yield to event loop between each file
          await new Promise((resolve) => setTimeout(resolve, 0));

          try {
            const processStart = performance.now();
            await this.processFileInDuckDB(file);
            const processDuration = performance.now() - processStart;

            logger.success('File processed in DuckDB', LogCategory.DUCKDB, {
              progress: `${index + 1}/${total}`,
              fileName: file.name,
              duration: `${processDuration.toFixed(2)}ms`
            });

            if (processDuration > 3000) {
              logger.warn('Slow DuckDB file processing', LogCategory.DUCKDB, {
                fileName: file.name,
                duration: `${processDuration.toFixed(2)}ms`
              });
            }

            // Mark file as processed AND remove from processing
            this.processedFileIds.add(file.id);
            this.processingFiles.delete(file.id);
          } catch (error) {
            const errorDuration = performance.now() - fileStart;
            logger.error(
              'File processing failed in DuckDB',
              LogCategory.DUCKDB,
              {
                progress: `${index + 1}/${total}`,
                fileName: file.name,
                duration: `${errorDuration.toFixed(2)}ms`,
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            );

            // Log error with context
            logger.error(
              'File processing failed during project load',
              LogCategory.DUCKDB,
              formatError(error)
            );

            // Remove from processing on error
            this.processingFiles.delete(file.id);

            // Check if error is fatal
            if (isFatalError(error)) {
              logger.warn(
                'Fatal error during project file load, initiating rollback',
                LogCategory.DATA,
                {
                  fileId: file.id,
                  fileName: file.name
                }
              );

              // Rollback this specific file
              await importRollbackService.rollback(snapshot);

              // Show error notification
              showError(
                `Erreur lors du chargement de ${file.name}`,
                error instanceof Error ? error.message : 'Erreur inconnue'
              );
            } else {
              // Non-fatal: log warning but continue
              logger.info(
                'Non-fatal error during project file load, continuing',
                LogCategory.DATA,
                {
                  fileId: file.id,
                  fileName: file.name
                }
              );

              showWarning(
                `Avertissement pour ${file.name}`,
                error instanceof Error
                  ? error.message
                  : 'Le fichier a été chargé avec des avertissements'
              );
            }

            // Note: We don't re-throw here to allow other files to continue processing
            logger.warn(
              'Failed to reload file in DuckDB',
              LogCategory.DUCKDB,
              error
            );
          }
        }
      );

      const duckDuration = performance.now() - duckStart;
      logger.success('DuckDB processing complete', LogCategory.DUCKDB, {
        duration: `${duckDuration.toFixed(2)}ms`,
        fileCount: validFiles.length
      });

      if (duckDuration > 10000) {
        logger.warn('Slow DuckDB batch processing', LogCategory.DUCKDB, {
          duration: `${duckDuration.toFixed(2)}ms`,
          fileCount: validFiles.length,
          recommendation: 'Consider processing fewer files concurrently'
        });
      }

      const geoDatasets = datasetsStore.getDatasetsByType(true);

      if (geoDatasets.length > 0) {
        logger.info('Creating default visualization', LogCategory.DATA, {
          geoDatasetCount: geoDatasets.length
        });
        this._geometryDatasetsVersion++;
        projectionActions.suggestProjectionForCurrentData();

        this.createDefaultVisualization(geoDatasets[0].id);
      }

      layersActions.syncWithVisualizations();

      endTiming();
      logger.success('Project files processing complete', LogCategory.PROJECT, {
        remainingProcessingFiles: Array.from(this.processingFiles)
      });
    } catch (error) {
      // Cleanup on error - remove all unprocessed files from processing
      unprocessedFiles.forEach((f) => this.processingFiles.delete(f.id));
      logger.error('Project files processing failed', LogCategory.PROJECT, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
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
