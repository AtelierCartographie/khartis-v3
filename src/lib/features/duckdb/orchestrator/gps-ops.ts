import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import { resolveGPSCoordinateColumns } from '$lib/features/commons/utils/geo-detector.utils';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import type { Table } from 'apache-arrow/Arrow';
import { registerTableMutationCallback } from '../cache/cache-manager';
import type {
  AnalysisResult,
  DuckDBDataset,
  GPSBounds,
  GPSColumns
} from '../types';

export type { GPSBounds, GPSColumns };

export interface DuckDBClientForGPS {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
}

export interface GPSValidationResult {
  isValid: boolean;
  possibleInversion: boolean;
  latColumn: string;
  lonColumn: string;
  latStats: { min: number; max: number; median: number } | null;
  lonStats: { min: number; max: number; median: number } | null;
  warning?: string;
}

interface GPSArrowTableResult {
  table: Table;
  latColumn: string;
  lonColumn: string;
}

const GPS_ARROW_CACHE_MAX_ENTRIES = 4;
const gpsArrowCache = new Map<string, GPSArrowTableResult>();
const gpsArrowCacheTableIndex = new Map<string, Set<string>>();

const inFlightGPSArrowLoads = new Map<string, Promise<GPSArrowTableResult>>();

function buildGPSArrowCacheKey(
  tableName: string,
  lat: string,
  lon: string
): string {
  return `${tableName}::${lat}::${lon}`;
}

function indexGPSArrowCacheEntry(tableName: string, key: string): void {
  let bucket = gpsArrowCacheTableIndex.get(tableName);
  if (!bucket) {
    bucket = new Set();
    gpsArrowCacheTableIndex.set(tableName, bucket);
  }
  bucket.add(key);
}

function evictOldestGPSArrowEntry(): void {
  const oldestKey = gpsArrowCache.keys().next().value;
  if (!oldestKey) return;
  gpsArrowCache.delete(oldestKey);
  for (const [tableName, bucket] of gpsArrowCacheTableIndex) {
    if (bucket.delete(oldestKey) && bucket.size === 0) {
      gpsArrowCacheTableIndex.delete(tableName);
    }
  }
}

function setGPSArrowCacheEntry(
  tableName: string,
  key: string,
  result: GPSArrowTableResult
): void {
  if (gpsArrowCache.has(key)) {
    gpsArrowCache.delete(key);
  } else if (gpsArrowCache.size >= GPS_ARROW_CACHE_MAX_ENTRIES) {
    evictOldestGPSArrowEntry();
  }
  gpsArrowCache.set(key, result);
  indexGPSArrowCacheEntry(tableName, key);
}

function invalidateGPSArrowCacheForTable(tableName: string): void {
  const bucket = gpsArrowCacheTableIndex.get(tableName);
  if (!bucket) return;
  for (const key of bucket) {
    gpsArrowCache.delete(key);
  }
  gpsArrowCacheTableIndex.delete(tableName);
}

registerTableMutationCallback((table: string) => {
  invalidateGPSArrowCacheForTable(table);
});

export async function validateGPSColumns(
  tableName: string,
  latCol: string,
  lonCol: string,
  Duck: DuckDBClientForGPS
): Promise<GPSValidationResult> {
  try {
    const escapedLat = escapeIdentifier(latCol);
    const escapedLon = escapeIdentifier(lonCol);
    const escapedTable = escapeIdentifier(tableName);
    const result = (await Duck.query(
      `SELECT
        MIN(TRY_CAST("${escapedLat}" AS DOUBLE)) as lat_min,
        MAX(TRY_CAST("${escapedLat}" AS DOUBLE)) as lat_max,
        MEDIAN(TRY_CAST("${escapedLat}" AS DOUBLE)) as lat_median,
        MIN(TRY_CAST("${escapedLon}" AS DOUBLE)) as lon_min,
        MAX(TRY_CAST("${escapedLon}" AS DOUBLE)) as lon_max,
        MEDIAN(TRY_CAST("${escapedLon}" AS DOUBLE)) as lon_median
      FROM "${escapedTable}"
      WHERE TRY_CAST("${escapedLat}" AS DOUBLE) IS NOT NULL
        AND TRY_CAST("${escapedLon}" AS DOUBLE) IS NOT NULL`,
      { format: 'array' }
    )) as Array<{
      lat_min: number;
      lat_max: number;
      lat_median: number;
      lon_min: number;
      lon_max: number;
      lon_median: number;
    }>;

    if (result.length === 0 || result[0].lat_min === null) {
      return {
        isValid: false,
        possibleInversion: false,
        latColumn: latCol,
        lonColumn: lonCol,
        latStats: null,
        lonStats: null,
        warning: m.gps_warning_no_valid_coordinates()
      };
    }

    const stats = result[0];
    const latStats = {
      min: stats.lat_min,
      max: stats.lat_max,
      median: stats.lat_median
    };
    const lonStats = {
      min: stats.lon_min,
      max: stats.lon_max,
      median: stats.lon_median
    };

    const latInRange = stats.lat_min >= -90 && stats.lat_max <= 90;
    const lonInRange = stats.lon_min >= -180 && stats.lon_max <= 180;

    const latLooksLikeLon =
      stats.lat_min >= -180 &&
      stats.lat_max <= 180 &&
      (stats.lat_max > 90 || stats.lat_min < -90);
    const lonLooksLikeLat = stats.lon_min >= -90 && stats.lon_max <= 90;

    const latAbsMax = Math.max(
      Math.abs(stats.lat_min),
      Math.abs(stats.lat_max)
    );
    const lonAbsMin = Math.min(
      Math.abs(stats.lon_min),
      Math.abs(stats.lon_max)
    );
    const lonAbsMax = Math.max(
      Math.abs(stats.lon_min),
      Math.abs(stats.lon_max)
    );
    const magnitudeSwap =
      latInRange &&
      lonInRange &&
      latAbsMax < 15 &&
      lonAbsMin > 40 &&
      lonAbsMax < 90;

    const possibleInversion =
      (latLooksLikeLon && lonLooksLikeLat) || magnitudeSwap;

    let warning: string | undefined;

    if (possibleInversion) {
      warning = m.gps_warning_inversion({
        latColumn: latCol,
        lonColumn: lonCol,
        latMin: stats.lat_min.toFixed(2),
        latMax: stats.lat_max.toFixed(2)
      });
    } else if (!latInRange) {
      warning = m.gps_warning_lat_out_of_range({
        latColumn: latCol,
        latMin: stats.lat_min.toFixed(2),
        latMax: stats.lat_max.toFixed(2)
      });
    } else if (!lonInRange) {
      warning = m.gps_warning_lon_out_of_range({
        lonColumn: lonCol,
        lonMin: stats.lon_min.toFixed(2),
        lonMax: stats.lon_max.toFixed(2)
      });
    }

    const isValid = latInRange && lonInRange;

    return {
      isValid,
      possibleInversion,
      latColumn: latCol,
      lonColumn: lonCol,
      latStats,
      lonStats,
      warning
    };
  } catch (error) {
    logger.error('Failed to validate GPS columns', LogCategory.DATA, {
      tableName,
      latCol,
      lonCol,
      error
    });
    return {
      isValid: false,
      possibleInversion: false,
      latColumn: latCol,
      lonColumn: lonCol,
      latStats: null,
      lonStats: null,
      warning: m.gps_warning_validation_error()
    };
  }
}

export function detectGPSColumns(
  columns: AnalysisResult[],
  geoDetection?: DuckDBDataset['geoDetection']
): GPSColumns | null {
  return resolveGPSCoordinateColumns(columns, geoDetection);
}

export async function getGPSArrowTable(
  dataset: DuckDBDataset,
  Duck: DuckDBClientForGPS,
  getArrowTableDirect: (tableName: string) => Promise<Table>
): Promise<GPSArrowTableResult> {
  if (!dataset.gpsMode || !dataset.gpsColumns) {
    throw new DataValidationError(
      m.gps_error_not_in_gps_mode({ id: dataset.id }),
      'gpsMode',
      { datasetId: dataset.id }
    );
  }

  const { lat, lon } = dataset.gpsColumns;
  const requestKey = buildGPSArrowCacheKey(dataset.tableName, lat, lon);
  const cached = gpsArrowCache.get(requestKey);

  if (cached) {
    return cached;
  }

  const existingRequest = inFlightGPSArrowLoads.get(requestKey);

  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const gpsTable = `gps_${dataset.tableName.replace(/[^a-zA-Z0-9_]/g, '_')}_${dataset.id.replace(/[^a-zA-Z0-9_]/g, '_')}_${Math.round(performance.now()).toString(36)}`;
    const escapedLon = escapeIdentifier(lon);
    const escapedLat = escapeIdentifier(lat);
    const escapedTableName = escapeIdentifier(dataset.tableName);

    // TRY_CAST to DOUBLE handles VARCHAR columns with leading whitespace
    // (e.g., CSV ` 2.497` after semicolon delimiter). Without it, BETWEEN
    // uses string comparison where " 2.49" < "-180" → 0 rows.
    await Duck.query(`
      CREATE TEMP TABLE "${gpsTable}" AS
      SELECT
        *,
        ST_Point(
          TRY_CAST("${escapedLon}" AS DOUBLE),
          TRY_CAST("${escapedLat}" AS DOUBLE)
        ) AS geom
      FROM "${escapedTableName}"
      WHERE TRY_CAST("${escapedLat}" AS DOUBLE) IS NOT NULL
        AND TRY_CAST("${escapedLon}" AS DOUBLE) IS NOT NULL
        AND TRY_CAST("${escapedLat}" AS DOUBLE) BETWEEN -90 AND 90
        AND TRY_CAST("${escapedLon}" AS DOUBLE) BETWEEN -180 AND 180
    `);

    try {
      const arrowTable = await getArrowTableDirect(gpsTable);
      const result: GPSArrowTableResult = {
        table: arrowTable,
        latColumn: lat,
        lonColumn: lon
      };

      setGPSArrowCacheEntry(dataset.tableName, requestKey, result);
      return result;
    } finally {
      await Duck.query(`DROP TABLE IF EXISTS "${gpsTable}"`);
    }
  })();

  inFlightGPSArrowLoads.set(requestKey, request);

  try {
    return await request;
  } finally {
    if (inFlightGPSArrowLoads.get(requestKey) === request) {
      inFlightGPSArrowLoads.delete(requestKey);
    }
  }
}

export async function getGPSBounds(
  dataset: DuckDBDataset,
  Duck: DuckDBClientForGPS
): Promise<GPSBounds | null> {
  // In tabular-gps mode (no join), gpsColumns may not be set yet —
  // fall back to the dataset geo detection and then to column-name heuristics.
  const gpsColumns =
    dataset.gpsColumns ??
    detectGPSColumns(dataset.columns, dataset.geoDetection);
  if (!gpsColumns) {
    return null;
  }

  const { lat, lon } = gpsColumns;

  try {
    const escapedLat = escapeIdentifier(lat);
    const escapedLon = escapeIdentifier(lon);
    const escapedTableName = escapeIdentifier(dataset.tableName);
    const result = (await Duck.query(
      `SELECT
        MIN(TRY_CAST("${escapedLon}" AS DOUBLE)) as min_lon,
        MIN(TRY_CAST("${escapedLat}" AS DOUBLE)) as min_lat,
        MAX(TRY_CAST("${escapedLon}" AS DOUBLE)) as max_lon,
        MAX(TRY_CAST("${escapedLat}" AS DOUBLE)) as max_lat,
        COUNT(*) as valid_count
      FROM "${escapedTableName}"
      WHERE TRY_CAST("${escapedLat}" AS DOUBLE) IS NOT NULL
        AND TRY_CAST("${escapedLon}" AS DOUBLE) IS NOT NULL
        AND TRY_CAST("${escapedLat}" AS DOUBLE) BETWEEN -90 AND 90
        AND TRY_CAST("${escapedLon}" AS DOUBLE) BETWEEN -180 AND 180`,
      { format: 'array' }
    )) as Array<{
      min_lon: number;
      min_lat: number;
      max_lon: number;
      max_lat: number;
      valid_count: number;
    }>;

    if (result.length === 0) {
      return null;
    }

    const bounds = result[0];

    if (bounds.valid_count === 0) {
      return null;
    }

    if (
      bounds.min_lon === null ||
      bounds.min_lat === null ||
      bounds.max_lon === null ||
      bounds.max_lat === null
    ) {
      return null;
    }

    const computedBounds: GPSBounds = {
      minLon: bounds.min_lon,
      minLat: bounds.min_lat,
      maxLon: bounds.max_lon,
      maxLat: bounds.max_lat
    };

    return computedBounds;
  } catch (error) {
    logger.error('Failed to get GPS bounds', LogCategory.MAP, {
      datasetId: dataset.id,
      tableName: dataset.tableName,
      latColumn: lat,
      lonColumn: lon,
      error
    });
    return null;
  }
}
