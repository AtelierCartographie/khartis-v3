import type { DatasetResult } from '$lib/features/data-pipeline';
import { isGeometryColumnType } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { GEOID_SCORE_THRESHOLD } from '../components/advanced-data-table/column-type-styles';
import { EXCLUDED_COLUMNS } from '../constants/data.constants';
import {
  buildGeoDetection,
  type GeoDetectionCatalogMatch,
  type GeoDetectionColumn,
  type GeoDetectionResult
} from '../utils/geo-detection.utils';
import { LogCategory, logger } from '../utils/logger';
import { SEMIO_TYPES } from '../utils/semio-detector.utils';

async function matchCatalog(
  tableName: string,
  columns: string[]
): Promise<GeoDetectionCatalogMatch[]> {
  if (columns.length === 0) return [];
  try {
    await basemapService.ensureAttributesLoaded();
    return await duckDBOrchestrator.matchColumnsAgainstCatalog(
      tableName,
      columns
    );
  } catch (error) {
    // Without the catalog index (first offline use), the universal proxies still apply.
    logger.warn('Catalog geo matching unavailable', LogCategory.DATA, {
      tableName,
      error
    });
    return [];
  }
}

export async function detectGeoColumns(
  tableName: string,
  options: { hasGeometry?: boolean } = {}
): Promise<GeoDetectionResult> {
  const analysis = await duckDBOrchestrator.getFullAnalysis(tableName);
  const columns = analysis.filter(
    (column) =>
      !(EXCLUDED_COLUMNS as readonly string[]).includes(column.name) &&
      !isGeometryColumnType(String(column.type ?? ''))
  );

  const catalogCandidates = columns
    .filter(
      (column) =>
        column.type_simple === 'string' ||
        (column.semioType === SEMIO_TYPES.GEOID &&
          (column.semioScore ?? 0) >= GEOID_SCORE_THRESHOLD)
    )
    .map((column) => column.name);

  const detectionColumns: GeoDetectionColumn[] = columns.map((column) => ({
    name: column.name,
    semioType: column.semioType,
    semioScore: column.semioScore,
    shareUniques:
      typeof column.share_uniques === 'number'
        ? column.share_uniques
        : undefined
  }));

  return buildGeoDetection(
    detectionColumns,
    await matchCatalog(tableName, catalogCandidates),
    options
  );
}

export async function withGeoDetection(
  dataset: DatasetResult
): Promise<DatasetResult> {
  if (!dataset.tableName) return dataset;

  try {
    const geoDetection = await detectGeoColumns(dataset.tableName, {
      hasGeometry: Boolean(dataset.geometry)
    });
    return {
      ...dataset,
      geoDetection,
      analysis: {
        columns: dataset.analysis?.columns ?? dataset.columns,
        rowCount: dataset.analysis?.rowCount ?? dataset.rowCount,
        warnings: dataset.analysis?.warnings ?? [],
        suggestedGeoColumn: dataset.analysis?.suggestedGeoColumn,
        geoColumns: geoDetection.geoColumns,
        hasGeoData:
          Boolean(dataset.analysis?.hasGeoData) || geoDetection.hasGeoColumns
      }
    };
  } catch (error) {
    logger.warn('Geographic column detection failed', LogCategory.DATA, {
      tableName: dataset.tableName,
      error
    });
    return dataset;
  }
}
