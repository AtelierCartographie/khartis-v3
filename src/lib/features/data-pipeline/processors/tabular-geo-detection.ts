import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { DatasetResult } from '../types';
import { GEO_COLUMN_TYPE } from '$lib/features/commons/constants/data.constants';
import { GeoColumnDetector } from '$lib/features/commons/utils/geo-detector.utils';

const GEO_DETECTION_SAMPLE_LIMIT = 200;
// Upstream pipeline hint only; the reference GPS x/y detection is the semio
// path (geolocation step -> resolveGPSCoordinateColumns on geolat/geolon).
const GEO_NAME_HINT =
  /lat|lon|lng|coord|geo|point|location|wkt|iso|code|country|region|dept|commune|province|state|city|admin/i;

const COORDINATE_GEO_TYPES = new Set<string>([
  GEO_COLUMN_TYPE.LATITUDE,
  GEO_COLUMN_TYPE.LONGITUDE,
  GEO_COLUMN_TYPE.COORDINATES
]);

async function detectGeoColumnsFromTable(tableName: string, columns: string[]) {
  if (columns.length === 0) {
    return undefined;
  }

  const escapedTable = escapeIdentifier(tableName);
  const escapedColumns = columns
    .map((column) => `"${escapeIdentifier(column)}"`)
    .join(', ');

  const sampleRows = (await Duck.query(
    `SELECT ${escapedColumns} FROM "${escapedTable}" LIMIT ${GEO_DETECTION_SAMPLE_LIMIT}`,
    { format: 'array' }
  )) as Array<Record<string, unknown>>;

  if (!sampleRows.length) {
    return undefined;
  }

  const matrix = sampleRows.map((row) => columns.map((column) => row[column]));

  return GeoColumnDetector.detectGeoColumns(columns, matrix, {
    sampleSize: Math.min(GEO_DETECTION_SAMPLE_LIMIT, matrix.length)
  });
}

export async function applyTabularGeoDetection(
  dataset: DatasetResult
): Promise<DatasetResult> {
  const isGeoDataset = Boolean(dataset.geometry);
  const geometryColumnName = dataset.geometry?.columnName;

  try {
    const candidateColumns = dataset.columns.filter((column) => {
      if (geometryColumnName && column.name === geometryColumnName)
        return false;
      return GEO_NAME_HINT.test(column.name) || column.type === 'text';
    });
    const fallbackColumns = dataset.columns.filter(
      (column) => !geometryColumnName || column.name !== geometryColumnName
    );
    const columnsToCheck =
      candidateColumns.length > 0
        ? candidateColumns.map((column) => column.name)
        : fallbackColumns.map((column) => column.name);
    const detection = await detectGeoColumnsFromTable(
      dataset.tableName,
      columnsToCheck
    );

    if (!detection) {
      return dataset;
    }

    const geoDetection = isGeoDataset
      ? {
          ...detection,
          geoColumns: detection.geoColumns.filter(
            (column) => !COORDINATE_GEO_TYPES.has(column.type as string)
          )
        }
      : detection;

    if (isGeoDataset && geoDetection.geoColumns.length === 0) {
      return dataset;
    }

    dataset.geoDetection = geoDetection;
    if (!isGeoDataset) {
      dataset.analysis = {
        columns: dataset.analysis?.columns ?? dataset.columns,
        hasGeoData:
          geoDetection.hasGeoColumns ?? dataset.analysis?.hasGeoData ?? false,
        geoColumns: geoDetection.geoColumns,
        rowCount: dataset.rowCount,
        warnings: [
          ...(dataset.analysis?.warnings ?? []),
          ...geoDetection.warnings
        ]
      };
    } else if (dataset.analysis) {
      dataset.analysis.warnings = [
        ...(dataset.analysis.warnings ?? []),
        ...geoDetection.warnings
      ];
    }
  } catch (error) {
    logger.error(
      'Failed to detect geographic columns from tabular dataset',
      LogCategory.DATA,
      error
    );
  }

  return dataset;
}
