import type { ProcessedDataset } from '$lib/features/data-pipeline';
import type { GeoJSONFeature } from '$lib/types/data';
import {
  isGeoJSONFeature,
  isGeoJSONFeatureCollection,
  isTabularData
} from '$lib/types/data';
import Papa from 'papaparse';
import type { UploadedFile } from '../store/create-project.types';
import { generateFilename } from './string.utils';

export const generateExportFilename = generateFilename;

export function exportToCsv(
  data: Record<string, unknown>[],
  headers?: string[]
): Blob {
  const csv = Papa.unparse({
    fields: headers || (data.length > 0 ? Object.keys(data[0]) : []),
    data
  });

  const bom = '\uFEFF';
  return new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
}

export function exportDatasetToCsv(dataset: ProcessedDataset): Blob {
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

export function exportProcessedDatasets(
  datasets: ProcessedDataset[],
  format: 'csv' | 'geojson' | 'json' = 'json'
): Blob {
  if (datasets.length === 0) {
    throw new Error('No datasets to export');
  }

  if (format === 'csv') {
    if (datasets.length === 1) {
      return exportDatasetToCsv(datasets[0]);
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
