import Papa from 'papaparse';
import type { UploadedFile } from '../store/create-project.types';
import { FileType } from '../store/create-project.types';
import { generateFilename } from './string.utils';
import { logger, LogCategory } from './logger';
import type { ProcessedDataset } from './data-pipeline.utils';

export const generateExportFilename = generateFilename;

export function exportToCsv(data: any[], headers?: string[]): Blob {
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
    const cleanRow: Record<string, any> = {};
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
    const properties: Record<string, any> = {};
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
      type: 'Feature',
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

export function exportToGeoJson(data: any): Blob {
  let geojson: any;

  if (data.type === 'FeatureCollection' || data.type === 'Feature') {
    geojson = data;
  } else if (Array.isArray(data)) {
    geojson = {
      type: 'FeatureCollection',
      features: data
        .filter(
          (item) =>
            item.type === 'Feature' || (item.geometry && item.properties)
        )
        .map((item) => {
          if (item.type === 'Feature') return item;
          return {
            type: 'Feature',
            geometry: item.geometry,
            properties: item.properties || {}
          };
        })
    };
  } else {
    throw new Error('Invalid data format for GeoJSON export');
  }

  const jsonString = JSON.stringify(geojson, null, 2);
  return new Blob([jsonString], { type: 'application/geo+json' });
}

export function exportToJson(data: any): Blob {
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

    const allData: any[] = [];
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
    const allFeatures: any[] = [];

    for (const dataset of datasets) {
      if (!dataset.geometry) {
        logger.warn(
          `Skipping dataset ${dataset.name} without geometry for GeoJSON export`,
          LogCategory.EXPORT
        );
        continue;
      }

      const geometryColumn = dataset.columns.find(
        (col) => col.type === 'geometry'
      );
      dataset.data.forEach((row) => {
        const properties: Record<string, any> = {};
        dataset.columns
          .filter((col) => col.type !== 'geometry')
          .forEach((col) => {
            properties[col.name] = row[col.name];
          });
        properties._source_dataset = dataset.name;

        allFeatures.push({
          type: 'Feature',
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
    const allData: any[] = [];

    for (const file of validFiles) {
      if (file.fileType === FileType.CSV && file.parsedData) {
        allData.push(...file.parsedData);
      } else if (file.parsedData?.features) {
        const features = file.parsedData.features;
        const flatData = features.map((f: any) => ({
          ...f.properties,
          geometry_type: f.geometry?.type,
          coordinates: JSON.stringify(f.geometry?.coordinates)
        }));
        allData.push(...flatData);
      }
    }

    return exportToCsv(allData);
  }

  if (format === 'geojson') {
    const allFeatures: any[] = [];

    for (const file of validFiles) {
      if (file.parsedData?.type === 'FeatureCollection') {
        allFeatures.push(...file.parsedData.features);
      } else if (file.parsedData?.type === 'Feature') {
        allFeatures.push(file.parsedData);
      } else if (file.fileType === FileType.CSV && file.parsedData) {
        logger.warn(
          `Skipping CSV file ${file.name} for GeoJSON export`,
          LogCategory.EXPORT
        );
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
