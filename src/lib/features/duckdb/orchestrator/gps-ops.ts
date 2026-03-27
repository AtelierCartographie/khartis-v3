import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import type { Table } from 'apache-arrow/Arrow';
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

export async function validateGPSColumns(
  tableName: string,
  latCol: string,
  lonCol: string,
  Duck: DuckDBClientForGPS
): Promise<GPSValidationResult> {
  const start = performance.now();

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

    const possibleInversion = latLooksLikeLon && lonLooksLikeLat;

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

    logger.debug('GPS columns validated', LogCategory.DATA, {
      tableName,
      latCol,
      lonCol,
      isValid,
      possibleInversion,
      latStats,
      lonStats,
      durationMs: (performance.now() - start).toFixed(2)
    });

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

export function detectGPSColumns(columns: AnalysisResult[]): GPSColumns | null {
  const latColumn = columns.find((col) =>
    /^(lat|latitude|y_coord|y|lat_dd|latitude_dd|geo_lat)$/i.test(col.name)
  );
  const lonColumn = columns.find((col) =>
    /^(lon|long|longitude|x_coord|x|lon_dd|longitude_dd|lng|geo_lon)$/i.test(
      col.name
    )
  );

  if (latColumn && lonColumn) {
    return { lat: latColumn.name, lon: lonColumn.name };
  }

  return null;
}

export async function getGPSArrowTable(
  dataset: DuckDBDataset,
  Duck: DuckDBClientForGPS,
  getArrowTableDirect: (tableName: string) => Promise<Table>
): Promise<{
  table: Table;
  latColumn: string;
  lonColumn: string;
}> {
  const start = performance.now();

  if (!dataset.gpsMode || !dataset.gpsColumns) {
    throw new Error(m.gps_error_not_in_gps_mode({ id: dataset.id }));
  }

  const { lat, lon } = dataset.gpsColumns;

  logger.info('Creating GPS Arrow table for rendering', LogCategory.MAP, {
    datasetId: dataset.id,
    tableName: dataset.tableName,
    latColumn: lat,
    lonColumn: lon
  });

  const gpsView = `gps_${dataset.tableName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const escapedLon = escapeIdentifier(lon);
  const escapedLat = escapeIdentifier(lat);
  const escapedTableName = escapeIdentifier(dataset.tableName);

  // TRY_CAST to DOUBLE handles VARCHAR columns with leading whitespace
  // (e.g., CSV ` 2.497` after semicolon delimiter). Without it, BETWEEN
  // uses string comparison where " 2.49" < "-180" → 0 rows.
  await Duck.query(`
    CREATE OR REPLACE VIEW "${gpsView}" AS
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

  const arrowTable = await getArrowTableDirect(gpsView);

  logger.success('GPS Arrow table created', LogCategory.MAP, {
    gpsView,
    rows: arrowTable.numRows,
    latColumn: lat,
    lonColumn: lon,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return {
    table: arrowTable,
    latColumn: lat,
    lonColumn: lon
  };
}

export async function getGPSBounds(
  dataset: DuckDBDataset,
  Duck: DuckDBClientForGPS
): Promise<GPSBounds | null> {
  const start = performance.now();

  if (!dataset.gpsMode) return null;

  // In tabular-gps mode (no join), gpsColumns may not be set yet —
  // fall back to auto-detecting GPS columns by name from the dataset schema.
  const gpsColumns = dataset.gpsColumns ?? detectGPSColumns(dataset.columns);
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
      logger.warn('GPS bounds query returned no results', LogCategory.MAP, {
        datasetId: dataset.id,
        tableName: dataset.tableName
      });
      return null;
    }

    const bounds = result[0];

    if (bounds.valid_count === 0) {
      logger.warn('No valid GPS coordinates found', LogCategory.MAP, {
        datasetId: dataset.id,
        tableName: dataset.tableName,
        latColumn: lat,
        lonColumn: lon
      });
      return null;
    }

    if (
      bounds.min_lon === null ||
      bounds.min_lat === null ||
      bounds.max_lon === null ||
      bounds.max_lat === null
    ) {
      logger.warn('GPS bounds contain null values', LogCategory.MAP, {
        datasetId: dataset.id,
        bounds,
        validCount: bounds.valid_count
      });
      return null;
    }

    const computedBounds: GPSBounds = {
      minLon: bounds.min_lon,
      minLat: bounds.min_lat,
      maxLon: bounds.max_lon,
      maxLat: bounds.max_lat
    };

    logger.success('GPS bounds computed', LogCategory.MAP, {
      datasetId: dataset.id,
      bounds: computedBounds,
      validCoordinates: bounds.valid_count,
      durationMs: (performance.now() - start).toFixed(2)
    });

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
