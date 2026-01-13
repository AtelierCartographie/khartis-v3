import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import { ParseError } from '../errors/pipeline.errors';
import {
  type FileValidation,
  type UploadedFile,
  DataSourceType,
  FileType
} from '../store/create-project.types';
import { LogCategory, logger } from './logger';
import { sanitizeDisplayName } from './string.utils';

export type ColumnStatSummary = {
  type: string;
  count: number;
  nullCount: number;
  unique: number;
  min?: number;
  max?: number;
  mean?: number;
};

export { DataSourceType, FileType } from '../store/create-project.types';
export { formatFileSize } from './format.utils';

export function detectFileType(file: File): FileType {
  const extension = file.name.toLowerCase().split('.').pop() || '';
  const mimeType = file.type.toLowerCase();

  if (extension === 'csv' || mimeType.includes('csv')) {
    return FileType.CSV;
  }

  if (extension === 'geojson' || extension === 'json') {
    return FileType.GEOJSON;
  }

  if (['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(extension)) {
    return FileType.SHAPEFILE;
  }

  if (extension === 'gpkg') {
    return FileType.GEOPACKAGE;
  }

  if (
    extension === 'geoparquet' ||
    extension === 'gpq' ||
    mimeType.includes('parquet')
  ) {
    return FileType.GEOPARQUET;
  }

  if (extension === 'kml') {
    return FileType.KML;
  }

  if (extension === 'kmz') {
    return FileType.KMZ;
  }

  if (extension === 'gpx') {
    return FileType.GPX;
  }

  if (extension === 'zip' || mimeType.includes('zip')) {
    return FileType.ZIP;
  }

  if (extension === 'tsv' || mimeType.includes('tab-separated')) {
    return FileType.TSV;
  }

  if (extension === 'parquet') {
    return FileType.GEOPARQUET;
  }

  if (extension === 'arrow') {
    return FileType.ARROW;
  }

  return FileType.UNKNOWN;
}

export function isShapefileComponent(filename: string): boolean {
  const extension = filename.toLowerCase().split('.').pop() || '';
  return ['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(extension);
}

export function getShapefileBaseName(filename: string): string {
  const parts = filename.split('.');
  parts.pop();
  return parts.join('.');
}

export function groupShapefiles(files: File[]): Map<string, File[]> {
  const groups = new Map<string, File[]>();

  files.forEach((file) => {
    if (isShapefileComponent(file.name)) {
      const baseName = getShapefileBaseName(file.name);
      if (!groups.has(baseName)) {
        groups.set(baseName, []);
      }
      groups.get(baseName)!.push(file);
    } else {
      groups.set(file.name, [file]);
    }
  });

  return groups;
}

export async function readFileContent(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (reader.result) {
        if (onProgress) onProgress(100);
        resolve(reader.result);
      } else {
        reject(new ParseError('Failed to read file', detectFileType(file)));
      }
    };

    reader.onerror = () => {
      reject(
        new ParseError(
          `Error reading file: ${reader.error?.message}`,
          detectFileType(file)
        )
      );
    };

    reader.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100;
        onProgress(progress);
      }
    };

    const fileType = detectFileType(file);
    if (fileType === FileType.CSV || fileType === FileType.GEOJSON) {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

export function createUploadedFile(
  file: File,
  sourceType: DataSourceType,
  relatedFiles?: string[]
): UploadedFile {
  const cleanName = sanitizeDisplayName(file.name);

  return {
    id: crypto.randomUUID(),
    name: cleanName,
    size: file.size,
    type: file.type,
    fileType: detectFileType(file),
    status: FileStatus.UPLOADING,
    sourceType,
    relatedFiles,
    uploadProgress: 0
  };
}

// Note: CSV parsing, delimiter detection, type inference, duplicate detection,
// and statistics are now handled by DuckDB via dataPipeline.processFile()

export function validateGeospatialFile(
  content: ArrayBuffer | string
): FileValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    if (typeof content === 'string') {
      const geojson = JSON.parse(content);

      if (!geojson.type) {
        errors.push('Invalid GeoJSON: missing type property');
      }

      if (geojson.type === 'FeatureCollection' && !geojson.features) {
        errors.push('Invalid GeoJSON: FeatureCollection missing features');
      }

      if (geojson.features && geojson.features.length === 0) {
        warnings.push('GeoJSON contains no features');
      }

      if (geojson.features) {
        const invalidFeatures = (
          geojson.features as Array<{
            geometry?: unknown;
            properties?: unknown;
          }>
        ).filter((feature) => !feature.geometry || !feature.properties);
        if (invalidFeatures.length > 0) {
          warnings.push(
            `${invalidFeatures.length} features have invalid structure`
          );
        }
      }
    }
  } catch (error) {
    logger.error(
      'Failed to validate GeoJSON structure',
      LogCategory.FILE,
      error
    );
    errors.push('Invalid JSON structure');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Extracts tabular data from pasted text (CSV/TSV only).
 * JSON/GeoJSON paste is not supported - use file upload for geospatial data.
 * DuckDB handles the actual parsing via read_csv().
 */
export function extractDataFromPaste(pastedText: string): {
  fileType: FileType;
  content: string;
} | null {
  const trimmed = pastedText.trim();
  if (!trimmed) return null;

  // Check if it looks like tabular data (has delimiter in first line)
  const firstLine = trimmed.split('\n')[0];
  const hasDelimiter = [',', ';', '\t', '|'].some((d) => firstLine.includes(d));

  if (!hasDelimiter) return null;

  // Determine TSV vs CSV based on dominant delimiter
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const fileType = tabCount > 0 ? FileType.TSV : FileType.CSV;

  return { fileType, content: trimmed };
}

export function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractUrlsFromInput(input: string): string[] {
  return input
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function getFilenameFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const filename = pathname.split('/').pop() || 'download';
    return filename;
  } catch {
    return 'download';
  }
}
