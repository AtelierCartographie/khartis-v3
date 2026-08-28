import type { DatasetResult } from '$lib/features/data-pipeline';
import {
  createFileFromUpload,
  dataPipeline,
  isZipDatasetResult
} from '$lib/features/data-pipeline';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
import {
  disableFacets,
  getFacetsBaseVisualizationId
} from '$lib/features/step-toolbar/tools/facets';
import { toJsonValue } from '$lib/features/commons/utils/json.utils';
import type { UploadedFile } from '../../types/create-project.types';
import { DataSourceType, FileType } from '../../types/create-project.types';
import { FileStatus } from '../../constants/ui.constants';
import type { DatasetsState } from './datasets-state.svelte';
import { startProcessing, endProcessing } from './datasets-state.svelte';
import type { VisualizationStoreOperations } from './datasets-processing';
import { LogCategory, logger } from '../../utils/logger';
import * as m from '$lib/paraglide/messages';
import { projectStore } from '../project.store.svelte';
import { visualizationStore } from '../visualization.store.svelte';

function cloneContent(
  content: UploadedFile['content']
): UploadedFile['content'] | undefined {
  if (typeof content === 'string') {
    return content;
  }

  if (content instanceof ArrayBuffer) {
    return content.slice(0);
  }

  return undefined;
}

function clonePlainValue<T>(value: T): T {
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'object' ||
    value instanceof Date
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => clonePlainValue(item)) as T;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, clonePlainValue(item)])
  ) as T;
}

function cloneRelatedFilesData(
  relatedFilesData: UploadedFile['relatedFilesData']
): UploadedFile['relatedFilesData'] | undefined {
  if (!relatedFilesData) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(relatedFilesData).map(([name, buffer]) => [
      name,
      buffer.slice(0)
    ])
  );
}

function cloneDatasetParsedData(
  data: DatasetResult['data']
): UploadedFile['parsedData'] | undefined {
  if (!data) {
    return undefined;
  }

  return data.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, toJsonValue(value)])
    )
  );
}

function buildStatisticsFromDataset(
  dataset: DatasetResult
): UploadedFile['statistics'] | undefined {
  const statistics = Object.fromEntries(
    dataset.columns
      .filter((column) => column.stats)
      .map((column) => [
        column.name,
        {
          type: column.type,
          count: column.stats?.count ?? 0,
          nullCount: column.stats?.nulls ?? 0,
          unique: column.stats?.uniques ?? 0,
          min: column.stats?.min,
          max: column.stats?.max,
          mean: column.stats?.mean
        }
      ])
  );

  return Object.keys(statistics).length > 0 ? statistics : undefined;
}

export async function resetDataset(
  state: DatasetsState,
  datasetId: string,
  visualizationStoreOps?: VisualizationStoreOperations | null
): Promise<boolean> {
  const dataset = state.datasets.find((d) => d.id === datasetId);
  if (!dataset) {
    return false;
  }

  const sourceFile = projectStore.currentProject?.data?.sourceFiles?.find(
    (f) => f.id === dataset.sourceFileId
  );

  if (!sourceFile) {
    return false;
  }

  if (sourceFile.isVirtualCopy) {
    return false;
  }

  if (!sourceFile.content && !sourceFile.originalFile && !sourceFile.assetRef) {
    return false;
  }

  try {
    startProcessing();

    const previousTableName = dataset.tableName;
    const preservedJoinState = {
      joinedBasemap: sourceFile.joinedBasemap ?? dataset.joinedBasemap,
      geoColumn: sourceFile.geoColumn ?? dataset.geoColumn,
      gpsMode: sourceFile.gpsMode,
      gpsColumns: sourceFile.gpsColumns
    };

    const restoredSourceFile =
      sourceFile.originalFile ?? (await createFileFromUpload(sourceFile));

    const result = await dataPipeline.processUploadedFile(
      sourceFile,
      restoredSourceFile
    );

    const newDataset: DatasetResult = isZipDatasetResult(result)
      ? result.datasets[0]
      : result;

    const resetDatasetResult: DatasetResult = {
      ...newDataset,
      id: datasetId,
      joinedBasemap: preservedJoinState.joinedBasemap,
      geoColumn: preservedJoinState.geoColumn
    };

    // The pipeline can rebuild the source under the same DuckDB table name.
    // Invalidate analysis and join similarity caches before restoring the join,
    // otherwise values removed by filters may remain absent after the reset.
    await duckDBOrchestrator.invalidateAndReanalyse(
      resetDatasetResult.tableName
    );

    state.datasets = state.datasets.map((existingDataset) =>
      existingDataset.id === datasetId ? resetDatasetResult : existingDataset
    );

    const registeredDataset = await duckDBOrchestrator.registerExistingTable(
      resetDatasetResult.tableName,
      resetDatasetResult.sourceFileId,
      resetDatasetResult.name,
      {
        geoDetection: resetDatasetResult.geoDetection,
        preserveExistingJoinState: false,
        preferredDatasetId: resetDatasetResult.id
      }
    );

    if (
      registeredDataset &&
      preservedJoinState.joinedBasemap &&
      preservedJoinState.geoColumn
    ) {
      await basemapCatalogService.loadCatalog();
      const basemap = basemapCatalogService.getBasemapById(
        preservedJoinState.joinedBasemap
      );

      if (basemap) {
        await duckDBOrchestrator.finalizeJoin(
          registeredDataset.id,
          basemap,
          preservedJoinState.geoColumn
        );
      }
    }

    duckDBOrchestrator.clearFilters(previousTableName);

    if (previousTableName !== resetDatasetResult.tableName) {
      await duckDBOrchestrator.dropTable(previousTableName);
    }

    if (visualizationStoreOps) {
      const visualizations =
        visualizationStoreOps.getVisualizationsByDataset(datasetId);
      const facetsBaseVizId = getFacetsBaseVisualizationId();
      const facetsBaseBeingReset =
        facetsBaseVizId !== null &&
        visualizations.some(
          (visualization) => visualization.id === facetsBaseVizId
        );

      for (const visualization of visualizations) {
        visualizationStoreOps.removeVisualization(visualization.id);
      }

      if (facetsBaseBeingReset) {
        disableFacets();
      }
    }

    await projectStore.clearColumnTransformations(sourceFile.id, {
      duckdbTableName: resetDatasetResult.tableName,
      ...preservedJoinState
    });

    duckDBOrchestrator.bumpDatasetsVersion();

    return true;
  } catch (error) {
    logger.error('Failed to reset dataset', LogCategory.STORE, error);
    return false;
  } finally {
    endProcessing();
  }
}

export async function duplicateDataset(
  state: DatasetsState,
  datasetId: string
): Promise<string | null> {
  const dataset = state.datasets.find((d) => d.id === datasetId);
  if (!dataset) {
    return null;
  }

  try {
    startProcessing();

    const newId = crypto.randomUUID();
    const newTableName = `dataset_${newId.replace(/-/g, '_')}`;
    const originalFile = projectStore.currentProject?.data?.sourceFiles?.find(
      (f) => f.id === dataset.sourceFileId
    );
    const copyBaseName = originalFile?.name ?? dataset.name;
    const copyName = `${copyBaseName}${m.copy_suffix()}`;

    await Duck.query(
      `CREATE TABLE "${escapeIdentifier(newTableName)}" AS SELECT * FROM "${escapeIdentifier(dataset.tableName)}"`
    );

    const virtualFileId = crypto.randomUUID();
    const parsedData = Array.isArray(originalFile?.parsedData)
      ? clonePlainValue(originalFile.parsedData)
      : cloneDatasetParsedData(dataset.data);
    const virtualFile: UploadedFile = {
      id: virtualFileId,
      name: copyName,
      size: originalFile?.size ?? 0,
      type: originalFile?.type ?? 'application/octet-stream',
      fileType: originalFile?.fileType ?? FileType.UNKNOWN,
      status: FileStatus.COMPLETE,
      sourceType: DataSourceType.COPY,
      validation: originalFile?.validation
        ? clonePlainValue(originalFile.validation)
        : undefined,
      assetRef: originalFile?.assetRef,
      companionAssetRefs: originalFile?.companionAssetRefs
        ? clonePlainValue(originalFile.companionAssetRefs)
        : undefined,
      content: cloneContent(originalFile?.content),
      originalFile: originalFile?.originalFile,
      relatedFileObjects: originalFile?.relatedFileObjects
        ? [...originalFile.relatedFileObjects]
        : undefined,
      relatedFiles: originalFile?.relatedFiles
        ? [...originalFile.relatedFiles]
        : undefined,
      relatedFilesData: cloneRelatedFilesData(originalFile?.relatedFilesData),
      parsedData,
      preparedGeoJSON: originalFile?.preparedGeoJSON,
      statistics:
        originalFile?.statistics ??
        buildStatisticsFromDataset(dataset) ??
        undefined,
      duplicates: originalFile?.duplicates
        ? clonePlainValue(originalFile.duplicates)
        : undefined,
      deepAnalysis: originalFile?.deepAnalysis
        ? clonePlainValue(originalFile.deepAnalysis)
        : undefined,
      geoMatchResult: originalFile?.geoMatchResult
        ? clonePlainValue(originalFile.geoMatchResult)
        : undefined,
      columnTransformations: originalFile?.columnTransformations
        ? [...originalFile.columnTransformations]
        : undefined,
      deletedRowIds: originalFile?.deletedRowIds
        ? [...originalFile.deletedRowIds]
        : undefined,
      joinedBasemap: originalFile?.joinedBasemap ?? dataset.joinedBasemap,
      geoColumn: originalFile?.geoColumn ?? dataset.geoColumn,
      gpsMode: originalFile?.gpsMode,
      gpsColumns: originalFile?.gpsColumns
        ? { ...originalFile.gpsColumns }
        : undefined,
      sourceArchive: originalFile?.sourceArchive,
      duckdbTableName: newTableName,
      shapefileBaseName: originalFile?.shapefileBaseName,
      missingShapefileComponents: originalFile?.missingShapefileComponents
        ? [...originalFile.missingShapefileComponents]
        : undefined,
      isVirtualCopy: true,
      originalSourceFileId: dataset.sourceFileId,
      datasetId: newId
    };

    projectStore.addVirtualSourceFile(virtualFile);

    const newDataset: DatasetResult = {
      ...dataset,
      id: newId,
      name: copyName,
      tableName: newTableName,
      sourceFileId: virtualFileId,
      columns: dataset.columns.map((col) => ({
        ...col,
        ...(col.stats ? { stats: { ...col.stats } } : {})
      })),
      metadata: {
        ...dataset.metadata,
        processedAt: new Date(),
        transformations: []
      },
      ...(dataset.geoDetection
        ? {
            geoDetection: {
              ...dataset.geoDetection,
              geoColumns: [...(dataset.geoDetection.geoColumns ?? [])],
              warnings: [...(dataset.geoDetection.warnings ?? [])]
            }
          }
        : {})
    };

    state.datasets = [...state.datasets, newDataset];
    state.enabledDatasetIds.add(newId);

    await duckDBOrchestrator.registerExistingTable(
      newTableName,
      newDataset.sourceFileId,
      copyName,
      {
        geoDetection: newDataset.geoDetection,
        preferredDatasetId: newDataset.id
      }
    );

    const originalVizs =
      visualizationStore.getVisualizationsByDataset(datasetId);
    for (const viz of originalVizs) {
      visualizationStore.duplicateVisualization(viz.id, newId);
    }

    return newId;
  } catch (error) {
    logger.error('Failed to duplicate dataset', LogCategory.STORE, error);
    return null;
  } finally {
    endProcessing();
  }
}
