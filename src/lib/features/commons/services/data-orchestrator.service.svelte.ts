import type { DatasetResult } from '$lib/features/data-pipeline';
import {
  createFileFromUpload,
  dataPipeline,
  isZipDatasetResult
} from '$lib/features/data-pipeline';
import {
  Duck,
  RefineOperation,
  duckDBOrchestrator
} from '$lib/features/duckdb';
import {
  isGeoJSONFeatureCollection,
  type GeoJSONFeatureCollection
} from '$lib/types/data';
import { cleanupDuckDBResources } from '$lib/features/commons/utils/duckdb-cleanup.utils';
import { buildFileErrorContext } from '$lib/features/commons/utils/file-error-context.utils';
import { toJsonValue } from '$lib/features/commons/utils/json.utils';
import type { SerializedProjectData } from '$lib/types/serialization.types';
import { persistenceRegistry } from '$lib/features/project-management/core';
import { createCompanionFilesFromAssetRefs } from '$lib/features/project-management/services/asset-store.service';
import { facetsStore } from '$lib/features/step-toolbar/tools/facets';
import { layersActions } from '$lib/features/step-toolbar/tools/layers';
import { legendActions } from '$lib/features/step-toolbar/tools/legend';
import { projectionActions } from '$lib/features/step-toolbar/tools/projections';
import {
  DuckDBError,
  formatError,
  isFatalError,
  ParseError
} from '../pipeline.errors';
import type { UploadedFile } from '../types/create-project.types';
import {
  FileType,
  COLUMN_TRANSFORMATION_TYPES
} from '../types/create-project.types';
import { dataTabActions, dataTabState } from '../stores/data-tab.store.svelte';
import { datasetsStore } from '../stores/datasets.store.svelte';
import { globalActions, globalState } from '../stores/global.svelte';
import { projectStore } from '../stores/project.store.svelte';
import { dataTabStore } from '$lib/features/data-tab/stores/data-tab.store.svelte';
import {
  captureProjectRuntime,
  isCurrentProjectRuntime,
  type ProjectRuntimeSnapshot
} from '../stores/project/project-runtime.svelte';
import {
  ClassificationMethod,
  visualizationStore,
  type VisualizationConfig
} from '../stores/visualization.store.svelte';
import { LogCategory, logger } from '../utils/logger';
import { PERF_PHASE, perfMark, perfMeasure } from '../utils/perf-marks.utils';
import {
  notificationManager,
  showError,
  showWarning
} from '../utils/notification.utils.svelte';
import { sanitizePreparedGeoJSON } from '../utils/persisted-geojson.utils';
import { resolvePersistedJoinState } from '../utils/persisted-join-state.utils';
import { replaceFileExtension } from '../utils/file.utils';
import { escapeIdentifier, escapeSqlString } from '../utils/sanitize.utils';
import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
import {
  ensureDatasetGeometryBasemap,
  forgetDatasetGeometryBasemap,
  resetDatasetGeometryBasemaps
} from '$lib/features/map/services/dataset-geometry-basemap.service';
import { importRollbackService } from './import-rollback.service';
import {
  applyPaletteInversion,
  calculateDivergingBreaks,
  calculateBreaks,
  computeDivergingSplit,
  generateColorsForBreaks
} from './classification.service';
import { resolveRowScopeClause } from './row-scope.service';
import {
  DEFAULT_CLASSIFICATION_CLASS_COUNT,
  FillMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  getColorBlindnessState,
  isColorBlindnessActive
} from '$lib/features/step-toolbar/tools/color-blindness';
import {
  findPaletteById,
  generatePaletteColors,
  PALETTE_TYPE
} from '$lib/features/commons/components/palette-popover/palette.constants';
import {
  normalizeClassificationMethod,
  resolveBreakpointLowerClassCount,
  resolveComputedClassCount,
  resolveRequestedClassCount
} from '$lib/features/commons/utils/discretization.utils';
import * as m from '$lib/paraglide/messages';

export interface ProjectChangeOptions {
  isProjectCreation?: boolean;
  signal?: AbortSignal;
}

function throwIfProjectChangeAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  if (signal.reason instanceof Error) {
    throw signal.reason;
  }

  throw new Error('Project change aborted');
}

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

  function convertKMLForDuckDB(file: UploadedFile): UploadedFile {
    try {
      let geojsonObject: GeoJSONFeatureCollection;

      if (file.parsedData && isGeoJSONFeatureCollection(file.parsedData)) {
        geojsonObject = file.parsedData;
      } else {
        throw new ParseError(
          'KML files should be processed by the data pipeline, not here',
          file.fileType,
          {
            fileId: file.id,
            fileName: file.name
          }
        );
      }

      const geojsonString =
        file.preparedGeoJSON ?? JSON.stringify(geojsonObject);
      const normalizedName = file.name.replace(/\.(kml|kmz)$/i, '.geojson');

      return {
        ...file,
        name: normalizedName,
        type: 'application/geo+json',
        fileType: FileType.GEOJSON,
        content: geojsonString,
        preparedGeoJSON: geojsonString,
        parsedData: geojsonObject
      };
    } catch (error) {
      throw new ParseError(m.error_kml_conversion_failed(), file.fileType, {
        fileId: file.id,
        fileName: file.name,
        originalError: error instanceof Error ? error.message : String(error)
      });
    }
  }

  function createGeoJsonSnapshotForDuckDB(file: UploadedFile): UploadedFile {
    const normalizedName = replaceFileExtension(file.name, '.geojson');
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
      if (!Duck.db) {
        throw new DuckDBError(m.error_duckdb_not_initialized(), undefined, {
          datasetId: dataset.id,
          fileId: file.id,
          tableName
        });
      }

      const jsonData = JSON.stringify(file.parsedData);
      const jsonBlob = new Blob([jsonData], { type: 'application/json' });
      const jsonFile = new File([jsonBlob], `${tableName}.json`, {
        type: 'application/json'
      });

      await Duck.register_files([jsonFile]);

      const escapedTableName = escapeIdentifier(tableName);
      const escapedJsonPath = escapeSqlString(`${tableName}.json`);
      await Duck.query(
        `CREATE TABLE "${escapedTableName}" AS SELECT * FROM read_json_auto('${escapedJsonPath}')`
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

  const restoreFinalizedJoins = new Set<string>();

  function joinRestoreKey(
    sourceFileId: string,
    joinedBasemap: string,
    geoColumn: string
  ): string {
    return `${sourceFileId}::${joinedBasemap}::${geoColumn}`;
  }

  // The persisted ignoredEntities belong to the single join the dataTab store
  // describes; applying them to another file's finalize would drop rows there.
  function resolveRestoredJoinExcludedValues(sourceFileId: string): string[] {
    const dataTabJoinOwner = resolveRestoredJoinFile(
      projectStore.currentProject
    );
    if (dataTabJoinOwner?.id !== sourceFileId) {
      return [];
    }
    return dataTabState.basemapJoin.ignoredEntities.map(
      (entity) => entity.dataValue
    );
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
        restoredJoinState.geoColumn,
        { excludedValues: resolveRestoredJoinExcludedValues(file.id) }
      );
      restoreFinalizedJoins.add(
        joinRestoreKey(
          file.id,
          restoredJoinState.joinedBasemap,
          restoredJoinState.geoColumn
        )
      );
    } catch (error) {
      // Without the join key the map can only draw the basemap, so a swallowed
      // failure here has to stay visible in the logs.
      logger.warn(
        'Failed to rebuild the persisted basemap join',
        LogCategory.DATA,
        {
          fileId: file.id,
          basemap: restoredJoinState.joinedBasemap,
          geoColumn: restoredJoinState.geoColumn,
          error
        }
      );
      return;
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
        logger.error(m.error_process_geo_file(), LogCategory.DUCKDB, error, {
          feature: 'data',
          flow: 'process_geo_file',
          extra: buildFileErrorContext(file)
        });
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

      file.datasetId = dataset.id;

      await processFileInDuckDB(file, dataset);
      processedFileIds.add(file.id);

      // processFileInDuckDB can retarget the dataset table, so re-read it.
      await ensureDatasetGeometryBasemap(
        datasetsStore.getDatasetBySourceFile(file.id) ?? dataset
      );

      if (
        options?.suggestProjection !== false &&
        (dataset.geometry || dataset.geoDetection)
      ) {
        projectionActions.suggestProjectionForCurrentData();
      }

      layersActions.syncWithVisualizations();
    } catch (error) {
      logger.error('File import failed', LogCategory.DATA, formatError(error), {
        feature: 'data',
        flow: 'import_file',
        extra: buildFileErrorContext(file, { isFatal: isFatalError(error) })
      });

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

      forgetDatasetGeometryBasemap(dataset.tableName);
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
    await restoreSelectedDataTabState();
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
      } catch (error) {
        logger.error(
          'Failed to replay persisted column transformation during project restore',
          LogCategory.DATA,
          error,
          {
            flow: 'project_restore',
            extra: {
              fileId: file.id,
              fileName: file.name,
              datasetId: dataset.id,
              tableName: dataset.tableName,
              transformationType: transformation.type,
              column: transformation.column
            }
          }
        );
        showWarning(
          m.project_restore_transformation_warning_title(),
          m.project_restore_transformation_warning_message({
            type: transformation.type,
            column: transformation.column,
            fileName: file.name
          })
        );
        continue;
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
    } catch (error) {
      logger.error(
        'Failed to replay persisted row deletions during project restore',
        LogCategory.DATA,
        error,
        {
          flow: 'project_restore',
          extra: {
            fileId: file.id,
            fileName: file.name,
            datasetId: dataset.id,
            tableName: dataset.tableName,
            deletedRowCount: file.deletedRowIds.length
          }
        }
      );
      showWarning(
        m.project_restore_row_deletions_warning_title(),
        m.project_restore_row_deletions_warning_message({
          fileName: file.name
        })
      );
    }
  }

  async function processProjectFiles(
    files: UploadedFile[],
    restoreRun?: ProjectRuntimeSnapshot
  ): Promise<void> {
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
      SerializedProjectData | undefined;
    const shouldSuggestProjection =
      !serializedData?.layoutSettings?.projection?.overrideActive;

    try {
      await processWithLimit(unprocessedFiles, 1, async (file) => {
        if (restoreRun && !isCurrentProjectRuntime(restoreRun)) {
          return;
        }

        if (
          file.fileType === FileType.SHAPEFILE &&
          (!file.relatedFileObjects || file.relatedFileObjects.length === 0)
        ) {
          if (file.companionAssetRefs?.length) {
            try {
              file.relatedFileObjects = await createCompanionFilesFromAssetRefs(
                file.companionAssetRefs
              );
            } catch (error) {
              logger.error(
                'Failed to restore shapefile companion assets during project restore',
                LogCategory.DATA,
                error,
                {
                  flow: 'project_restore',
                  extra: {
                    ...buildFileErrorContext(file),
                    companionAssetRefCount: file.companionAssetRefs.length
                  }
                }
              );
              showWarning(
                m.project_restore_companion_files_warning_title(),
                m.project_restore_companion_files_warning_message({
                  fileName: file.name
                })
              );
              file.relatedFileObjects = [];
            }
          }

          if (file.relatedFilesData) {
            const companionFiles: File[] = [];
            for (const [name, buffer] of Object.entries(
              file.relatedFilesData
            )) {
              try {
                const restoredFile = new File([buffer as ArrayBuffer], name);
                companionFiles.push(restoredFile);
              } catch (error) {
                logger.error(
                  'Failed to recreate shapefile companion file during project restore',
                  LogCategory.DATA,
                  error,
                  {
                    flow: 'project_restore',
                    extra: {
                      ...buildFileErrorContext(file),
                      companionFileName: name
                    }
                  }
                );
                showWarning(
                  m.project_restore_companion_files_warning_title(),
                  m.project_restore_companion_files_warning_message({
                    fileName: file.name
                  })
                );
                continue;
              }
            }
            if (companionFiles.length > 0) {
              file.relatedFileObjects = companionFiles;
            }
          }
        }

        if (restoreRun && !isCurrentProjectRuntime(restoreRun)) {
          return;
        }

        if (!file.originalFile && file.content) {
          try {
            file.originalFile = await createFileFromUpload(file);
          } catch (error) {
            logger.error(
              'Failed to recreate source file during project restore',
              LogCategory.DATA,
              error,
              {
                flow: 'project_restore',
                extra: buildFileErrorContext(file)
              }
            );
            showWarning(
              m.project_restore_source_file_warning_title(),
              m.project_restore_source_file_warning_message({
                fileName: file.name
              })
            );
            return;
          }
        }

        if (restoreRun && !isCurrentProjectRuntime(restoreRun)) {
          return;
        }

        const autoEnable = file.id === selectedSourceFileId;

        try {
          await onFileAdded(file, autoEnable, {
            suggestProjection: shouldSuggestProjection
          });

          if (restoreRun && !isCurrentProjectRuntime(restoreRun)) {
            await onFileRemoved(file.id);
            return;
          }

          if (
            file.columnTransformations &&
            file.columnTransformations.length > 0
          ) {
            await applyColumnTransformations(file);
          }

          if (restoreRun && !isCurrentProjectRuntime(restoreRun)) {
            await onFileRemoved(file.id);
            return;
          }

          if (file.deletedRowIds && file.deletedRowIds.length > 0) {
            await applyRowDeletions(file);
          }

          if (restoreRun && !isCurrentProjectRuntime(restoreRun)) {
            await onFileRemoved(file.id);
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
        viz.classification!.numClasses ??
        viz.classification!.classes ??
        DEFAULT_CLASSIFICATION_CLASS_COUNT;
      const normalizedMethod = normalizeClassificationMethod(method);
      if (normalizedMethod === ClassificationMethod.MANUAL) {
        continue;
      }
      const requestedClassCount = resolveRequestedClassCount(
        normalizedMethod,
        numClasses
      );
      const breakpointValue = viz.classification?.breakpointValue;
      const breakpointLowerClassCount =
        breakpointValue != null
          ? resolveBreakpointLowerClassCount(
              requestedClassCount,
              viz.classification?.breakpointLowerClassCount
            )
          : undefined;
      const breakpointUpperClassCount =
        breakpointLowerClassCount != null
          ? requestedClassCount - breakpointLowerClassCount
          : undefined;

      const rowScopeClause = resolveRowScopeClause({
        datasetId: dataset.sourceFileId
      });

      try {
        const result =
          breakpointValue != null &&
          Number.isFinite(breakpointValue) &&
          breakpointLowerClassCount != null &&
          breakpointUpperClassCount != null &&
          breakpointUpperClassCount > 0
            ? await calculateDivergingBreaks({
                datasetId: dataset.sourceFileId,
                columnName: viz.mapping.valueColumn!,
                method: normalizedMethod,
                rowScopeClause,
                breakpointValue,
                lowerClassCount: breakpointLowerClassCount,
                upperClassCount: breakpointUpperClassCount
              })
            : await calculateBreaks({
                datasetId: dataset.sourceFileId,
                columnName: viz.mapping.valueColumn!,
                method: normalizedMethod,
                rowScopeClause,
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
          const contrast = isColorBlindnessActive(getColorBlindnessState())
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
              ? generatePaletteColors(
                  userPalette,
                  actualNumClasses,
                  contrast,
                  undefined,
                  divergingSplit
                )
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
          roundedMin: result.roundedMin,
          roundedMax: result.roundedMax,
          colors,
          ...(result.breakpointLowerClassCount != null
            ? {
                breakpointLowerClassCount: result.breakpointLowerClassCount
              }
            : {}),
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
        logger.error(
          'Failed to recompute visualization breaks during project restore',
          LogCategory.DATA,
          error,
          {
            flow: 'project_restore',
            extra: {
              visualizationId: viz.id,
              visualizationName: viz.name,
              datasetId: viz.datasetId,
              columnName: viz.mapping.valueColumn,
              method: normalizedMethod
            }
          }
        );
        showWarning(
          m.project_restore_classification_warning_title(),
          m.project_restore_classification_warning_message({
            visualizationName: viz.name
          })
        );
        continue;
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

    if (!breaks || breaks.length < 2) return true;

    if (colors && colors.length > 0) {
      const isInternalThresholdShape = breaks.length === colors.length - 1;
      const isLegacyLowerBoundShape = breaks.length === colors.length;
      if (!isInternalThresholdShape && !isLegacyLowerBoundShape) {
        return true;
      }
    }

    return false;
  }

  let projectAlreadyRestored = false;
  let projectRestoreInProgress = $state(false);
  let activeGeoColumnRestoreToken = 0;

  function cancelPendingGeoColumnRestore(): void {
    activeGeoColumnRestoreToken += 1;
  }

  function hasPersistedJoinState(file: UploadedFile): boolean {
    return Boolean(file.geoColumn || file.joinedBasemap || file.gpsMode);
  }

  function resolveRestoredJoinFile(
    currentProject: typeof projectStore.currentProject,
    options: { allowFallbackToAnyJoinedFile?: boolean } = {}
  ): UploadedFile | undefined {
    if (!currentProject?.data?.sourceFiles) {
      return undefined;
    }

    const selectedSourceFileId =
      datasetsStore.selectedDataset?.sourceFileId ??
      globalState.selectedDataButtonId;

    const selectedFile = currentProject.data.sourceFiles.find(
      (file) => file.id === selectedSourceFileId && hasPersistedJoinState(file)
    );

    if (selectedFile || options.allowFallbackToAnyJoinedFile === false) {
      return selectedFile;
    }

    return currentProject.data.sourceFiles.find(hasPersistedJoinState);
  }

  async function restoreSelectedDataTabState(): Promise<void> {
    if (projectRestoreInProgress) {
      return;
    }

    globalActions.ensureTabSelected();

    const currentProject = projectStore.currentProject;
    if (!currentProject) {
      return;
    }

    cancelPendingGeoColumnRestore();
    const restoreToken = activeGeoColumnRestoreToken;
    const restoreRun = captureProjectRuntime();
    await restorePersistedDataTabState(
      currentProject,
      restoreToken,
      restoreRun,
      {
        allowFallbackToAnyJoinedFile: false
      }
    );
  }

  async function restoreTabularJoinCompletion(
    sourceFileId: string,
    fileName: string,
    joinedBasemap: string,
    geoColumn: string,
    restoreRun: ProjectRuntimeSnapshot
  ): Promise<void> {
    try {
      await basemapCatalogService.loadCatalog();
      if (!isCurrentProjectRuntime(restoreRun)) {
        return;
      }

      const basemap = basemapCatalogService.getBasemapById(joinedBasemap);
      const stepIndex = dataTabStore.basemapStepIndex;

      if (!basemap || stepIndex < 0) {
        return;
      }

      const excludedValues = dataTabState.basemapJoin.ignoredEntities.map(
        (entity) => entity.dataValue
      );
      const stats = await duckDBOrchestrator.computeJoinStats(
        sourceFileId,
        basemap,
        geoColumn,
        { excludedValues }
      );
      if (!isCurrentProjectRuntime(restoreRun)) {
        return;
      }

      dataTabActions.setJoinStats(stats);

      if (stats.joinedCount === 0) {
        dataTabStore.resetStepCompletion(stepIndex);
        return;
      }

      // restoreJoinState already applied this exact join, with the same
      // excluded values, during the current restore run; finalizing again
      // would only rewrite the same table.
      const alreadyFinalized = restoreFinalizedJoins.delete(
        joinRestoreKey(sourceFileId, joinedBasemap, geoColumn)
      );
      if (!alreadyFinalized) {
        await duckDBOrchestrator.finalizeJoin(
          sourceFileId,
          basemap,
          geoColumn,
          {
            excludedValues
          }
        );
        if (!isCurrentProjectRuntime(restoreRun)) {
          return;
        }
      }

      dataTabStore.markStepComplete(stepIndex);
    } catch (error) {
      logger.error(
        'Failed to restore tabular join completion during project restore',
        LogCategory.DATA,
        error,
        {
          flow: 'project_restore',
          extra: {
            sourceFileId,
            fileName,
            joinedBasemap,
            geoColumn
          }
        }
      );
      showWarning(
        m.project_restore_join_warning_title(),
        m.project_restore_join_warning_message({
          fileName
        })
      );
      return;
    }
  }

  async function restorePersistedDataTabState(
    currentProject: NonNullable<typeof projectStore.currentProject>,
    restoreToken: number,
    restoreRun: ProjectRuntimeSnapshot,
    options: { allowFallbackToAnyJoinedFile?: boolean } = {}
  ): Promise<void> {
    const restoredFile = resolveRestoredJoinFile(currentProject, options);
    if (!restoredFile) {
      return;
    }

    if (
      restoreToken !== activeGeoColumnRestoreToken ||
      projectStore.currentProject?.id !== currentProject.id ||
      !isCurrentProjectRuntime(restoreRun)
    ) {
      return;
    }

    const restoredDataset = datasetsStore.getDatasetBySourceFile(
      restoredFile.id
    );
    if (!restoredDataset) {
      throw new Error(
        `Failed to restore dataset for source file ${restoredFile.id}`
      );
    }

    globalActions.selectDataButton(restoredFile.id);
    const restoredDuckDataset = duckDBOrchestrator.getDatasetBySourceFile(
      restoredFile.id
    );
    const restoredPrimaryJoinState = resolvePersistedJoinState({
      file: restoredFile,
      duckDataset: restoredDuckDataset,
      selectedBasemapId: currentProject.data.basemap?.id,
      linkedGeoColumn: restoredFile.geoColumn,
      selectedGpsColumns: restoredFile.gpsColumns,
      isSelectedSourceFile: true
    });

    if (restoredPrimaryJoinState.joinedBasemap) {
      if (!isCurrentProjectRuntime(restoreRun)) {
        return;
      }
      dataTabActions.selectBasemap(restoredPrimaryJoinState.joinedBasemap);
    }

    if (
      restoredPrimaryJoinState.gpsMode &&
      restoredPrimaryJoinState.gpsColumns
    ) {
      if (!isCurrentProjectRuntime(restoreRun)) {
        return;
      }
      dataTabActions.setGeolocationState({
        linkedVariable: null,
        linkedVariableName: '',
        latitudeColumn: restoredPrimaryJoinState.gpsColumns.lat,
        longitudeColumn: restoredPrimaryJoinState.gpsColumns.lon,
        autoDetected: false
      });
      dataTabStore.markStepComplete(dataTabStore.basemapStepIndex);
      return;
    }

    if (
      !restoredPrimaryJoinState.geoColumn ||
      !restoredDataset?.columns?.length
    ) {
      return;
    }

    const colIndex = restoredDataset.columns
      .filter((c) => c.name !== '__geom' && c.name !== '__id')
      .findIndex((c) => c.name === restoredPrimaryJoinState.geoColumn);

    if (colIndex >= 0) {
      if (!isCurrentProjectRuntime(restoreRun)) {
        return;
      }
      dataTabActions.setGeolocationState({
        linkedVariable: colIndex,
        linkedVariableName: restoredPrimaryJoinState.geoColumn,
        autoDetected: false
      });
      if (restoredPrimaryJoinState.joinedBasemap) {
        await restoreTabularJoinCompletion(
          restoredFile.id,
          restoredFile.name,
          restoredPrimaryJoinState.joinedBasemap,
          restoredPrimaryJoinState.geoColumn,
          restoreRun
        );
      }
    }
  }

  function collectCreationTableNames(
    project: typeof projectStore.currentProject
  ): string[] {
    const sourceFiles = project?.data?.sourceFiles ?? [];
    return sourceFiles.flatMap((file) =>
      file.duckdbTableName ? [file.duckdbTableName] : []
    );
  }

  async function restoreCurrentProjectState(
    options: ProjectChangeOptions = {}
  ): Promise<void> {
    throwIfProjectChangeAborted(options.signal);

    const restoreRun = captureProjectRuntime();
    const restoreToken = activeGeoColumnRestoreToken;
    const currentProject = projectStore.currentProject;
    const vizSettings = (
      currentProject?.data as SerializedProjectData | undefined
    )?.visualizationSettings;
    const basemapSettings = (
      currentProject?.data as SerializedProjectData | undefined
    )?.basemapSettings;
    const facetsSettings = (
      currentProject?.data as SerializedProjectData | undefined
    )?.uiSettings?.facets;
    const layoutSettings = (
      currentProject?.data as SerializedProjectData | undefined
    )?.layoutSettings;
    const projectionSettings = (
      currentProject?.data as SerializedProjectData | undefined
    )?.layoutSettings?.projection;

    // Creation fast-path: the create modal just imported these tables, so the
    // clear keeps them and registerExistingTable reuses them without re-import.
    // Reopen and project-switch paths keep the full clear.
    const preservedCreationTableNames = options.isProjectCreation
      ? collectCreationTableNames(currentProject)
      : [];

    projectRestoreInProgress = true;
    restoreFinalizedJoins.clear();
    perfMark(PERF_PHASE.PROJECT_RESTORE);

    try {
      await persistenceRegistry.withPersistenceSuspended(
        async () => {
          throwIfProjectChangeAborted(options.signal);
          visualizationStore.clear();
          datasetsStore.clear();
          layersActions.reset();
          processedFileIds.clear();
          processingFiles.clear();

          await duckDBOrchestrator.clear(
            preservedCreationTableNames.length > 0
              ? { preserveTableNames: preservedCreationTableNames }
              : undefined
          );
          throwIfProjectChangeAborted(options.signal);

          if (!isCurrentProjectRuntime(restoreRun)) {
            return;
          }

          if (!currentProject) {
            return;
          }

          if (currentProject?.data?.sourceFiles) {
            await processProjectFiles(
              currentProject.data.sourceFiles,
              restoreRun
            );
          }
          throwIfProjectChangeAborted(options.signal);

          if (!isCurrentProjectRuntime(restoreRun)) {
            return;
          }

          if (vizSettings) {
            visualizationStore.restoreFromSerialized(vizSettings);
          }

          if (layoutSettings) {
            persistenceRegistry.deserializeAll({
              format: layoutSettings.format,
              annotations: layoutSettings.annotations,
              legend: layoutSettings.legend,
              geoIndications: layoutSettings.geoIndications
            });
          }

          if (basemapSettings) {
            persistenceRegistry.deserializeAll({
              basemapStyle: {
                style: basemapSettings.style,
                lastSelectedTiledStyle: basemapSettings.lastSelectedTiledStyle,
                referenceBasemapId: basemapSettings.referenceBasemapId,
                showLabels: basemapSettings.showLabels,
                groupVisibility: basemapSettings.groupVisibility
              }
            });
          }

          migrateOrphanedVizDatasetIds();
          await recomputeMissingBreaks();
          throwIfProjectChangeAborted(options.signal);

          if (facetsSettings) {
            persistenceRegistry.deserializeAll({ facets: facetsSettings });
            await facetsStore.restoreGeneratedVisualizations();
            throwIfProjectChangeAborted(options.signal);
          }

          if (!isCurrentProjectRuntime(restoreRun)) {
            return;
          }

          if (projectionSettings) {
            projectionActions.setState(projectionSettings);
          }

          globalActions.ensureTabSelected();
          datasetsStore.applyPersistedViewState();
          duckDBOrchestrator.applyPersistedTableFilters();

          if (currentProject) {
            await restorePersistedDataTabState(
              currentProject,
              restoreToken,
              restoreRun
            );
            throwIfProjectChangeAborted(options.signal);
          }

          if (!isCurrentProjectRuntime(restoreRun)) {
            return;
          }

          layersActions.syncWithVisualizations();
          legendActions.syncWithVisualizations();
        },
        { signal: options.signal }
      );

      if (isCurrentProjectRuntime(restoreRun)) {
        persistenceRegistry.markClean();
        projectAlreadyRestored = true;
      }
    } finally {
      restoreFinalizedJoins.clear();
      perfMeasure(PERF_PHASE.PROJECT_RESTORE);
      if (isCurrentProjectRuntime(restoreRun)) {
        projectRestoreInProgress = false;
      }
    }
  }

  async function initialize(): Promise<void> {
    await projectStore.waitForInit();

    if (projectAlreadyRestored) {
      return;
    }
    await restoreCurrentProjectState();
  }

  async function onProjectChanged(
    options: ProjectChangeOptions = {}
  ): Promise<void> {
    throwIfProjectChangeAborted(options.signal);
    const projectChangeRun = captureProjectRuntime();
    await duckDBOrchestrator.waitForInitialization();
    throwIfProjectChangeAborted(options.signal);
    if (!isCurrentProjectRuntime(projectChangeRun)) {
      return;
    }

    cancelPendingGeoColumnRestore();
    resetDatasetGeometryBasemaps();
    await restoreCurrentProjectState(options);
  }

  return {
    get geometryDatasetsVersion() {
      return geometryDatasetsVersion;
    },
    get isProjectRestoreInProgress() {
      return projectRestoreInProgress;
    },
    initialize,
    onFileAdded,
    onFileRemoved,
    onProjectChanged,
    restoreSelectedDataTabState
  };
}

export const dataOrchestratorService = createDataOrchestratorService();
