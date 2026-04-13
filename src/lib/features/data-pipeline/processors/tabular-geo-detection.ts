import { GeoColumnDetector } from '$lib/features/commons/utils/geo-detector.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import type { DatasetResult } from '../types';

const GEO_DETECTION_SAMPLE_LIMIT = 200;
const GEO_NAME_HINT =
  /lat|lon|lng|coord|geo|point|location|wkt|iso|code|country|region|dept|commune|province|state|city|name|admin|id/i;

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
  if (dataset.geometry) {
    return dataset;
  }

  try {
    const hintedColumns = dataset.columns
      .filter(
        (column) => GEO_NAME_HINT.test(column.name) || column.type === 'text'
      )
      .map((column) => column.name);
    const columnsToCheck =
      hintedColumns.length > 0
        ? hintedColumns
        : dataset.columns.map((column) => column.name);
    const geoDetection = await detectGeoColumnsFromTable(
      dataset.tableName,
      columnsToCheck
    );

    if (!geoDetection) {
      return dataset;
    }

    dataset.geoDetection = geoDetection;
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
  } catch (error) {
    logger.warn(
      'Failed to compute geo detection for tabular dataset',
      LogCategory.DATA,
      { tableName: dataset.tableName, error }
    );
  }

  return dataset;
}
