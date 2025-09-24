import Papa from 'papaparse';
import type { UploadedFile } from '../store/create-project.types';
import { FileType } from '../store/create-project.types';
import { generateFilename } from './string.utils';
import { logger, LogCategory } from './logger';

export const generateExportFilename = generateFilename;

export function exportToCsv(data: any[], headers?: string[]): Blob {
  const csv = Papa.unparse({
    fields: headers || (data.length > 0 ? Object.keys(data[0]) : []),
    data
  });

  const bom = '\uFEFF';
  return new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
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
        logger.warn(`Skipping CSV file ${file.name} for GeoJSON export`, LogCategory.EXPORT);
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

