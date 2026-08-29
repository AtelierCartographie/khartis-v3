import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';
import { bigIntReplacer } from './clone.utils';
import { escapeIdentifier, escapeSqlString } from './sanitize.utils';
import { generateFilename } from './string.utils';
import { MIME, GEOJSON_TYPE } from '../constants';
import { JOINED_BASEMAP_COLUMNS } from '../constants/data.constants';
import { isDatasetGeometryColumn } from './geometry-column.utils';
import { isGeometryColumnType } from '$lib/features/duckdb/utils/geometry-column.utils';
import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/pipeline.errors';

const CSV_BOM = '\uFEFF';
const CSV_MIME_TYPE_UTF8 = `${MIME.CSV};charset=utf-8`;
const DOWNLOAD_URL_REVOKE_DELAY_MS = 30000;
const SOURCE_DATASET_COLUMN = '_source_dataset';

export const generateExportFilename = generateFilename;

export async function exportToCsv(
  data: Record<string, unknown>[] | string,
  headers?: string[]
): Promise<Blob> {
  if (typeof data === 'string') {
    const tableName = data;

    await initDuckDB();
    if (!Duck) {
      throw new DuckDBError(m.error_duckdb_not_initialized());
    }

    const csvString = await Duck.copy_to_csv_as_string(tableName, {
      delimiter: ',',
      header: true
    });

    return new Blob([CSV_BOM + csvString], { type: CSV_MIME_TYPE_UTF8 });
  }

  const rows = data as Record<string, unknown>[];
  const fields = headers || (rows.length > 0 ? Object.keys(rows[0]) : []);

  const csvRows: string[] = [];

  csvRows.push(fields.map(escapeCSVField).join(','));

  for (const row of rows) {
    const values = fields.map((field) => {
      const value = row[field];
      return escapeCSVField(value);
    });
    csvRows.push(values.join(','));
  }

  const csv = csvRows.join('\n');
  return new Blob([CSV_BOM + csv], { type: CSV_MIME_TYPE_UTF8 });
}

function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export async function exportDatasetToCsv(
  dataset: ProcessedDataset
): Promise<Blob> {
  if (dataset.duckdbTableName) {
    await initDuckDB();
    if (!Duck) {
      throw new DuckDBError(m.error_duckdb_not_initialized());
    }

    const viewName = `export_view_${Date.now()}`;
    const nonGeomColumnNames = await getDuckDbExportableColumnNames(dataset);
    if (nonGeomColumnNames.length === 0) {
      throw new DataValidationError(m.error_no_valid_data_export(), 'columns', {
        datasetId: dataset.id,
        format: 'csv'
      });
    }

    const nonGeomColumns = nonGeomColumnNames
      .map((columnName) => `"${escapeIdentifier(columnName)}"`)
      .join(', ');

    try {
      await Duck.query(`
        CREATE TEMPORARY VIEW "${viewName}" AS
        SELECT ${nonGeomColumns} FROM "${escapeIdentifier(dataset.duckdbTableName!)}"
      `);

      const blob = await exportToCsv(viewName);

      await Duck.query(`DROP VIEW IF EXISTS "${viewName}"`);

      return blob;
    } catch (error) {
      if (Duck) {
        await Duck.query(`DROP VIEW IF EXISTS "${viewName}"`).catch(() => {});
      }
      throw error;
    }
  }

  const headers = dataset.columns
    .filter((col) => !isDatasetGeometryColumn(dataset, col))
    .map((col) => col.name);
  if (headers.length === 0) {
    throw new DataValidationError(m.error_no_valid_data_export(), 'columns', {
      datasetId: dataset.id,
      format: 'csv'
    });
  }

  const data = dataset.data.map((row) => {
    const cleanRow: Record<string, unknown> = {};
    headers.forEach((header) => {
      cleanRow[header] = row[header];
    });
    return cleanRow;
  });

  return exportToCsv(data, headers);
}

function getExportableColumnNames(dataset: ProcessedDataset): string[] {
  return dataset.columns
    .filter((col) => !isDatasetGeometryColumn(dataset, col))
    .map((col) => col.name);
}

async function getDuckDbExportableColumnNames(
  dataset: ProcessedDataset
): Promise<string[]> {
  if (!dataset.duckdbTableName || !Duck) {
    return getExportableColumnNames(dataset);
  }

  const tableInfo = await Duck.describe_table(dataset.duckdbTableName);
  const datasetColumns = new Map(
    dataset.columns.map((column) => [column.name, column])
  );
  const joinedBasemapColumns = new Set<string>(JOINED_BASEMAP_COLUMNS);

  return tableInfo.name.filter((columnName, index) => {
    if (joinedBasemapColumns.has(columnName)) {
      return false;
    }

    const columnType = String(tableInfo.type[index] ?? '').toUpperCase();
    if (isGeometryColumnType(columnType)) {
      return false;
    }

    const datasetColumn = datasetColumns.get(columnName);
    return !datasetColumn || !isDatasetGeometryColumn(dataset, datasetColumn);
  });
}

function resolveSourceDatasetColumnName(columnNames: string[]): string {
  const usedNames = new Set(columnNames.map((name) => name.toLowerCase()));
  if (!usedNames.has(SOURCE_DATASET_COLUMN)) {
    return SOURCE_DATASET_COLUMN;
  }

  let index = 2;
  let candidate = `${SOURCE_DATASET_COLUMN}_${index}`;
  while (usedNames.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${SOURCE_DATASET_COLUMN}_${index}`;
  }
  return candidate;
}

function buildAlignedUnionSelect(
  dataset: ProcessedDataset,
  allHeaders: string[],
  sourceDatasetColumn: string,
  exportableColumns: ReadonlySet<string>
): string {
  const selectColumns = allHeaders.map((columnName) => {
    const escapedColumnName = escapeIdentifier(columnName);
    return exportableColumns.has(columnName)
      ? `"${escapedColumnName}"`
      : `NULL AS "${escapedColumnName}"`;
  });
  const escapedName = escapeSqlString(dataset.name);

  const selectList = [
    ...selectColumns,
    `'${escapedName}' as "${escapeIdentifier(sourceDatasetColumn)}"`
  ];

  return `SELECT ${selectList.join(', ')} FROM "${escapeIdentifier(dataset.duckdbTableName!)}"`;
}

export function exportToGeoJson(data: unknown): Blob {
  const dataObj = data as Record<string, unknown>;

  let geojson: unknown;

  if (
    dataObj.type === GEOJSON_TYPE.FEATURE_COLLECTION ||
    dataObj.type === GEOJSON_TYPE.FEATURE
  ) {
    geojson = dataObj;
  } else if (Array.isArray(data)) {
    geojson = {
      type: GEOJSON_TYPE.FEATURE_COLLECTION,
      features: data
        .filter(
          (item: Record<string, unknown>) =>
            item.type === GEOJSON_TYPE.FEATURE ||
            (item.geometry && item.properties)
        )
        .map((item: Record<string, unknown>) => {
          if (item.type === GEOJSON_TYPE.FEATURE) return item;
          return {
            type: GEOJSON_TYPE.FEATURE,
            geometry: item.geometry,
            properties: (item.properties as Record<string, unknown>) || {}
          };
        })
    };
  } else {
    throw new DataValidationError(
      m.error_invalid_data_format_geojson(),
      'format',
      { format: 'geojson' }
    );
  }

  const jsonString = JSON.stringify(geojson, bigIntReplacer, 2);
  return new Blob([jsonString], { type: MIME.GEOJSON });
}

export function exportToJson(data: unknown): Blob {
  const jsonString = JSON.stringify(data, bigIntReplacer, 2);
  return new Blob([jsonString], { type: MIME.JSON });
}

export async function exportProcessedDatasets(
  datasets: ProcessedDataset[],
  format: 'csv' | 'geojson' | 'json' = 'json'
): Promise<Blob> {
  if (datasets.length === 0) {
    throw new DataValidationError(m.error_no_datasets_to_export(), 'datasets', {
      format
    });
  }

  if (format === 'csv') {
    if (datasets.length === 1) {
      return exportDatasetToCsv(datasets[0]);
    }

    const haveDuckDBTables = datasets.every((d) => d.duckdbTableName);

    if (haveDuckDBTables) {
      await initDuckDB();
      if (!Duck) {
        throw new DuckDBError(m.error_duckdb_not_initialized());
      }

      const unionViewName = `export_union_${Date.now()}`;

      try {
        const exportableColumnsByDataset = await Promise.all(
          datasets.map(getDuckDbExportableColumnNames)
        );
        const allHeaders = Array.from(
          new Set(exportableColumnsByDataset.flat())
        );
        const sourceDatasetColumn = resolveSourceDatasetColumnName(allHeaders);
        const unionParts = datasets.map((dataset, index) => {
          return buildAlignedUnionSelect(
            dataset,
            allHeaders,
            sourceDatasetColumn,
            new Set(exportableColumnsByDataset[index])
          );
        });

        const unionQuery = `
          CREATE TEMPORARY VIEW "${unionViewName}" AS
          ${unionParts.join(' UNION ALL ')}
        `;

        await Duck.query(unionQuery);
        const blob = await exportToCsv(unionViewName);
        await Duck.query(`DROP VIEW IF EXISTS "${unionViewName}"`);

        return blob;
      } catch (error) {
        if (Duck) {
          await Duck.query(`DROP VIEW IF EXISTS "${unionViewName}"`).catch(
            () => {}
          );
        }
        throw error;
      }
    }

    const allData: Record<string, unknown>[] = [];
    const allHeaders = Array.from(
      new Set(
        datasets.flatMap((d) =>
          d.columns
            .filter((col) => !isDatasetGeometryColumn(d, col))
            .map((col) => col.name)
        )
      )
    );
    const sourceDatasetColumn = resolveSourceDatasetColumnName(allHeaders);
    for (const dataset of datasets) {
      const dataWithSource = dataset.data.map((row) => ({
        ...row,
        [sourceDatasetColumn]: dataset.name
      }));
      allData.push(...dataWithSource);
    }

    allHeaders.push(sourceDatasetColumn);

    return exportToCsv(allData, allHeaders);
  }

  if (format === 'geojson') {
    const allFeatures: unknown[] = [];
    const allPropertyColumns = Array.from(
      new Set(datasets.flatMap(getExportableColumnNames))
    );
    const sourceDatasetColumn =
      resolveSourceDatasetColumnName(allPropertyColumns);

    for (const dataset of datasets) {
      if (!dataset.geometry && !dataset.analysis.hasGeoData) {
        continue;
      }

      const geometryColumn = dataset.columns.find((col) =>
        isDatasetGeometryColumn(dataset, col)
      );
      dataset.data.forEach((row) => {
        const properties: Record<string, unknown> = {};
        dataset.columns
          .filter((col) => !isDatasetGeometryColumn(dataset, col))
          .forEach((col) => {
            properties[col.name] = row[col.name];
          });
        properties[sourceDatasetColumn] = dataset.name;

        allFeatures.push({
          type: 'Feature' as const,
          geometry: geometryColumn
            ? normalizeGeoJsonGeometry(row[geometryColumn.name])
            : null,
          properties
        });
      });
    }

    if (allFeatures.length === 0) {
      throw new DataValidationError(
        m.error_no_geometric_data_export(),
        'geometry',
        { format: 'geojson' }
      );
    }

    return exportToGeoJson({
      type: 'FeatureCollection',
      features: allFeatures
    });
  }

  const exportData = {
    exportDate: new Date().toISOString(),
    datasets: datasets.map((d) => ({
      id: d.id,
      name: d.name,
      rowCount: d.rowCount,
      columns: d.columns.map((col) => ({
        name: col.name,
        type: col.type,
        nullable: col.nullable
      })),
      data: d.data,
      geometry: d.geometry,
      metadata: d.metadata
    }))
  };

  return exportToJson(exportData);
}

function isGeoJsonGeometryValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const geometry = value as { type?: unknown; coordinates?: unknown };
  return (
    typeof geometry.type === 'string' && Array.isArray(geometry.coordinates)
  );
}

function normalizeGeoJsonGeometry(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return isGeoJsonGeometryValue(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isGeoJsonGeometryValue(value) ? value : null;
}

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, DOWNLOAD_URL_REVOKE_DELAY_MS);
}
