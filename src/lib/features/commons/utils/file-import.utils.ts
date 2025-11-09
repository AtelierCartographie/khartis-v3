import Papa from 'papaparse';
import shp from 'shpjs';
import {
  type FileValidation,
  type UploadedFile,
  DataSourceType,
  FileType
} from '../store/create-project.types';
import { sanitizeDisplayName } from './string.utils';
import { logger, LogCategory } from './logger';

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
    '.gpkg'
  ]
};

export const MIME_TYPES = {
  csv: ['text/csv', 'application/csv', 'text/plain'],
  geojson: ['application/geo+json', 'application/json'],
  shapefile: ['application/octet-stream', 'application/x-shapefile'],
  geopackage: ['application/geopackage+sqlite3', 'application/octet-stream']
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
        reject(new Error('Failed to read file'));
      }
    };

    reader.onerror = () => {
      reject(new Error(`Error reading file: ${reader.error?.message}`));
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

export async function parseCsvWithPapa(
  file: File,
  _onProgress?: (progress: number) => void
): Promise<{
  data: any[];
  headers: string[];
  errors: string[];
  meta: any;
}> {
  logger.info('Starting parse of file', LogCategory.FILE, {
    name: file.name,
    size: file.size,
    type: file.type
  });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      logger.debug(
        'File content preview',
        LogCategory.FILE,
        text.substring(0, 500)
      );

      Papa.parse(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimiter: detectDelimiter(text),
        complete: (results) => {
          logger.info('Parse complete', LogCategory.FILE, {
            dataLength: results.data.length,
            headers: results.meta.fields,
            errors: results.errors,
            firstRow: results.data[0],
            delimiter: results.meta.delimiter
          });

          if (results.data.length === 0 && text.trim().length > 0) {
            logger.warn(
              'Empty result but file has content, trying without header',
              LogCategory.FILE
            );

            Papa.parse(text, {
              header: false,
              dynamicTyping: true,
              skipEmptyLines: true,
              delimiter: detectDelimiter(text),
              complete: (retryResults) => {
                logger.info('Retry parse complete', LogCategory.FILE, {
                  dataLength: retryResults.data.length,
                  firstRow: retryResults.data[0]
                });

                if (retryResults.data.length > 0) {
                  const firstRow = retryResults.data[0] as any[];
                  const headers = firstRow.map(
                    (_: any, i: number) => `Column_${i + 1}`
                  );
                  const dataRows = retryResults.data.slice(1) as any[][];
                  const data = dataRows.map((row: any[]) => {
                    const obj: any = {};
                    headers.forEach((h: string, i: number) => {
                      obj[h] = row[i];
                    });
                    return obj;
                  });

                  resolve({
                    data: data,
                    headers: headers,
                    errors: retryResults.errors.map((e) => e.message),
                    meta: retryResults.meta
                  });
                } else {
                  resolve({
                    data: results.data,
                    headers: results.meta.fields || [],
                    errors: results.errors.map((e) => e.message),
                    meta: results.meta
                  });
                }
              }
            });
          } else {
            resolve({
              data: results.data,
              headers: results.meta.fields || [],
              errors: results.errors.map((e) => e.message),
              meta: results.meta
            });
          }
        },
        error: (_error: any) => {
          logger.error('Parse error', LogCategory.FILE, _error);
          reject(_error);
        }
      });
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file, 'UTF-8');
  });
}

export async function parseShapefile(
  files: Record<string, ArrayBuffer>,
  onProgress?: (progress: number) => void
): Promise<any> {
  try {
    if (onProgress) onProgress(10);

    const shpBuffer = files['shp'];
    const dbfBuffer = files['dbf'];

    if (!shpBuffer || !dbfBuffer) {
      throw new Error('Missing required shapefile components');
    }

    if (onProgress) onProgress(30);

    const shapefileData: any = {
      shp: shpBuffer,
      dbf: dbfBuffer
    };

    if (files['prj']) {
      shapefileData.prj = new TextDecoder().decode(files['prj']);
    }

    if (files['cpg']) {
      shapefileData.cpg = new TextDecoder().decode(files['cpg']).trim();
    }

    const geojson: any = await shp(shapefileData);

    if (onProgress) onProgress(80);

    if (onProgress) onProgress(100);

    return geojson;
  } catch (error) {
    logger.error('Shapefile parsing error', LogCategory.FILE, error);
    throw error;
  }
}

export function detectDuplicateRows(data: any[]): {
  hasDuplicates: boolean;
  duplicateIndices: number[];
  duplicateCount: number;
} {
  const seen = new Map<string, number[]>();
  const duplicateIndices: number[] = [];

  data.forEach((row, index) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      seen.get(key)!.push(index);
      duplicateIndices.push(index);
    } else {
      seen.set(key, [index]);
    }
  });

  return {
    hasDuplicates: duplicateIndices.length > 0,
    duplicateIndices,
    duplicateCount: duplicateIndices.length
  };
}

export function detectDataTypes(
  data: any[],
  headers: string[]
): Record<string, string> {
  const types: Record<string, string> = {};

  headers.forEach((header) => {
    const values = data.map((row) => row[header]).filter((v) => v != null);

    if (values.length === 0) {
      types[header] = 'empty';
      return;
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
  });

  return types;
}

export function getDataStatistics(
  data: any[],
  headers: string[]
): Record<string, any> {
  const stats: Record<string, any> = {};
  const dataTypes = detectDataTypes(data, headers);

  headers.forEach((header) => {
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
  });

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
        const invalidFeatures = geojson.features.filter(
          (f: any) => !f.geometry || !f.properties
        );
        if (invalidFeatures.length > 0) {
          warnings.push(
            `${invalidFeatures.length} features have invalid structure`
          );
        }
      }
    }
  } catch (error) {
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
): Promise<any> {
  try {
    onProgress?.(10);

    const SQL = await import('sql.js');
    const sqlJs = await SQL.default({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`
    });

    onProgress?.(30);

    const db = new sqlJs.Database(new Uint8Array(buffer));

    onProgress?.(50);

    const tables = db.exec(
      "SELECT table_name FROM gpkg_contents WHERE data_type IN ('features', 'tiles')"
    );

    if (!tables[0] || !tables[0].values.length) {
      throw new Error('No feature tables found in GeoPackage');
    }

    const featureTable = tables[0].values[0][0] as string;

    onProgress?.(70);

    const features = db.exec(
      `SELECT AsGeoJSON(geom) as geometry, * FROM ${featureTable}`
    );

    if (!features[0]) {
      throw new Error('No features found in table');
    }

    const geojson = {
      type: 'FeatureCollection',
      features: features[0].values.map((row) => {
        const geom = JSON.parse(row[0] as string);
        const properties: Record<string, any> = {};

        features[0].columns.forEach((col, idx) => {
          if (col !== 'AsGeoJSON(geom)' && col !== 'geom') {
            properties[col] = row[idx];
          }
        });

        return {
          type: 'Feature',
          geometry: geom,
          properties
        };
      })
    };

    onProgress?.(100);
    db.close();

    return geojson;
  } catch (error) {
    throw new Error(
      `Failed to parse GeoPackage: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
