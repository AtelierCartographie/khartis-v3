import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import type { GeoJSONFeature } from '$lib/types/data';
import {
  isGeoJSONFeature,
  isGeoJSONFeatureCollection,
  isTabularData
} from '$lib/types/data';
import type { UploadedFile } from '../store/create-project.types';
import { escapeSqlString } from './sanitize.utils';
import { generateFilename } from './string.utils';

export const generateExportFilename = generateFilename;

/**
 * Export data to CSV using DuckDB's COPY TO when table is available,
 * falling back to JavaScript implementation for in-memory data
 */
export async function exportToCsv(
  data: Record<string, unknown>[] | string,
  headers?: string[]
): Promise<Blob> {
  // If data is a DuckDB table name, use COPY TO
  if (typeof data === 'string') {
    const tableName = data;

    // Ensure DuckDB is initialized
    await initDuckDB();
    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    // Use DuckDB's COPY TO to generate CSV
    const csvString = await Duck.copy_to_csv_as_string(tableName, {
      delimiter: ',',
      header: true
    });

    // Add BOM for Excel compatibility
    const bom = '\uFEFF';
    return new Blob([bom + csvString], { type: 'text/csv;charset=utf-8' });
  }

  // Fallback: JavaScript implementation for in-memory data
  const rows = data as Record<string, unknown>[];
  const fields = headers || (rows.length > 0 ? Object.keys(rows[0]) : []);

  // Build CSV manually
  const csvRows: string[] = [];

  // Add header
  csvRows.push(fields.map(escapeCSVField).join(','));

  // Add data rows
  for (const row of rows) {
    const values = fields.map((field) => {
      const value = row[field];
      return escapeCSVField(value);
    });
    csvRows.push(values.join(','));
  }

  const csv = csvRows.join('\n');
  const bom = '\uFEFF';
  return new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
}

/**
 * Escape a field value for CSV format
 */
function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // Check if the field needs quotes
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    // Escape quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export async function exportDatasetToCsv(
  dataset: ProcessedDataset
): Promise<Blob> {
  // If dataset has a DuckDB table, use that
  if (dataset.duckdbTableName) {
    // Ensure DuckDB is initialized
    await initDuckDB();
    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    // Create a view that excludes geometry columns
    const viewName = `export_view_${Date.now()}`;
    const nonGeomColumns = dataset.columns
      .filter((col) => col.type !== 'geometry')
      .map((col) => `"${col.name}"`)
      .join(', ');

    try {
      // Create temporary view with only non-geometry columns
      await Duck.query(`
        CREATE TEMPORARY VIEW "${viewName}" AS
        SELECT ${nonGeomColumns} FROM "${dataset.duckdbTableName}"
      `);

      // Export using DuckDB
      const blob = await exportToCsv(viewName);

      // Clean up view
      await Duck.query(`DROP VIEW IF EXISTS "${viewName}"`);

      return blob;
    } catch (error) {
      // Clean up on error
      if (Duck) {
        await Duck.query(`DROP VIEW IF EXISTS "${viewName}"`).catch(() => {});
      }
      throw error;
    }
  }

  // Fallback to JavaScript implementation
  const headers = dataset.columns
    .filter((col) => col.type !== 'geometry')
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

export function exportDatasetToGeoJson(dataset: ProcessedDataset): Blob {
  if (!dataset.geometry) {
    throw new Error('Dataset does not contain geometry data');
  }

  const features = dataset.data.map((row) => {
    const properties: Record<string, unknown> = {};
    dataset.columns
      .filter((col) => col.type !== 'geometry')
      .forEach((col) => {
        properties[col.name] = row[col.name];
      });

    const geometryColumn = dataset.columns.find(
      (col) => col.type === 'geometry'
    );
    const geometry = geometryColumn ? row[geometryColumn.name] : null;

    return {
      type: 'Feature' as const,
      geometry,
      properties
    };
  });

  const geojson = {
    type: 'FeatureCollection',
    features
  };

  const jsonString = JSON.stringify(geojson, null, 2);
  return new Blob([jsonString], { type: 'application/geo+json' });
}

export function exportToGeoJson(data: unknown): Blob {
  const dataObj = data as Record<string, unknown>;

  let geojson: unknown;

  if (dataObj.type === 'FeatureCollection' || dataObj.type === 'Feature') {
    geojson = dataObj;
  } else if (Array.isArray(data)) {
    geojson = {
      type: 'FeatureCollection',
      features: data
        .filter(
          (item: Record<string, unknown>) =>
            item.type === 'Feature' || (item.geometry && item.properties)
        )
        .map((item: Record<string, unknown>) => {
          if (item.type === 'Feature') return item;
          return {
            type: 'Feature' as const,
            geometry: item.geometry,
            properties: (item.properties as Record<string, unknown>) || {}
          };
        })
    };
  } else {
    throw new Error('Invalid data format for GeoJSON export');
  }

  const jsonString = JSON.stringify(geojson, null, 2);
  return new Blob([jsonString], { type: 'application/geo+json' });
}

export function exportToJson(data: unknown): Blob {
  const jsonString = JSON.stringify(data, null, 2);
  return new Blob([jsonString], { type: 'application/json' });
}

export async function exportProcessedDatasets(
  datasets: ProcessedDataset[],
  format: 'csv' | 'geojson' | 'json' = 'json'
): Promise<Blob> {
  if (datasets.length === 0) {
    throw new Error('No datasets to export');
  }

  if (format === 'csv') {
    if (datasets.length === 1) {
      return exportDatasetToCsv(datasets[0]);
    }

    // For multiple datasets, check if they have DuckDB tables
    const haveDuckDBTables = datasets.every((d) => d.duckdbTableName);

    if (haveDuckDBTables) {
      // Ensure DuckDB is initialized
      await initDuckDB();
      if (!Duck) {
        throw new Error('DuckDB not initialized');
      }

      // Use DuckDB UNION ALL to combine tables
      const unionViewName = `export_union_${Date.now()}`;

      try {
        // Build UNION ALL query
        const unionParts = datasets.map((dataset) => {
          const nonGeomColumns = dataset.columns
            .filter((col) => col.type !== 'geometry')
            .map((col) => `"${col.name}"`)
            .join(', ');
          const escapedName = escapeSqlString(dataset.name);
          return `SELECT ${nonGeomColumns}, '${escapedName}' as _source_dataset FROM "${dataset.duckdbTableName}"`;
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

    // Fallback to JavaScript implementation
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
            .filter((col) => col.type !== 'geometry')
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
        (col) => col.type === 'geometry'
      );
      dataset.data.forEach((row) => {
        const properties: Record<string, unknown> = {};
        dataset.columns
          .filter((col) => col.type !== 'geometry')
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
      throw new Error('No geometric data to export');
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

export async function exportProjectData(
  files: UploadedFile[],
  format: 'csv' | 'geojson' | 'json' = 'json'
): Promise<Blob> {
  const validFiles = files.filter(
    (f) => f.status === 'complete' && f.parsedData
  );

  if (validFiles.length === 0) {
    throw new Error('No valid data to export');
  }

  if (format === 'csv') {
    const allData: Record<string, unknown>[] = [];

    for (const file of validFiles) {
      if (file.parsedData) {
        if (isTabularData(file.parsedData)) {
          allData.push(...file.parsedData);
        } else if (isGeoJSONFeatureCollection(file.parsedData)) {
          const flatData = file.parsedData.features.map((f) => ({
            ...f.properties,
            geometry_type: f.geometry?.type,
            coordinates: serializeGeometryCoordinates(f.geometry)
          }));
          allData.push(...flatData);
        }
      }
    }

    return exportToCsv(allData);
  }

  if (format === 'geojson') {
    const allFeatures: unknown[] = [];

    for (const file of validFiles) {
      if (file.parsedData) {
        if (isGeoJSONFeatureCollection(file.parsedData)) {
          allFeatures.push(...file.parsedData.features);
        } else if (isGeoJSONFeature(file.parsedData)) {
          allFeatures.push(file.parsedData);
        }
      }
    }

    return exportToGeoJson({
      type: 'FeatureCollection',
      features: allFeatures
    });
  }

  const exportData = {
    exportDate: new Date().toISOString(),
    files: validFiles.map((f) => ({
      name: f.name,
      type: f.fileType,
      size: f.size,
      data: f.parsedData
    }))
  };

  return exportToJson(exportData);
}

function serializeGeometryCoordinates(
  geometry: GeoJSONFeature['geometry']
): string | undefined {
  if (!geometry || typeof geometry !== 'object') {
    return undefined;
  }

  if ('coordinates' in geometry) {
    return JSON.stringify((geometry as { coordinates?: unknown }).coordinates);
  }

  if ('geometries' in geometry) {
    return JSON.stringify((geometry as { geometries?: unknown }).geometries);
  }

  return JSON.stringify(geometry);
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
