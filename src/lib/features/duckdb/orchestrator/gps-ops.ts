import { LogCategory, logger } from '$lib/features/commons/utils/logger';
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
  logger.debug('Validating GPS columns', LogCategory.DATA, {
    tableName,
    latCol,
    lonCol
  });

  try {
    const result = (await Duck.query(
      `SELECT
        MIN("${latCol}") as lat_min,
        MAX("${latCol}") as lat_max,
        MEDIAN("${latCol}") as lat_median,
        MIN("${lonCol}") as lon_min,
        MAX("${lonCol}") as lon_max,
        MEDIAN("${lonCol}") as lon_median
      FROM "${tableName}"
      WHERE "${latCol}" IS NOT NULL AND "${lonCol}" IS NOT NULL`,
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
        warning: 'Aucune coordonnée valide trouvée'
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
      warning = `Les colonnes latitude et longitude semblent être inversées. La colonne "${latCol}" contient des valeurs hors de la plage [-90, 90] (min: ${stats.lat_min.toFixed(2)}, max: ${stats.lat_max.toFixed(2)}) tandis que "${lonCol}" est dans la plage de latitude.`;
    } else if (!latInRange) {
      warning = `La colonne latitude "${latCol}" contient des valeurs hors de la plage valide [-90, 90] (min: ${stats.lat_min.toFixed(2)}, max: ${stats.lat_max.toFixed(2)}).`;
    } else if (!lonInRange) {
      warning = `La colonne longitude "${lonCol}" contient des valeurs hors de la plage valide [-180, 180] (min: ${stats.lon_min.toFixed(2)}, max: ${stats.lon_max.toFixed(2)}).`;
    }

    const isValid = latInRange && lonInRange;

    logger.info('GPS columns validated', LogCategory.DATA, {
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
      warning: 'Erreur lors de la validation des coordonnées GPS'
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
    throw new Error(`Dataset ${dataset.id} is not in GPS mode`);
  }

  const { lat, lon } = dataset.gpsColumns;

  logger.info('Creating GPS Arrow table for rendering', LogCategory.MAP, {
    datasetId: dataset.id,
    tableName: dataset.tableName,
    latColumn: lat,
    lonColumn: lon
  });

  const gpsView = `gps_${dataset.tableName.replace(/[^a-zA-Z0-9_]/g, '_')}`;

  await Duck.query(`
    CREATE OR REPLACE VIEW "${gpsView}" AS
    SELECT
      *,
      ST_Point("${lon}", "${lat}") AS geom
    FROM "${dataset.tableName}"
    WHERE "${lat}" IS NOT NULL
      AND "${lon}" IS NOT NULL
      AND "${lat}" BETWEEN -90 AND 90
      AND "${lon}" BETWEEN -180 AND 180
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

  if (!dataset.gpsMode || !dataset.gpsColumns) {
    logger.debug(
      'GPS bounds skipped - dataset not in GPS mode',
      LogCategory.MAP,
      {
        datasetId: dataset.id,
        gpsMode: dataset.gpsMode,
        hasGpsColumns: !!dataset.gpsColumns
      }
    );
    return null;
  }

  const { lat, lon } = dataset.gpsColumns;

  logger.debug('Computing GPS bounds', LogCategory.MAP, {
    datasetId: dataset.id,
    tableName: dataset.tableName,
    latColumn: lat,
    lonColumn: lon
  });

  try {
    const result = (await Duck.query(
      `SELECT
        MIN("${lon}") as min_lon,
        MIN("${lat}") as min_lat,
        MAX("${lon}") as max_lon,
        MAX("${lat}") as max_lat,
        COUNT(*) as valid_count
      FROM "${dataset.tableName}"
      WHERE "${lat}" IS NOT NULL
        AND "${lon}" IS NOT NULL
        AND "${lat}" BETWEEN -90 AND 90
        AND "${lon}" BETWEEN -180 AND 180`,
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
