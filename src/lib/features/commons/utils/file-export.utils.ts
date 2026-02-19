import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';
import { escapeIdentifier, escapeSqlString } from './sanitize.utils';
import { generateFilename } from './string.utils';
import { MIME, GEOJSON_TYPE } from '../constants';
import { COLUMN_TYPE_GEOMETRY } from '../constants/data.constants';

const CSV_BOM = '\uFEFF';
const CSV_MIME_TYPE_UTF8 = `${MIME.CSV};charset=utf-8`;

export const generateExportFilename = generateFilename;

export async function exportToCsv(
  data: Record<string, unknown>[] | string,
  headers?: string[]
): Promise<Blob> {
  if (typeof data === 'string') {
    const tableName = data;

    await initDuckDB();
    if (!Duck) {
      throw new Error(m.error_duckdb_not_initialized());
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
      throw new Error(m.error_duckdb_not_initialized());
    }

    const viewName = `export_view_${Date.now()}`;
    const nonGeomColumns = dataset.columns
      .filter((col) => col.type !== COLUMN_TYPE_GEOMETRY)
      .map((col) => `"${escapeIdentifier(col.name)}"`)
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
    .filter((col) => col.type !== COLUMN_TYPE_GEOMETRY)
    .map((col) => col.name);

  const data = dataset.data.map((row) => {
    const cleanRow: Record<string, unknown> = {};
    headers.forEach((header) => {
      cleanRow[header] = row[header];
    });
    return cleanRow;
  });

  return exportToCsv(data, headers);
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
    throw new Error(m.error_invalid_data_format_geojson());
  }

  const jsonString = JSON.stringify(geojson, null, 2);
  return new Blob([jsonString], { type: MIME.GEOJSON });
}

export function exportToJson(data: unknown): Blob {
  const jsonString = JSON.stringify(data, null, 2);
  return new Blob([jsonString], { type: MIME.JSON });
}

async function exportDatasetsToCsvWithGeometry(
  datasets: ProcessedDataset[]
): Promise<Blob> {
  const allData: Record<string, unknown>[] = [];

  for (const dataset of datasets) {
    for (const row of dataset.data) {
      const exportRow: Record<string, unknown> = {};

      for (const col of dataset.columns) {
        if (col.type === COLUMN_TYPE_GEOMETRY) {
          const geometry = row[col.name];
          if (geometry && typeof geometry === 'object') {
            exportRow['geometry_wkt'] = geometryToWkt(geometry);
          }
        } else {
          exportRow[col.name] = row[col.name];
        }
      }

      if (datasets.length > 1) {
        exportRow['_source_dataset'] = dataset.name;
      }

      allData.push(exportRow);
    }
  }

  const allHeaders = Array.from(
    new Set(allData.flatMap((row) => Object.keys(row)))
  );

  return exportToCsv(allData, allHeaders);
}

function geometryToWkt(geometry: unknown): string {
  if (!geometry || typeof geometry !== 'object') {
    return '';
  }

  const geom = geometry as { type?: string; coordinates?: unknown };
  const type = geom.type;
  const coords = geom.coordinates;

  if (!type || !coords) {
    return '';
  }

  switch (type) {
    case GEOJSON_TYPE.POINT:
      return `POINT(${formatCoords(coords)})`;
    case GEOJSON_TYPE.MULTI_POINT:
      return `MULTIPOINT(${formatMultiCoords(coords as unknown[][])})`;
    case GEOJSON_TYPE.LINE_STRING:
      return `LINESTRING(${formatLineCoords(coords as unknown[])})`;
    case GEOJSON_TYPE.MULTI_LINE_STRING:
      return `MULTILINESTRING(${formatMultiLineCoords(coords as unknown[][])})`;
    case GEOJSON_TYPE.POLYGON:
      return `POLYGON(${formatPolygonCoords(coords as unknown[][])})`;
    case GEOJSON_TYPE.MULTI_POLYGON:
      return `MULTIPOLYGON(${formatMultiPolygonCoords(coords as unknown[][][])})`;
    default:
      return JSON.stringify(geometry);
  }
}

function formatCoords(coords: unknown): string {
  if (Array.isArray(coords) && coords.length >= 2) {
    return `${coords[0]} ${coords[1]}`;
  }
  return '';
}

function formatMultiCoords(coords: unknown[][]): string {
  return coords.map((c) => `(${formatCoords(c)})`).join(', ');
}

function formatLineCoords(coords: unknown[]): string {
  return coords.map((c) => formatCoords(c)).join(', ');
}

function formatMultiLineCoords(coords: unknown[][]): string {
  return coords.map((line) => `(${formatLineCoords(line)})`).join(', ');
}

function formatPolygonCoords(coords: unknown[][]): string {
  return coords.map((ring) => `(${formatLineCoords(ring)})`).join(', ');
}

function formatMultiPolygonCoords(coords: unknown[][][]): string {
  return coords.map((poly) => `(${formatPolygonCoords(poly)})`).join(', ');
}

export async function exportProcessedDatasets(
  datasets: ProcessedDataset[],
  format: 'csv' | 'geojson' | 'json' | 'csv-geo' = 'json'
): Promise<Blob> {
  if (datasets.length === 0) {
    throw new Error(m.error_no_datasets_to_export());
  }

  if (format === 'csv-geo') {
    return exportDatasetsToCsvWithGeometry(datasets);
  }

  if (format === 'csv') {
    if (datasets.length === 1) {
      return exportDatasetToCsv(datasets[0]);
    }

    const haveDuckDBTables = datasets.every((d) => d.duckdbTableName);

    if (haveDuckDBTables) {
      await initDuckDB();
      if (!Duck) {
        throw new Error(m.error_duckdb_not_initialized());
      }

      const unionViewName = `export_union_${Date.now()}`;

      try {
        const unionParts = datasets.map((dataset) => {
          const nonGeomColumns = dataset.columns
            .filter((col) => col.type !== COLUMN_TYPE_GEOMETRY)
            .map((col) => `"${escapeIdentifier(col.name)}"`)
            .join(', ');
          const escapedName = escapeSqlString(dataset.name);
          return `SELECT ${nonGeomColumns}, '${escapedName}' as _source_dataset FROM "${escapeIdentifier(dataset.duckdbTableName!)}"`;
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
    for (const dataset of datasets) {
      const dataWithSource = dataset.data.map((row) => ({
        ...row,
        _source_dataset: dataset.name
      }));
      allData.push(...dataWithSource);
    }

    const allHeaders = Array.from(
      new Set(
        datasets.flatMap((d) =>
          d.columns
            .filter((col) => col.type !== COLUMN_TYPE_GEOMETRY)
            .map((col) => col.name)
        )
      )
    );
    allHeaders.push('_source_dataset');

    return exportToCsv(allData, allHeaders);
  }

  if (format === 'geojson') {
    const allFeatures: unknown[] = [];

    for (const dataset of datasets) {
      if (!dataset.geometry) {
        continue;
      }

      const geometryColumn = dataset.columns.find(
        (col) => col.type === COLUMN_TYPE_GEOMETRY
      );
      dataset.data.forEach((row) => {
        const properties: Record<string, unknown> = {};
        dataset.columns
          .filter((col) => col.type !== COLUMN_TYPE_GEOMETRY)
          .forEach((col) => {
            properties[col.name] = row[col.name];
          });
        properties._source_dataset = dataset.name;

        allFeatures.push({
          type: 'Feature' as const,
          geometry: geometryColumn ? row[geometryColumn.name] : null,
          properties
        });
      });
    }

    if (allFeatures.length === 0) {
      throw new Error(m.error_no_geometric_data_export());
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

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
