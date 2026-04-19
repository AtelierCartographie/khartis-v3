import type { DatasetResult } from '$lib/features/data-pipeline';
import {
  createFileFromUpload,
  dataPipeline,
  isZipDatasetResult
} from '$lib/features/data-pipeline';
import { Duck, RefineOperation } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import {
  isGeoJSONFeatureCollection,
  type GeoJSONFeatureCollection
} from '$lib/types/data';
import { cleanupDuckDBResources } from '$lib/features/commons/utils/duckdb-cleanup.utils';
import { toJsonValue } from '$lib/features/commons/utils/json.utils';
import type { SerializedProjectData } from '$lib/types/serialization.types';
import { persistenceRegistry } from '$lib/features/project-management';
import { createCompanionFilesFromAssetRefs } from '$lib/features/project-management/core/asset-store';
import { layersActions } from '../../step-toolbar/tools/layers/layers.store.svelte';
import { legendActions } from '../../step-toolbar/tools/legend/legend.store.svelte';
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
import { dataTabActions } from '../store/data-tab.store.svelte';
import { datasetsStore } from '../store/datasets.store.svelte';
import { globalActions, globalState } from '../store/global.svelte';
import { projectStore } from '../store/project.store.svelte';
import {
  ClassificationMethod,
  visualizationStore,
  type VisualizationConfig
} from '../store/visualization.store.svelte';
import { LogCategory, logger } from '../utils/logger';
import {
  notificationManager,
  showError,
  showWarning
} from '../utils/notification.utils.svelte';
import { sanitizePreparedGeoJSON } from '../utils/persisted-geojson.utils';
import { resolvePersistedJoinState } from '../utils/persisted-join-state.utils';
import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
import { importRollbackService } from './import-rollback.service';
import {
  applyPaletteInversion,
  calculateBreaks,
  computeDivergingSplit,
  generateColorsForBreaks
} from './classification.service';
import { FillMode } from '../../main-toolbar/constants';
import { getColorBlindnessState } from '../../step-toolbar/tools/color-blindness/color-blindness.store.svelte';
import {
  findPaletteById,
  generatePaletteColors,
  PALETTE_TYPE
} from '$lib/features/commons/components/palette-popover/palette.constants';
import {
  normalizeClassificationMethod,
  resolveComputedClassCount,
  resolveRequestedClassCount
} from '../../main-toolbar/visualization-tab/components/discretization.utils';
import * as m from '$lib/paraglide/messages';

function createDataOrchestratorService() {
  let geometryDatasetsVersion = $state(0);
  const processedFileIds = new Set<string>();
  const processingFiles = new Set<string>();

  function toParsedTabularData(
    rows: DatasetResult['data']
  ): UploadedFile['parsedData'] | undefined {
    if (!rows) {
      return undefined;
    }

    return rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, toJsonValue(value)])
      )
    );
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

  function createGeoJsonSnapshotForDuckDB(file: UploadedFile): UploadedFile {
    const normalizedName = file.name.replace(/\.[^.]+$/u, '.geojson');
    const preparedGeoJSON = sanitizePreparedGeoJSON(file.preparedGeoJSON);

    return {
      ...file,
      name: normalizedName,
      type: 'application/geo+json',
      fileType: FileType.GEOJSON,
      content: preparedGeoJSON,
      originalFile: undefined
    };
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
      file.fileType === FileType.KMZ ||
      file.fileType === FileType.GPX;

    if (!requiresGeoProcessing) return null;
    if (dataset?.metadata?.geoDuckTableReady && dataset.tableName) return null;
    if (dataset?.tableName) return null;

    if (file.preparedGeoJSON) {
      return createGeoJsonSnapshotForDuckDB(file);
    }

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
          geoDetection: dataset.geoDetection,
          preferredDatasetId: dataset.id
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

  async function restoreJoinState(
    duckDatasetId: string,
    file: UploadedFile
  ): Promise<void> {
    const duckDataset = duckDBOrchestrator.getDataset(duckDatasetId);
    const restoredJoinState = resolvePersistedJoinState({
      file,
      duckDataset,
      selectedBasemapId: projectStore.currentProject?.data?.basemap?.id,
      linkedGeoColumn: file.geoColumn,
      selectedGpsColumns: file.gpsColumns,
      isSelectedSourceFile: true
    });

    if (!restoredJoinState.joinedBasemap && !restoredJoinState.gpsMode) {
      return;
    }

    duckDBOrchestrator.updateDatasetJoinInfo(duckDatasetId, restoredJoinState);

    if (
      !restoredJoinState.joinedBasemap ||
      !restoredJoinState.geoColumn ||
      restoredJoinState.gpsMode
    ) {
      return;
    }

    await basemapCatalogService.loadCatalog();
    const basemap = basemapCatalogService.getBasemapById(
      restoredJoinState.joinedBasemap
    );
    if (!basemap) {
      return;
    }

    try {
      await duckDBOrchestrator.finalizeJoin(
        duckDatasetId,
        basemap,
        restoredJoinState.geoColumn
      );
    } catch (joinError) {
      logger.warn('Failed to restore join on project load', LogCategory.DATA, {
        datasetId: duckDatasetId,
        joinedBasemap: restoredJoinState.joinedBasemap,
        error: joinError
      });
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

          datasetsStore.updateDataset(dataset.id, {
            metadata: {
              ...dataset.metadata,
              geoDuckTableReady: true
            }
          });

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
            geoDetection: dataset.geoDetection,
            preferredDatasetId: dataset.id
          }
        );

        if (registered !== null) {
          await restoreJoinState(registered.id, file);
        }

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

          // For geo files (GeoJSON, SHP, etc.), prepareFileForDuckDB returns null
          // when tableName/geoDuckTableReady are already set — bypass those guards
          // by passing a stripped dataset so re-processing is forced.
          const strippedDataset: DatasetResult = {
            ...dataset,
            tableName: undefined as unknown as string,
            metadata: { ...dataset.metadata, geoDuckTableReady: false }
          };
          const fileForDuckDB = await prepareFileForDuckDB(
            file,
            strippedDataset
          );
          let restoredDuckDatasetId: string | null = null;
          if (fileForDuckDB) {
            const duckResult =
              await duckDBOrchestrator.processFile(fileForDuckDB);
            if (duckResult && dataset) {
              restoredDuckDatasetId = duckResult.id;
              datasetsStore.updateDatasetTableName(
                dataset.id,
                duckResult.tableName
              );

              datasetsStore.updateDataset(dataset.id, {
                metadata: {
                  ...dataset.metadata,
                  geoDuckTableReady: true
                }
              });

              geometryDatasetsVersion++;
            }
          } else if (file.content || file.originalFile) {
            const restoredSourceFile =
              file.originalFile ?? (await createFileFromUpload(file));
            const processedResult = await dataPipeline.processUploadedFile(
              file,
              restoredSourceFile
            );
            const rebuiltDataset = isZipDatasetResult(processedResult)
              ? processedResult.datasets[0]
              : processedResult;
            const duckRestoreFile: UploadedFile = {
              ...file,
              originalFile: restoredSourceFile,
              parsedData: toParsedTabularData(rebuiltDataset.data)
            };

            const duckResult =
              await duckDBOrchestrator.processFile(duckRestoreFile);
            if (duckResult && dataset) {
              restoredDuckDatasetId = duckResult.id;
              datasetsStore.updateDatasetTableName(
                dataset.id,
                duckResult.tableName
              );
            }
          } else if (file.parsedData && Array.isArray(file.parsedData)) {
            await recreateTableFromParsedData(file, dataset.tableName, dataset);
            restoredDuckDatasetId =
              duckDBOrchestrator
                .getAllDatasets()
                .find((item) => item.sourceFileId === dataset.sourceFileId)
                ?.id ?? null;
          }

          if (restoredDuckDatasetId) {
            await restoreJoinState(restoredDuckDatasetId, file);
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
    autoEnable = true,
    options?: {
      suggestProjection?: boolean;
    }
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

      // Persist dataset ID on the file so viz.datasetId references survive restores.
      // On next restore the processor will reuse this stable ID.
      file.datasetId = dataset.id;

      await processFileInDuckDB(file, dataset);
      processedFileIds.add(file.id);

      if (
        options?.suggestProjection !== false &&
        (dataset.geometry || dataset.geoDetection)
      ) {
        projectionActions.suggestProjectionForCurrentData();
      }

      layersActions.syncWithVisualizations();
    } catch (error) {
      logger.error('File import failed', LogCategory.DATA, formatError(error));

      if (isFatalError(error)) {
        await importRollbackService.rollback(snapshot);

        showError(
          m.error_fatal_import_title(),
          error instanceof Error ? error.message : m.error_unknown_message()
        );
      } else {
        showWarning(
          m.warning_generic_title(),
          error instanceof Error ? error.message : m.warning_import_message()
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

      // Remove dataset from store BEFORE dropping DuckDB table.
      // dropTable() bumps datasetsVersion which triggers UI effects —
      // if the dataset still exists, AdvancedDataTable will try to query
      // the already-dropped table and crash.
      datasetsStore.removeDataset(dataset.id);
      layersActions.syncWithVisualizations();

      const duckDataset = duckDBOrchestrator
        .getAllDatasets()
        .find((d) => d.sourceFileId === fileId);
      if (duckDataset) {
        await duckDBOrchestrator.dropTable(duckDataset.tableName);
        await cleanupDuckDBResources(duckDataset.tableName);
        geometryDatasetsVersion++;
      }
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

          case COLUMN_TRANSFORMATION_TYPES.CALCULATE:
            if (transformation.newValue) {
              await duckDBOrchestrator.addCalculatedColumn(
                dataset.tableName,
                currentColumnName,
                transformation.newValue,
                batch
              );
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

    try {
      await duckDBOrchestrator.dropRows(dataset.tableName, file.deletedRowIds);

      const newRowCount = Duck
        ? await Duck.get_row_count(dataset.tableName)
        : 0;
      datasetsStore.updateDatasetRowCount(dataset.id, newRowCount);
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

  async function processProjectFiles(files: UploadedFile[]): Promise<void> {
    const unprocessedFiles = files.filter(
      (file) => !processedFileIds.has(file.id) && !processingFiles.has(file.id)
    );

    if (unprocessedFiles.length === 0) {
      return;
    }

    const storedId = globalState.selectedDataButtonId;
    const selectedSourceFileId =
      storedId && unprocessedFiles.some((f) => f.id === storedId)
        ? storedId
        : unprocessedFiles[0]?.id;

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

    const currentProject = projectStore.currentProject;
    const serializedData = currentProject?.data as
      | SerializedProjectData
      | undefined;
    const shouldSuggestProjection =
      !serializedData?.layoutSettings?.projection?.overrideActive;

    try {
      await processWithLimit(unprocessedFiles, 1, async (file) => {
        if (
          file.fileType === FileType.SHAPEFILE &&
          (!file.relatedFileObjects || file.relatedFileObjects.length === 0)
        ) {
          if (file.companionAssetRefs?.length) {
            try {
              file.relatedFileObjects = await createCompanionFilesFromAssetRefs(
                file.companionAssetRefs
              );
            } catch (err) {
              logger.warn(
                `Failed to restore companion assets for ${file.name}`,
                LogCategory.DATA,
                { error: err }
              );
            }
          }

          if (file.relatedFilesData) {
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
            }
          }
        }

        if (!file.originalFile && file.content) {
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

        const autoEnable = file.id === selectedSourceFileId;

        try {
          await onFileAdded(file, autoEnable, {
            suggestProjection: shouldSuggestProjection
          });

          if (
            file.columnTransformations &&
            file.columnTransformations.length > 0
          ) {
            await applyColumnTransformations(file);
          }

          if (file.deletedRowIds && file.deletedRowIds.length > 0) {
            await applyRowDeletions(file);
          }
        } catch (fileError) {
          logger.error(
            `Failed to process file during project restore: ${file.name}`,
            LogCategory.DATA,
            fileError
          );
          const errorMsg = fileError instanceof Error ? fileError.message : '';
          const subtitle =
            errorMsg.includes('Multiple layers') ||
            errorMsg.includes('more than one layer')
              ? m.pipeline_error_geofile_multiple_layers()
              : errorMsg || m.error_unknown_message();
          notificationManager.error({
            title: m.error_fatal_import_title(),
            subtitle,
            timeout: 0
          });
        }
      });
    } catch (error) {
      logger.error('Failed to process project files', LogCategory.DATA, error);
    } finally {
      unprocessedFiles.forEach((file) => processingFiles.delete(file.id));
      duckDBOrchestrator.endBatch();
    }
  }

  /**
   * Migrate orphaned viz.datasetId values from pre-stable-ID projects.
   * Old projects stored random UUIDs as dataset IDs — after the stable-ID fix
   * (dataset.id = file.id) those references no longer match.
   * Match orphaned vizs to unmatched datasets by positional order.
   */
  function migrateOrphanedVizDatasetIds(): void {
    const datasets = datasetsStore.datasets;
    if (datasets.length === 0) return;

    const knownDatasetIds = new Set(datasets.map((d) => d.id));
    const vizs = visualizationStore.visualizations;
    const orphanedVizs = vizs.filter((v) => !knownDatasetIds.has(v.datasetId));

    if (orphanedVizs.length === 0) return;

    const uniqueOldIds: string[] = [];
    const seen = new Set<string>();
    for (const v of orphanedVizs) {
      if (!seen.has(v.datasetId)) {
        uniqueOldIds.push(v.datasetId);
        seen.add(v.datasetId);
      }
    }

    const matchedIds = new Set(
      vizs
        .filter((v) => knownDatasetIds.has(v.datasetId))
        .map((v) => v.datasetId)
    );
    const unmatchedDatasets = datasets.filter((d) => !matchedIds.has(d.id));

    if (uniqueOldIds.length !== unmatchedDatasets.length) {
      logger.warn(
        'Cannot auto-migrate orphaned viz dataset IDs — count mismatch',
        LogCategory.DATA,
        {
          orphanedGroups: uniqueOldIds.length,
          unmatchedDatasets: unmatchedDatasets.length
        }
      );
      return;
    }

    const oldToNew = new Map<string, string>();
    for (let i = 0; i < uniqueOldIds.length; i++) {
      oldToNew.set(uniqueOldIds[i], unmatchedDatasets[i].id);
    }

    for (const viz of orphanedVizs) {
      const newId = oldToNew.get(viz.datasetId);
      if (newId) {
        visualizationStore.updateVisualization(viz.id, { datasetId: newId });
      }
    }

    logger.info(
      `Migrated ${orphanedVizs.length} orphaned viz(s) to stable dataset IDs`,
      LogCategory.DATA,
      { mappings: Object.fromEntries(oldToNew) }
    );
  }

  async function recomputeMissingBreaks(): Promise<void> {
    const vizs = visualizationStore.activeVisualizations;
    if (!Array.isArray(vizs) || vizs.length === 0) return;
    for (const viz of vizs) {
      if (!needsBreaksComputation(viz)) continue;

      const dataset = datasetsStore.datasets.find(
        (d) => d.id === viz.datasetId
      );
      if (!dataset?.sourceFileId) continue;

      const method = viz.classification!.method;
      const numClasses =
        viz.classification!.numClasses ?? viz.classification!.classes ?? 5;
      const normalizedMethod = normalizeClassificationMethod(method);
      if (normalizedMethod === ClassificationMethod.MANUAL) {
        continue;
      }
      const requestedClassCount = resolveRequestedClassCount(
        normalizedMethod,
        numClasses
      );

      try {
        const result = await calculateBreaks({
          datasetId: dataset.sourceFileId,
          columnName: viz.mapping.valueColumn!,
          method: normalizedMethod,
          numClasses: requestedClassCount
        });

        if (!result) continue;

        const actualNumClasses = resolveComputedClassCount(
          normalizedMethod,
          requestedClassCount,
          result.counts.length
        );
        const existingColors = viz.classification?.colors;
        let colors: string[];
        if (existingColors && existingColors.length === actualNumClasses) {
          colors = existingColors;
        } else {
          const paletteType =
            viz.classification?.breakpointValue != null
              ? 'diverging'
              : 'sequential';
          const contrast = getColorBlindnessState().enabled
            ? ('high' as const)
            : undefined;
          const userPalette = viz.classification?.paletteId
            ? findPaletteById(viz.classification.paletteId)
            : undefined;
          const isPatternPalette = userPalette?.type === PALETTE_TYPE.PATTERN;
          const divergingSplit =
            paletteType === 'diverging'
              ? computeDivergingSplit(
                  actualNumClasses,
                  result.breaks,
                  viz.classification?.breakpointValue ?? null
                )
              : undefined;
          colors =
            userPalette && !isPatternPalette
              ? generatePaletteColors(userPalette, actualNumClasses, contrast)
              : generateColorsForBreaks(
                  actualNumClasses,
                  paletteType,
                  contrast,
                  divergingSplit
                );
          colors = applyPaletteInversion(
            colors,
            viz.classification?.inverted ?? false
          );
        }

        visualizationStore.updateClassification(viz.id, {
          breaks: result.breaks,
          counts: result.counts,
          colors,
          ...(normalizedMethod !== method ||
          actualNumClasses !== numClasses ||
          viz.classification?.classes !== actualNumClasses
            ? {
                method: normalizedMethod,
                classes: actualNumClasses,
                numClasses: actualNumClasses
              }
            : {})
        });
      } catch (error) {
        logger.warn(
          `Failed to recompute breaks for viz ${viz.id}`,
          LogCategory.DATA,
          { error }
        );
      }
    }
  }

  function needsBreaksComputation(viz: VisualizationConfig): boolean {
    if (
      viz.modes?.fill !== FillMode.CLASSES ||
      !viz.mapping.valueColumn ||
      !viz.classification?.method ||
      viz.classification.method === ClassificationMethod.MANUAL
    ) {
      return false;
    }

    const breaks = viz.classification.breaks;
    const colors = viz.classification.colors;

    // No breaks at all
    if (!breaks || breaks.length < 2) return true;

    // Breaks/colors mismatch: for N colors we support either:
    // - N-1 internal thresholds (current classification flow)
    // - N lower bounds (legacy serialized projects)
    // Anything else likely means corrupted serialized state — recompute.
    if (colors && colors.length > 0) {
      const isInternalThresholdShape = breaks.length === colors.length - 1;
      const isLegacyLowerBoundShape = breaks.length === colors.length;
      if (!isInternalThresholdShape && !isLegacyLowerBoundShape) {
        logger.warn(
          'Breaks/colors mismatch detected, will recompute',
          LogCategory.DATA,
          {
            vizId: viz.id,
            breaksLength: breaks.length,
            colorsLength: colors.length,
            expectedBreaks: [colors.length - 1, colors.length]
          }
        );
        return true;
      }
    }

    return false;
  }

  /** Set to true once onProjectChanged() completes. If initialize() runs after,
   *  it skips the migration + breaks work that onProjectChanged already did. */
  let projectAlreadyRestored = false;
  let pendingGeoColumnRestoreTimeout: ReturnType<typeof setTimeout> | null =
    null;
  let activeGeoColumnRestoreToken = 0;

  function cancelPendingGeoColumnRestore(): void {
    activeGeoColumnRestoreToken += 1;
    if (pendingGeoColumnRestoreTimeout !== null) {
      clearTimeout(pendingGeoColumnRestoreTimeout);
      pendingGeoColumnRestoreTimeout = null;
    }
  }

  async function initialize(): Promise<void> {
    await projectStore.waitForInit();

    // onProjectChanged() may have already been called during projectStore init
    // (via loadLastProject → loadProject). If so, skip duplicate restoration.
    if (projectAlreadyRestored) {
      return;
    }

    const currentProject = projectStore.currentProject;

    const vizSettings = (
      currentProject?.data as SerializedProjectData | undefined
    )?.visualizationSettings;

    // Preload persisted visualizations before datasets are restored so the
    // $effect in visualization-tab.svelte does not see 0 vizs and auto-create.
    if (vizSettings) {
      visualizationStore.restoreFromSerialized(vizSettings);
    }

    if (currentProject?.data?.sourceFiles) {
      await processProjectFiles(currentProject.data.sourceFiles);
    }

    // Restore once more after dataset loading so the runtime store matches the
    // serialized project exactly, even if dataset restoration created
    // temporary default visualizations.
    if (vizSettings) {
      visualizationStore.restoreFromSerialized(vizSettings);
    }

    migrateOrphanedVizDatasetIds();

    // Ensure all choropleth visualizations have valid breaks.
    // Breaks are normally computed in configure-visualization.svelte, but
    // that component is only mounted on the Viz tab — after a refresh on
    // another tab, or if the project was saved before breaks were computed,
    // the choropleth would render without colors.
    await recomputeMissingBreaks();

    layersActions.syncWithVisualizations();
    legendActions.syncWithVisualizations();
    persistenceRegistry.markClean();
  }

  async function onProjectChanged(): Promise<void> {
    await duckDBOrchestrator.waitForInitialization();
    cancelPendingGeoColumnRestore();

    visualizationStore.clear();
    datasetsStore.clear();
    layersActions.reset();
    processedFileIds.clear();

    // Remove runtime datasets before dropping DuckDB tables so reactive UI
    // components stop reading the soon-to-be-deleted tables during project
    // switches.
    await duckDBOrchestrator.clear();

    const currentProject = projectStore.currentProject;
    const vizSettings = (
      currentProject?.data as SerializedProjectData | undefined
    )?.visualizationSettings;
    const projectionSettings = (
      currentProject?.data as SerializedProjectData | undefined
    )?.layoutSettings?.projection;

    // Preload persisted visualizations before datasets are restored so the
    // project reload path does not briefly recreate default visualizations.
    if (vizSettings) {
      visualizationStore.restoreFromSerialized(vizSettings);
    }

    if (currentProject?.data?.sourceFiles) {
      await processProjectFiles(currentProject.data.sourceFiles);
    }

    // Restore once more after dataset loading so the runtime store matches the
    // serialized project exactly, even if dataset restoration created
    // temporary default visualizations.
    if (vizSettings) {
      visualizationStore.restoreFromSerialized(vizSettings);
    }

    migrateOrphanedVizDatasetIds();
    await recomputeMissingBreaks();
    if (projectionSettings) {
      projectionActions.setState(projectionSettings);
    }

    globalActions.ensureTabSelected();
    datasetsStore.applyPersistedViewState();
    duckDBOrchestrator.applyPersistedTableFilters();

    // Restore the geo column selection in the data tab UI so users don't
    // lose their manual choice (e.g. "entity" for fuzzy-countries) on reload.
    if (currentProject?.data?.sourceFiles) {
      const selectedSourceFileId =
        datasetsStore.selectedDataset?.sourceFileId ??
        globalState.selectedDataButtonId;
      const restoredFile =
        currentProject.data.sourceFiles.find(
          (file) =>
            file.id === selectedSourceFileId &&
            (file.geoColumn || file.joinedBasemap || file.gpsMode)
        ) ??
        currentProject.data.sourceFiles.find(
          (file) => file.geoColumn || file.joinedBasemap || file.gpsMode
        );
      const restoredDuckDataset = restoredFile
        ? duckDBOrchestrator.getDatasetBySourceFile(restoredFile.id)
        : null;
      const restoredPrimaryJoinState = restoredFile
        ? resolvePersistedJoinState({
            file: restoredFile,
            duckDataset: restoredDuckDataset,
            selectedBasemapId: currentProject.data.basemap?.id,
            linkedGeoColumn: restoredFile.geoColumn,
            selectedGpsColumns: restoredFile.gpsColumns,
            isSelectedSourceFile: true
          })
        : null;
      if (restoredPrimaryJoinState?.joinedBasemap) {
        dataTabActions.selectBasemap(restoredPrimaryJoinState.joinedBasemap);
      }
      if (
        restoredPrimaryJoinState?.gpsMode &&
        restoredPrimaryJoinState.gpsColumns
      ) {
        dataTabActions.setGeolocationState({
          linkedVariable: null,
          linkedVariableName: '',
          latitudeColumn: restoredPrimaryJoinState.gpsColumns.lat,
          longitudeColumn: restoredPrimaryJoinState.gpsColumns.lon,
          autoDetected: false
        });
      } else if (restoredPrimaryJoinState?.geoColumn) {
        const geoCol = restoredPrimaryJoinState.geoColumn;
        const currentProjectId = currentProject.id;
        const restoredSourceFileId = restoredFile?.id;
        cancelPendingGeoColumnRestore();
        const restoreToken = activeGeoColumnRestoreToken;

        // Defer restoration until dataset is fully loaded. The component's
        // $effect resets linkedVariable when the dataset ID changes, so we
        // must wait for that reset to happen first, then override.
        const restoreGeoColumn = () => {
          if (
            restoreToken !== activeGeoColumnRestoreToken ||
            projectStore.currentProject?.id !== currentProjectId
          ) {
            pendingGeoColumnRestoreTimeout = null;
            return;
          }

          const dataset = datasetsStore.selectedDataset;
          if (
            !dataset?.columns?.length ||
            (restoredSourceFileId &&
              dataset.sourceFileId !== restoredSourceFileId)
          ) {
            // Dataset not ready yet, retry
            pendingGeoColumnRestoreTimeout = setTimeout(restoreGeoColumn, 200);
            return;
          }

          pendingGeoColumnRestoreTimeout = null;

          const colIndex = dataset.columns
            .filter((c) => c.name !== '__geom' && c.name !== '__id')
            .findIndex((c) => c.name === geoCol);
          if (colIndex >= 0) {
            dataTabActions.setGeolocationState({
              linkedVariable: colIndex,
              linkedVariableName: geoCol,
              autoDetected: false
            });
          }
        };
        // Wait 2s for all Svelte $effects to settle after dataset loading
        pendingGeoColumnRestoreTimeout = setTimeout(restoreGeoColumn, 2000);
      }
    }

    layersActions.syncWithVisualizations();
    legendActions.syncWithVisualizations();
    persistenceRegistry.markClean();

    projectAlreadyRestored = true;
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
