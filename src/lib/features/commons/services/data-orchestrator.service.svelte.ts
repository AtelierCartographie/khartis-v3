import type { DatasetResult } from '$lib/features/data-pipeline';
import { createFileFromUpload } from '$lib/features/data-pipeline';
import { duckDBOrchestrator, RefineOperation } from '$lib/features/duckdb';
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
import {
  FileType,
  COLUMN_TRANSFORMATION_TYPES
} from '../store/create-project.types';
import { datasetsStore } from '../store/datasets.store.svelte';
import { projectStore } from '../store/project.store.svelte';
import { visualizationStore } from '../store/visualization.store.svelte';
import { LogCategory, logger } from '../utils/logger';
import { showError, showWarning } from '../utils/notification.utils.svelte';
import { importRollbackService } from './import-rollback.service';

function createDataOrchestratorService() {
  let geometryDatasetsVersion = $state(0);
  const processedFileIds = new Set<string>();
  const processingFiles = new Set<string>();

  async function cleanupDuckDBResources(tableName: string): Promise<void> {
    try {
      const { Duck } = await import('$lib/features/duckdb');
      Duck?.cleanupTableResources(tableName);
    } catch (error) {
      logger.warn(
        'Failed to cleanup DuckDB resources',
        LogCategory.DUCKDB,
        error
      );
    }
  }

  function cleanupOrphanedDatasets(): void {
    const currentProject = projectStore.currentProject;
    if (!currentProject?.data?.sourceFiles) return;

    const validSourceFileIds = new Set(
      currentProject.data.sourceFiles.map((f) => f.id)
    );
    const allDatasets = datasetsStore.getAllDatasets();
    const orphanedDatasets = allDatasets.filter(
      (dataset) => !validSourceFileIds.has(dataset.sourceFileId)
    );

    if (orphanedDatasets.length > 0) {
      orphanedDatasets.forEach((dataset) => {
        datasetsStore.removeDataset(dataset.id);
      });
    }
  }

  async function convertKMLForDuckDB(
    file: UploadedFile
  ): Promise<UploadedFile> {
    try {
      let geojsonObject: GeoJSONFeatureCollection;

      if (file.parsedData && isGeoJSONFeatureCollection(file.parsedData)) {
        geojsonObject = file.parsedData as GeoJSONFeatureCollection;
      } else {
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

  async function prepareFileForDuckDB(
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

    if (!requiresGeoProcessing) return null;
    if (dataset?.metadata?.geoDuckTableReady && dataset.tableName) return null;
    if (dataset?.tableName) return null;

    if (file.fileType === FileType.KML || file.fileType === FileType.KMZ) {
      return convertKMLForDuckDB(file);
    }

    return file;
  }

  async function recreateTableFromParsedData(
    file: UploadedFile,
    tableName: string,
    dataset: DatasetResult
  ): Promise<void> {
    try {
      const { Duck } = await import('$lib/features/duckdb');
      if (!Duck) {
        throw new Error('DuckDB not initialized');
      }

      logger.info(
        'Recreating DuckDB table from parsed data',
        LogCategory.DUCKDB,
        {
          fileId: file.id,
          fileName: file.name,
          tableName,
          rowCount: (file.parsedData as unknown[]).length
        }
      );

      const jsonData = JSON.stringify(file.parsedData);
      const jsonBlob = new Blob([jsonData], { type: 'application/json' });
      const jsonFile = new File([jsonBlob], `${tableName}.json`, {
        type: 'application/json'
      });

      await Duck.register_files([jsonFile]);

      const escapedTableName = tableName.replace(/"/g, '""');
      await Duck.query(
        `CREATE TABLE "${escapedTableName}" AS SELECT * FROM read_json_auto('${tableName}.json')`
      );

      await duckDBOrchestrator.registerExistingTable(
        tableName,
        dataset.sourceFileId || file.id,
        file.name,
        {
          geoDetection: dataset.geoDetection
        }
      );

      logger.success(
        'DuckDB table recreated from parsed data',
        LogCategory.DUCKDB,
        {
          tableName,
          rowCount: (file.parsedData as unknown[]).length
        }
      );
    } catch (error) {
      logger.error(
        'Failed to recreate table from parsed data',
        LogCategory.DUCKDB,
        error
      );
      throw error;
    }
  }

  async function processFileInDuckDB(
    file: UploadedFile,
    datasetOverride?: DatasetResult
  ): Promise<void> {
    const dataset =
      datasetOverride ?? datasetsStore.getDatasetBySourceFile(file.id);

    if (!dataset) {
      return;
    }

    const duckDBFile = await prepareFileForDuckDB(file, dataset);

    if (duckDBFile) {
      try {
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

          geometryDatasetsVersion++;
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

          const fileForDuckDB = await prepareFileForDuckDB(file, dataset);
          if (fileForDuckDB) {
            const duckResult =
              await duckDBOrchestrator.processFile(fileForDuckDB);
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

              geometryDatasetsVersion++;
            }
          } else if (file.parsedData && Array.isArray(file.parsedData)) {
            await recreateTableFromParsedData(file, dataset.tableName, dataset);
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

  async function onFileAdded(
    file: UploadedFile,
    autoEnable = true
  ): Promise<void> {
    const snapshot = importRollbackService.createSnapshot(file);

    try {
      const dataset = await datasetsStore.addFile(file, autoEnable);

      if (!dataset) {
        logger.error('Dataset not found after processing', LogCategory.DATA, {
          fileId: file.id
        });
        return;
      }

      await processFileInDuckDB(file, dataset);
      processedFileIds.add(file.id);

      if (dataset.geometry) {
        projectionActions.suggestProjectionForCurrentData();
      }

      layersActions.syncWithVisualizations();
    } catch (error) {
      logger.error('File import failed', LogCategory.DATA, formatError(error));

      if (isFatalError(error)) {
        await importRollbackService.rollback(snapshot);

        showError(
          "Erreur fatale lors de l'import",
          error instanceof Error ? error.message : 'Erreur inconnue'
        );
      } else {
        showWarning(
          'Avertissement',
          error instanceof Error
            ? error.message
            : "Avertissement lors de l'import"
        );
      }

      if (isFatalError(error)) {
        throw error;
      }
    }
  }

  async function onFileRemoved(fileId: string): Promise<void> {
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
        await cleanupDuckDBResources(duckDataset.tableName);
        geometryDatasetsVersion++;
      }

      datasetsStore.removeDataset(dataset.id);
      layersActions.syncWithVisualizations();
    }

    processedFileIds.delete(fileId);
    cleanupOrphanedDatasets();
  }

  async function processWithLimit<T>(
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

  async function applyColumnTransformations(file: UploadedFile): Promise<void> {
    const dataset = datasetsStore.getDatasetBySourceFile(file.id);

    if (!dataset?.tableName || !file.columnTransformations) {
      return;
    }

    logger.debug(
      `[DataOrchestrator] Applying ${file.columnTransformations.length} column transformations for ${file.name}`,
      LogCategory.DATA
    );

    const columnRenames = new Map<string, string>();

    function resolveColumnName(originalName: string): string {
      return columnRenames.get(originalName) ?? originalName;
    }

    const batch = { skipAnalysis: true };

    for (const transformation of file.columnTransformations) {
      try {
        const currentColumnName = resolveColumnName(transformation.column);

        switch (transformation.type) {
          case COLUMN_TRANSFORMATION_TYPES.RENAME:
            if (transformation.newValue) {
              await duckDBOrchestrator.renameColumn(
                dataset.tableName,
                currentColumnName,
                transformation.newValue,
                batch
              );
              datasetsStore.renameDatasetColumn(
                dataset.id,
                currentColumnName,
                transformation.newValue
              );
              columnRenames.set(transformation.column, transformation.newValue);
            }
            break;

          case COLUMN_TRANSFORMATION_TYPES.DROP:
            await duckDBOrchestrator.dropColumn(
              dataset.tableName,
              currentColumnName,
              batch
            );
            break;

          case COLUMN_TRANSFORMATION_TYPES.TYPE_CHANGE:
            if (transformation.newValue) {
              await duckDBOrchestrator.changeColumnType(
                dataset.tableName,
                currentColumnName,
                transformation.newValue,
                batch
              );
            }
            break;

          case COLUMN_TRANSFORMATION_TYPES.REFINE:
            if (transformation.newValue) {
              const operationMap: Record<string, RefineOperation> = {
                uppercase: RefineOperation.UPPERCASE,
                lowercase: RefineOperation.LOWERCASE,
                titlecase: RefineOperation.TITLECASE,
                trim: RefineOperation.TRIM,
                trim_all: RefineOperation.TRIM_ALL
              };
              const refineOp = operationMap[transformation.newValue];
              if (refineOp) {
                await duckDBOrchestrator.refineColumn(
                  dataset.tableName,
                  currentColumnName,
                  refineOp,
                  batch
                );
              }
            }
            break;

          case COLUMN_TRANSFORMATION_TYPES.REPLACE:
            if (
              transformation.searchValue !== undefined &&
              transformation.searchValue !== null &&
              transformation.newValue !== undefined &&
              transformation.newValue !== null
            ) {
              await duckDBOrchestrator.replaceInColumn(
                dataset.tableName,
                currentColumnName,
                transformation.searchValue,
                transformation.newValue,
                batch
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

    await duckDBOrchestrator.invalidateAndReanalyse(dataset.tableName);
  }

  async function applyRowDeletions(file: UploadedFile): Promise<void> {
    const dataset = datasetsStore.getDatasetBySourceFile(file.id);

    if (!dataset?.tableName || !file.deletedRowIds) {
      return;
    }

    logger.debug(
      `[DataOrchestrator] Applying ${file.deletedRowIds.length} row deletions for ${file.name}`,
      LogCategory.DATA
    );

    try {
      await duckDBOrchestrator.dropRows(dataset.tableName, file.deletedRowIds);

      const { Duck } = await import('$lib/features/duckdb');
      const newRowCount = Duck
        ? await Duck.get_row_count(dataset.tableName)
        : 0;
      datasetsStore.updateDatasetRowCount(dataset.id, newRowCount);

      logger.debug(
        `[DataOrchestrator] Applied row deletions, new row count: ${newRowCount}`,
        LogCategory.DATA
      );
    } catch (err) {
      logger.warn(
        `Failed to apply row deletions for ${file.name}`,
        LogCategory.DATA,
        {
          error: err
        }
      );
    }
  }

  function determineProjectConcurrency(): number {
    return 1;
  }

  async function processProjectFiles(files: UploadedFile[]): Promise<void> {
    const unprocessedFiles = files.filter(
      (file) => !processedFileIds.has(file.id) && !processingFiles.has(file.id)
    );

    if (unprocessedFiles.length === 0) {
      return;
    }

    const { globalState } = await import('../store/global.svelte');
    const selectedSourceFileId =
      globalState.selectedDataButtonId ?? unprocessedFiles[0]?.id;

    if (selectedSourceFileId) {
      const idx = unprocessedFiles.findIndex(
        (file) => file.id === selectedSourceFileId
      );
      if (idx > 0) {
        const [selected] = unprocessedFiles.splice(idx, 1);
        unprocessedFiles.unshift(selected);
      }
    }

    unprocessedFiles.forEach((file) => processingFiles.add(file.id));
    duckDBOrchestrator.beginBatch();

    try {
      const concurrency = determineProjectConcurrency();

      await processWithLimit(
        unprocessedFiles,
        concurrency,
        async (file, index, total) => {
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
                    {
                      error: err
                    }
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

          const autoEnable = file.id === selectedSourceFileId;

          try {
            await onFileAdded(file, autoEnable);

            if (
              file.columnTransformations &&
              file.columnTransformations.length > 0
            ) {
              await applyColumnTransformations(file);
            }

            if (file.deletedRowIds && file.deletedRowIds.length > 0) {
              logger.info(
                `[DataOrchestrator] Found ${file.deletedRowIds.length} deleted rows to apply for ${file.name}`,
                LogCategory.DATA
              );
              await applyRowDeletions(file);
            }
          } catch (fileError) {
            logger.error(
              `Failed to process file during project restore: ${file.name}`,
              LogCategory.DATA,
              fileError
            );
          }
        }
      );
    } catch (error) {
      logger.error('Failed to process project files', LogCategory.DATA, error);
    } finally {
      unprocessedFiles.forEach((file) => processingFiles.delete(file.id));
      duckDBOrchestrator.endBatch();
    }
  }

  async function initialize(): Promise<void> {
    await projectStore.waitForInit();
    const currentProject = projectStore.currentProject;
    if (currentProject?.data?.sourceFiles) {
      await processProjectFiles(currentProject.data.sourceFiles);
    }
  }

  async function onProjectChanged(): Promise<void> {
    await duckDBOrchestrator.waitForInitialization();

    visualizationStore.clear();
    datasetsStore.clear();
    layersActions.reset();
    projectionActions.reset();

    processedFileIds.clear();

    const currentProject = projectStore.currentProject;
    if (currentProject?.data?.sourceFiles) {
      await processProjectFiles(currentProject.data.sourceFiles);
    }

    const { globalActions } = await import('../store/global.svelte');
    globalActions.ensureTabSelected();
  }

  return {
    get geometryDatasetsVersion() {
      return geometryDatasetsVersion;
    },
    initialize,
    onFileAdded,
    onFileRemoved,
    onProjectChanged
  };
}

export const dataOrchestratorService = createDataOrchestratorService();
