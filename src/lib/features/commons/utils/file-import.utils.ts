import { FileStatus, GEOJSON_TYPE } from '$lib/features/commons/constants';
import {
  FILE_EXTENSIONS,
  MIME_TYPE_PATTERNS,
  TABULAR_DELIMITERS
} from '$lib/features/commons/constants/file-types.constants';
import { PIPELINE_CONST } from '$lib/features/data-pipeline/constants';
import { ParseError } from '../errors/pipeline.errors';
import {
  type FileValidation,
  type UploadedFile,
  DataSourceType,
  FileType
} from '../store/create-project.types';
import { LogCategory, logger } from './logger';
import { sanitizeDisplayName } from './string.utils';

const UTF8_ENCODING = PIPELINE_CONST.ENCODING.DEFAULT;
const HTTP_PROTOCOL = 'http:';
const HTTPS_PROTOCOL = 'https:';
const DEFAULT_FILENAME = 'download';

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

  if (
    FILE_EXTENSIONS.CSV.includes(extension as never) ||
    mimeType.includes(MIME_TYPE_PATTERNS.CSV)
  ) {
    return FileType.CSV;
  }

  if (FILE_EXTENSIONS.GEOJSON.includes(extension as never)) {
    return FileType.GEOJSON;
  }

  if (FILE_EXTENSIONS.SHAPEFILE.includes(extension as never)) {
    return FileType.SHAPEFILE;
  }

  if (FILE_EXTENSIONS.GEOPACKAGE.includes(extension as never)) {
    return FileType.GEOPACKAGE;
  }

  if (
    FILE_EXTENSIONS.GEOPARQUET.includes(extension as never) ||
    mimeType.includes(MIME_TYPE_PATTERNS.PARQUET)
  ) {
    return FileType.GEOPARQUET;
  }

  if (FILE_EXTENSIONS.KML.includes(extension as never)) {
    return FileType.KML;
  }

  if (FILE_EXTENSIONS.KMZ.includes(extension as never)) {
    return FileType.KMZ;
  }

  if (FILE_EXTENSIONS.GPX.includes(extension as never)) {
    return FileType.GPX;
  }

  if (
    FILE_EXTENSIONS.ZIP.includes(extension as never) ||
    mimeType.includes(MIME_TYPE_PATTERNS.ZIP)
  ) {
    return FileType.ZIP;
  }

  if (
    FILE_EXTENSIONS.TSV.includes(extension as never) ||
    mimeType.includes(MIME_TYPE_PATTERNS.TAB_SEPARATED)
  ) {
    return FileType.TSV;
  }

  if (FILE_EXTENSIONS.ARROW.includes(extension as never)) {
    return FileType.ARROW;
  }

  return FileType.UNKNOWN;
}

export function isShapefileComponent(filename: string): boolean {
  const extension = filename.toLowerCase().split('.').pop() || '';
  return FILE_EXTENSIONS.SHAPEFILE.includes(extension as never);
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
      reader.readAsText(file, UTF8_ENCODING);
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

      if (geojson.type === GEOJSON_TYPE.FEATURE_COLLECTION && !geojson.features) {
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

export function extractDataFromPaste(pastedText: string): {
  fileType: FileType;
  content: string;
} | null {
  const trimmed = pastedText.trim();
  if (!trimmed) return null;

  const firstLine = trimmed.split('\n')[0];
  const hasDelimiter = TABULAR_DELIMITERS.some((d) => firstLine.includes(d));

  if (!hasDelimiter) return null;

  const tabCount = (firstLine.match(/\t/g) || []).length;
  const fileType = tabCount > 0 ? FileType.TSV : FileType.CSV;

  return { fileType, content: trimmed };
}

export function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === HTTP_PROTOCOL ||
      parsedUrl.protocol === HTTPS_PROTOCOL
    );
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
    const filename = pathname.split('/').pop() || DEFAULT_FILENAME;
    return filename;
  } catch {
    return DEFAULT_FILENAME;
  }
}
