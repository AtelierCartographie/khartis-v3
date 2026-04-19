import type {
  DatasetResult,
  EnrichedColumn,
  GeometryInfo,
  ZipDatasetResult
} from '$lib/features/data-pipeline';
import {
  ColumnType,
  computeCentroid,
  dataPipeline,
  isZipDatasetResult
} from '$lib/features/data-pipeline';
import type { UploadedFile } from '../create-project.types';
import { FileType } from '../create-project.types';
import type { DatasetsState, DatasetsInternals } from './datasets-state.svelte';
import { startProcessing, endProcessing } from './datasets-state.svelte';
import { LogCategory, logger } from '../../utils/logger';
import * as m from '$lib/paraglide/messages';
import { showWarning } from '../../utils/notification.utils.svelte';
import { sanitizePreparedGeoJSON } from '../../utils/persisted-geojson.utils';
import {
  isGeoJSONFeatureCollection,
  type GeoJSONFeatureCollection
} from '$lib/types/data';

export interface VisualizationConfig {
  id: string;
  datasetId: string;
}

export enum VisualizationType {
  CHOROPLETH = 'choropleth',
  PROPORTIONAL = 'proportional',
  CATEGORICAL = 'categorical',
  BIVARIATE = 'bivariate'
}

export interface VisualizationStoreOperations {
  getVisualizationsByDataset: (datasetId: string) => VisualizationConfig[];
  removeVisualization: (id: string) => void;
  createVisualization: (
    type: VisualizationType,
    datasetId: string,
    name: string
  ) => void;
}

function isNonEmptyRow(
  row: Record<string, unknown> | null | undefined
): row is Record<string, unknown> {
  return !!row && Object.keys(row).length > 0;
}

function extractCoordsFromGeometry(
  geometry: Record<string, unknown> | null | undefined
): Array<[number, number]> {
  if (!geometry) {
    return [];
  }

  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates)) {
    return [];
  }

  const result: Array<[number, number]> = [];
  const stack: unknown[] = [coordinates];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!Array.isArray(current)) {
      continue;
    }

    const [first, second] = current;
    if (typeof first === 'number' && typeof second === 'number') {
      result.push([first, second]);
      continue;
    }

    stack.push(...current);
  }

  return result;
}

function getPreparedGeoJSON(
  file: UploadedFile
): GeoJSONFeatureCollection | undefined {
  if (!file.preparedGeoJSON) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(file.preparedGeoJSON);
    return isGeoJSONFeatureCollection(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function buildRowsFromPreparedGeoJSON(
  file: UploadedFile
): Record<string, unknown>[] | undefined {
  const preparedGeoJSON = getPreparedGeoJSON(file);
  if (!preparedGeoJSON) {
    return undefined;
  }

  return preparedGeoJSON.features.map((feature) => ({
    ...(feature.properties ?? {})
  }));
}

function buildGeometryInfoFromPreparedGeoJSON(
  file: UploadedFile
): GeometryInfo | undefined {
  const preparedGeoJSON = getPreparedGeoJSON(file);
  if (!preparedGeoJSON || preparedGeoJSON.features.length === 0) {
    return undefined;
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const feature of preparedGeoJSON.features) {
    const coords = extractCoordsFromGeometry(
      feature.geometry as Record<string, unknown> | null | undefined
    );

    for (const [lon, lat] of coords) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (
    !Number.isFinite(minLon) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLon) ||
    !Number.isFinite(maxLat)
  ) {
    return undefined;
  }

  const firstGeometry = preparedGeoJSON.features.find(
    (feature) => feature.geometry?.type
  )?.geometry;
  const bounds: [number, number, number, number] = [
    minLon,
    minLat,
    maxLon,
    maxLat
  ];

  return {
    type:
      typeof firstGeometry?.type === 'string' ? firstGeometry.type : 'Polygon',
    columnName: 'geom',
    bounds,
    centroid: computeCentroid(bounds),
    featureCount: preparedGeoJSON.features.length
  };
}

function normalizeDatasetFormat(
  fileType: FileType
): NonNullable<DatasetResult['format']> {
  switch (fileType) {
    case FileType.CSV:
    case FileType.GEOJSON:
    case FileType.SHAPEFILE:
    case FileType.GEOPACKAGE:
    case FileType.GEOPARQUET:
    case FileType.KML:
    case FileType.KMZ:
    case FileType.GPX:
      return fileType;
    case FileType.TSV:
      return FileType.CSV;
    default:
      return FileType.UNKNOWN;
  }
}

function createRestorableGeoSnapshot(file: UploadedFile): UploadedFile | null {
  if (!file.preparedGeoJSON || !file.duckdbTableName) {
    return null;
  }

  const isGeoSnapshot =
    file.fileType === FileType.GEOJSON ||
    file.fileType === FileType.SHAPEFILE ||
    file.fileType === FileType.GEOPACKAGE ||
    file.fileType === FileType.GEOPARQUET ||
    file.fileType === FileType.KML ||
    file.fileType === FileType.KMZ ||
    file.fileType === FileType.GPX;

  if (!isGeoSnapshot) {
    return null;
  }

  return {
    ...file,
    name: file.name.replace(/\.[^.]+$/u, '.geojson'),
    type: 'application/geo+json',
    fileType: FileType.GEOJSON,
    content: sanitizePreparedGeoJSON(file.preparedGeoJSON),
    originalFile: undefined
  };
}

export function createDatasetFromPreprocessedFile(
  file: UploadedFile
): DatasetResult {
  const statistics = file.statistics as Record<
    string,
    {
      type?: string;
      count?: number;
      nullCount?: number;
      unique?: number;
      min?: unknown;
      max?: unknown;
      mean?: number;
    }
  >;

  const columns: EnrichedColumn[] = Object.entries(statistics || {}).map(
    ([name, stats]) => ({
      name,
      values: [],
      type: (stats.type as ColumnType) || ColumnType.TEXT,
      stats: {
        name,
        type: (stats.type as ColumnType) || ColumnType.TEXT,
        count: stats.count ?? 0,
        nulls: stats.nullCount ?? 0,
        uniques: stats.unique ?? 0,
        min: stats.min,
        max: stats.max,
        mean: stats.mean
      }
    })
  );

  const parsedRows = Array.isArray(file.parsedData)
    ? (file.parsedData as Record<string, unknown>[])
    : undefined;
  const data =
    parsedRows && parsedRows.some((row) => isNonEmptyRow(row))
      ? parsedRows
      : buildRowsFromPreparedGeoJSON(file);
  const firstColStats = Object.values(statistics)[0];
  const geometryInfo = buildGeometryInfoFromPreparedGeoJSON(file);
  const actualRowCount =
    firstColStats?.count ?? geometryInfo?.featureCount ?? data?.length ?? 0;

  const tableName =
    file.duckdbTableName ??
    `legacy_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

  const isGeoDataset =
    Boolean(geometryInfo) ||
    file.fileType === FileType.GEOJSON ||
    file.fileType === FileType.SHAPEFILE ||
    file.fileType === FileType.GEOPACKAGE ||
    file.fileType === FileType.GEOPARQUET ||
    file.fileType === FileType.KML ||
    file.fileType === FileType.KMZ ||
    file.fileType === FileType.GPX;

  return {
    id: file.datasetId ?? file.id,
    name: file.name,
    sourceFileId: file.id,
    tableName,
    columns,
    rowCount: actualRowCount,
    geometry: geometryInfo,
    metadata: {
      processedAt: new Date(),
      fileType: file.fileType,
      parserUsed: file.duckdbTableName ? 'zip-preprocessed' : 'legacy-parsed'
    },
    data,
    fileSize: file.size,
    geoDetection: file.deepAnalysis?.geoDetection,
    analysis: {
      columns,
      geoColumns: geometryInfo
        ? [
            {
              columnName: geometryInfo.columnName ?? 'geom',
              type: 'unknown' as const,
              confidence: 1,
              index: 0,
              isValid: true
            }
          ]
        : [],
      hasGeoData: isGeoDataset,
      suggestedGeoColumn: geometryInfo?.columnName,
      rowCount: actualRowCount,
      warnings: file.deepAnalysis?.geoDetection?.warnings ?? []
    },
    bounds: geometryInfo
      ? {
          minLon: geometryInfo.bounds[0],
          minLat: geometryInfo.bounds[1],
          maxLon: geometryInfo.bounds[2],
          maxLat: geometryInfo.bounds[3]
        }
      : undefined,
    format: normalizeDatasetFormat(file.fileType),
    createdAt: new Date()
  };
}

export function createVisualizationsForGeoDatasets(
  datasets: DatasetResult[],
  ops?: VisualizationStoreOperations | null
): void {
  if (!ops) {
    logger.warn(
      'Visualization store not injected, skipping auto-visualization creation',
      LogCategory.STORE
    );
    return;
  }

  for (const dataset of datasets) {
    if (dataset.geometry) {
      const existingViz = ops.getVisualizationsByDataset(dataset.id);
      if (existingViz.length === 0) {
        ops.createVisualization(
          VisualizationType.CHOROPLETH,
          dataset.id,
          dataset.name
        );
      }
    }
  }
}

function notifySkippedFiles(
  results: (DatasetResult | ZipDatasetResult)[]
): void {
  const allSkippedFiles: string[] = [];

  for (const result of results) {
    if (isZipDatasetResult(result) && result.skippedFiles.length > 0) {
      allSkippedFiles.push(...result.skippedFiles);
    }
  }

  if (allSkippedFiles.length > 0) {
    showWarning(
      m.warning_zip_files_skipped_title(),
      m.warning_zip_files_skipped_message({
        files: allSkippedFiles.join(', ')
      })
    );
    logger.warn('Some files from ZIP were skipped', LogCategory.STORE, {
      skippedFiles: allSkippedFiles
    });
  }
}

export async function processFiles(
  state: DatasetsState,
  internals: DatasetsInternals,
  files: UploadedFile[]
): Promise<void> {
  startProcessing();
  state.error = undefined;

  try {
    logger.info(
      `Processing ${files.length} files with semaphore (max 2 concurrent)`,
      LogCategory.STORE
    );

    const results = await Promise.all(
      files.map(async (file) => {
        return internals.processingSemaphore.run(async () => {
          const restorableGeoSnapshot = createRestorableGeoSnapshot(file);
          if (restorableGeoSnapshot) {
            return dataPipeline.processUploadedFile(restorableGeoSnapshot);
          }

          if (file.duckdbTableName) {
            return createDatasetFromPreprocessedFile(file);
          }

          if (
            !file.content &&
            !file.originalFile &&
            file.parsedData &&
            file.statistics
          ) {
            logger.warn(
              `File ${file.name} has parsed data but no DuckDB table - creating from parsed data`,
              LogCategory.STORE
            );
            return createDatasetFromPreprocessedFile(file);
          }

          if (!file.content && !file.originalFile) {
            throw new Error(`File ${file.name} has no content or originalFile`);
          }

          const result = await dataPipeline.processUploadedFile(
            file,
            file.originalFile
          );

          return result;
        });
      })
    );

    const newDatasets: DatasetResult[] = results.flatMap((result) =>
      isZipDatasetResult(result) ? result.datasets : [result]
    );

    state.datasets = [...state.datasets, ...newDatasets];

    for (const dataset of newDatasets) {
      state.enabledDatasetIds.add(dataset.id);
    }

    if (newDatasets.length > 0 && !state.selectedDatasetId) {
      state.selectedDatasetId = newDatasets[0].id;
    }

    notifySkippedFiles(results);

    logger.success(
      `All ${files.length} files processed successfully`,
      LogCategory.STORE
    );
  } catch (error) {
    logger.error('Files processing failed', LogCategory.STORE, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    state.error = error instanceof Error ? error.message : 'Processing failed';
    throw error;
  } finally {
    endProcessing();
  }
}

export async function addFile(
  state: DatasetsState,
  internals: DatasetsInternals,
  file: UploadedFile,
  autoEnable = true
): Promise<DatasetResult | null> {
  const startTime = performance.now();

  startProcessing();
  state.error = undefined;
  let addedDataset: DatasetResult | null = null;

  try {
    const result = await internals.processingSemaphore.run(async () => {
      const hasRestorableBinarySource = Boolean(
        file.content ||
        file.originalFile ||
        file.assetRef ||
        file.companionAssetRefs?.length
      );
      const restorableGeoSnapshot = createRestorableGeoSnapshot(file);
      if (restorableGeoSnapshot) {
        return dataPipeline.processUploadedFile(restorableGeoSnapshot);
      }

      if (file.duckdbTableName && !hasRestorableBinarySource) {
        return createDatasetFromPreprocessedFile(file);
      }

      if (!hasRestorableBinarySource && file.parsedData && file.statistics) {
        logger.warn(
          `File ${file.name} has parsed data but no DuckDB table - creating from parsed data`,
          LogCategory.STORE
        );
        return createDatasetFromPreprocessedFile(file);
      }

      if (!hasRestorableBinarySource) {
        throw new Error(`File ${file.name} has no content or originalFile`);
      }

      return await dataPipeline.processUploadedFile(file, file.originalFile);
    });

    const datasets: DatasetResult[] = isZipDatasetResult(result)
      ? result.datasets
      : [result];

    for (const dataset of datasets) {
      const existingDataset = state.datasets.find(
        (d) => d.sourceFileId === dataset.sourceFileId
      );

      if (existingDataset) {
        const wasEnabled = state.enabledDatasetIds.has(existingDataset.id);

        state.datasets = state.datasets.map((d) =>
          d.sourceFileId === dataset.sourceFileId ? dataset : d
        );
        if (state.selectedDatasetId === existingDataset.id) {
          state.selectedDatasetId = dataset.id;
        }

        state.enabledDatasetIds.delete(existingDataset.id);
        if (wasEnabled || autoEnable) {
          state.enabledDatasetIds.add(dataset.id);
        }

        if (!addedDataset) addedDataset = dataset;
      } else {
        state.datasets = [...state.datasets, dataset];
        if (autoEnable) {
          state.enabledDatasetIds.add(dataset.id);
        }
      }

      if (!state.selectedDatasetId) {
        state.selectedDatasetId = dataset.id;
      }

      if (!addedDataset) addedDataset = dataset;

      const pendingResolvers = internals.pendingDatasetResolvers.get(
        dataset.sourceFileId
      );
      if (pendingResolvers?.length) {
        pendingResolvers.forEach((resolve) => resolve(dataset.id));
        internals.pendingDatasetResolvers.delete(dataset.sourceFileId);
      }
    }

    return addedDataset;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(
      `Failed to add file to datasets store (duration: ${duration.toFixed(2)}ms)`,
      LogCategory.DATA,
      error
    );

    state.error = error instanceof Error ? error.message : 'Processing failed';
    throw error;
  } finally {
    endProcessing();
  }
}
