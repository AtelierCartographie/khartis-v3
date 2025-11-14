import type { FeatureCollection } from 'geojson';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import shp from 'shpjs';
import { FileGroupError, ParseError } from '../errors/pipeline.errors';
import {
  type FileValidation,
  type UploadedFile,
  DataSourceType,
  FileType
} from '../store/create-project.types';
import { LogCategory, logger } from './logger';
import { sanitizeDisplayName } from './string.utils';

type DataRow = Record<string, unknown>;
type ColumnStatSummary = {
  type: string;
  count: number;
  nullCount: number;
  unique: number;
  min?: number;
  max?: number;
  mean?: number;
};

type ShapefileGeoJSON = FeatureCollection | FeatureCollection[];

type ShapefileComponentInput = {
  shp: ArrayBuffer;
  dbf: ArrayBuffer;
  shx?: ArrayBuffer;
  prj?: string;
  cpg?: string;
  [key: string]: string | ArrayBuffer | undefined;
};

export { DataSourceType, FileType } from '../store/create-project.types';
export { formatFileSize } from './format.utils';

export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const SUPPORTED_EXTENSIONS = {
  tabular: ['.csv', '.tsv', '.txt'],
  geospatial: [
    '.geojson',
    '.json',
    '.shp',
    '.shx',
    '.dbf',
    '.prj',
    '.cpg',
    '.gpkg',
    '.geoparquet',
    '.gpq'
  ]
};

export const MIME_TYPES = {
  csv: ['text/csv', 'application/csv', 'text/plain'],
  geojson: ['application/geo+json', 'application/json'],
  shapefile: ['application/octet-stream', 'application/x-shapefile'],
  geopackage: ['application/geopackage+sqlite3', 'application/octet-stream'],
  geoparquet: [
    'application/geoparquet',
    'application/octet-stream',
    'application/x-parquet'
  ]
};

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

  return FileType.UNKNOWN;
}

export function validateFile(file: File): FileValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (file.size > MAX_FILE_SIZE) {
    errors.push(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
  }

  if (file.size === 0) {
    errors.push('File is empty');
  }

  const fileType = detectFileType(file);
  if (fileType === FileType.UNKNOWN) {
    warnings.push('Unknown file type. File may not be supported');
  }

  const extension = file.name.toLowerCase().split('.').pop() || '';
  const allExtensions = [
    ...SUPPORTED_EXTENSIONS.tabular,
    ...SUPPORTED_EXTENSIONS.geospatial
  ];
  if (!allExtensions.some((ext) => ext.slice(1) === extension)) {
    warnings.push(`File extension .${extension} may not be fully supported`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
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
    status: 'uploading',
    sourceType,
    relatedFiles,
    uploadProgress: 0
  };
}

export function detectDelimiter(csvContent: string): string {
  const firstLine = csvContent.split('\n')[0];
  if (!firstLine) return ',';

  const delimiters = [',', ';', '\t', '|'];
  const counts = delimiters.map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length
  }));

  counts.sort((a, b) => b.count - a.count);
  return counts[0].delimiter;
}

export function parseCsvHeaders(csvContent: string): string[] {
  const delimiter = detectDelimiter(csvContent);
  const firstLine = csvContent.split('\n')[0];
  if (!firstLine) return [];

  return firstLine
    .split(delimiter)
    .map((header) => header.trim().replace(/^["']|["']$/g, ''));
}

export async function parseShapefile(
  files: Record<string, ArrayBuffer>,
  onProgress?: (progress: number) => void
): Promise<ShapefileGeoJSON> {
  try {
    if (onProgress) onProgress(10);

    const shpBuffer = files['shp'];
    const dbfBuffer = files['dbf'];

    if (!shpBuffer || !dbfBuffer) {
      const missingFiles = [];
      if (!shpBuffer) missingFiles.push('.shp');
      if (!dbfBuffer) missingFiles.push('.dbf');
      throw new FileGroupError(
        'Missing required shapefile components',
        missingFiles
      );
    }

    if (onProgress) onProgress(30);

    const shapefileData: ShapefileComponentInput = {
      shp: shpBuffer,
      dbf: dbfBuffer
    };

    if (files['prj']) {
      shapefileData.prj = new TextDecoder().decode(files['prj']);
    }

    if (files['cpg']) {
      shapefileData.cpg = new TextDecoder().decode(files['cpg']).trim();
    }

    const shapefileInput = shapefileData as unknown as Parameters<
      typeof shp
    >[0];
    const geojson = (await shp(shapefileInput)) as ShapefileGeoJSON;

    if (onProgress) onProgress(80);

    if (onProgress) onProgress(100);

    return geojson;
  } catch (error) {
    logger.error('Shapefile parsing error', LogCategory.FILE, error);
    throw error;
  }
}

export async function detectDuplicateRows<T extends DataRow>(
  data: T[]
): Promise<{
  hasDuplicates: boolean;
  duplicateIndices: number[];
  duplicateCount: number;
}> {
  logger.debug('Detecting duplicates', LogCategory.DATA);

  const seen = new Map<string, number[]>();
  const duplicateIndices: number[] = [];

  // Process rows in chunks to avoid blocking
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    // Yield to event loop between chunks
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0));

    const chunk = data.slice(i, i + CHUNK_SIZE);
    chunk.forEach((row, chunkIndex) => {
      const index = i + chunkIndex;
      const key = JSON.stringify(row);
      if (seen.has(key)) {
        seen.get(key)!.push(index);
        duplicateIndices.push(index);
      } else {
        seen.set(key, [index]);
      }
    });
  }

  logger.debug('Operation', LogCategory.DATA);

  return {
    hasDuplicates: duplicateIndices.length > 0,
    duplicateIndices,
    duplicateCount: duplicateIndices.length
  };
}

export async function detectDataTypes(
  data: DataRow[],
  headers: string[]
): Promise<Record<string, string>> {
  logger.debug('Inferring column types', LogCategory.DATA);

  const types: Record<string, string> = {};

  // Process headers in chunks to avoid blocking
  const HEADER_CHUNK_SIZE = 10;
  for (let i = 0; i < headers.length; i += HEADER_CHUNK_SIZE) {
    // Yield to event loop between chunks
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0));

    const headerChunk = headers.slice(i, i + HEADER_CHUNK_SIZE);
    for (const header of headerChunk) {
      const values = data.map((row) => row[header]).filter((v) => v != null);

      if (values.length === 0) {
        types[header] = 'empty';
        continue;
      }

      const allNumbers = values.every(
        (v) => typeof v === 'number' || !isNaN(Number(v))
      );
      const allBooleans = values.every(
        (v) => typeof v === 'boolean' || v === 'true' || v === 'false'
      );
      const allDates = values.every((v) => !isNaN(Date.parse(String(v))));

      if (allNumbers) {
        types[header] = 'number';
      } else if (allBooleans) {
        types[header] = 'boolean';
      } else if (allDates) {
        types[header] = 'date';
      } else {
        types[header] = 'string';
      }
    }
  }

  logger.debug('Operation', LogCategory.DATA);

  return types;
}

export async function getDataStatistics(
  data: DataRow[],
  headers: string[]
): Promise<Record<string, ColumnStatSummary>> {
  logger.debug('Calculating statistics', LogCategory.DATA);

  const stats: Record<string, ColumnStatSummary> = {};
  const dataTypes = await detectDataTypes(data, headers);

  // Process headers in chunks to avoid blocking
  const HEADER_CHUNK_SIZE = 10;
  for (let i = 0; i < headers.length; i += HEADER_CHUNK_SIZE) {
    // Yield to event loop between chunks
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0));

    const headerChunk = headers.slice(i, i + HEADER_CHUNK_SIZE);
    for (const header of headerChunk) {
      const values = data.map((row) => row[header]).filter((v) => v != null);
      const type = dataTypes[header];

      stats[header] = {
        type,
        count: values.length,
        nullCount: data.length - values.length,
        unique: new Set(values).size
      };

      if (type === 'number') {
        const numbers = values.map(Number).filter((n) => !isNaN(n));
        if (numbers.length > 0) {
          stats[header].min = Math.min(...numbers);
          stats[header].max = Math.max(...numbers);
          stats[header].mean =
            numbers.reduce((a, b) => a + b, 0) / numbers.length;
        }
      }
    }
  }

  logger.debug('Operation', LogCategory.DATA);

  return stats;
}

export function validateCsvStructure(csvContent: string): FileValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const lines = csvContent.split('\n').filter((line) => line.trim());
  if (lines.length === 0) {
    errors.push('CSV file is empty');
    return { isValid: false, errors, warnings };
  }

  const headers = parseCsvHeaders(csvContent);
  if (headers.length === 0) {
    errors.push('No headers found in CSV');
  }

  if (headers.some((h) => !h)) {
    warnings.push('Some headers are empty');
  }

  const duplicateHeaders = headers.filter(
    (header, index) => headers.indexOf(header) !== index
  );
  if (duplicateHeaders.length > 0) {
    warnings.push(`Duplicate headers found: ${duplicateHeaders.join(', ')}`);
  }

  if (lines.length === 1) {
    warnings.push('CSV contains only headers, no data rows');
  }

  const delimiter = detectDelimiter(csvContent);
  const columnCounts = lines
    .slice(0, Math.min(10, lines.length))
    .map((line) => line.split(delimiter).length);
  const expectedColumns = headers.length;
  const inconsistentRows = columnCounts.filter(
    (count) => count !== expectedColumns
  );

  if (inconsistentRows.length > 0) {
    warnings.push('Some rows have inconsistent column counts');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
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

export function extractDataFromPaste(pastedText: string): {
  fileType: FileType;
  validation: FileValidation;
} {
  const trimmed = pastedText.trim();
  if (!trimmed) {
    return {
      fileType: FileType.UNKNOWN,
      validation: {
        isValid: false,
        errors: ['Pasted content is empty'],
        warnings: []
      }
    };
  }

  try {
    JSON.parse(trimmed);
    return {
      fileType: FileType.GEOJSON,
      validation: validateGeospatialFile(trimmed)
    };
  } catch {
    const lines = trimmed.split('\n');
    const firstLine = lines[0];

    if (
      firstLine &&
      (firstLine.includes(',') ||
        firstLine.includes(';') ||
        firstLine.includes('\t'))
    ) {
      return {
        fileType: FileType.CSV,
        validation: validateCsvStructure(trimmed)
      };
    }

    return {
      fileType: FileType.UNKNOWN,
      validation: {
        isValid: false,
        errors: ['Unable to detect data format. Expected CSV or GeoJSON'],
        warnings: []
      }
    };
  }
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

export async function parseGeoPackage(
  buffer: ArrayBuffer,
  onProgress?: (progress: number) => void
): Promise<FeatureCollection> {
  try {
    onProgress?.(10);

    const SQL = await import('sql.js/dist/sql-wasm.js');
    const sqlJs = await SQL.default({
      locateFile: () => sqlWasmUrl
    });

    onProgress?.(30);

    const db = new sqlJs.Database(new Uint8Array(buffer));

    onProgress?.(50);

    const tables = db.exec(
      "SELECT table_name FROM gpkg_contents WHERE data_type IN ('features', 'tiles')"
    );

    if (!tables[0] || !tables[0].values.length) {
      throw new ParseError(
        'No feature tables found in GeoPackage',
        FileType.GEOPACKAGE
      );
    }

    const featureTable = tables[0].values[0][0] as string;

    onProgress?.(70);

    const features = db.exec(
      `SELECT AsGeoJSON(geom) as geometry, * FROM ${featureTable}`
    );

    if (!features[0]) {
      throw new ParseError(
        `No features found in table '${featureTable}'`,
        FileType.GEOPACKAGE,
        { table: featureTable }
      );
    }

    const geojson = {
      type: 'FeatureCollection' as const,
      features: features[0].values.map((row) => {
        const geom = JSON.parse(row[0] as string);
        const properties: Record<string, unknown> = {};

        features[0].columns.forEach((col, idx) => {
          if (col !== 'AsGeoJSON(geom)' && col !== 'geom') {
            properties[col] = row[idx];
          }
        });

        return {
          type: 'Feature' as const,
          geometry: geom,
          properties
        };
      })
    };

    onProgress?.(100);
    db.close();

    return geojson;
  } catch (error) {
    // Re-throw if already a typed error
    if (error instanceof ParseError || error instanceof FileGroupError) {
      throw error;
    }
    logger.error('Failed to parse GeoPackage', LogCategory.FILE, error);
    throw new ParseError(
      `Failed to parse GeoPackage: ${error instanceof Error ? error.message : 'Unknown error'}`,
      FileType.GEOPACKAGE,
      { originalError: error }
    );
  }
}
