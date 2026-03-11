import {
  STORAGE_LIMITS,
  type ValidationResult
} from '../configs/validation.config';
import { FileType } from '../store/create-project.types';
import { getFileExtension } from './file.utils';
import { LogCategory, logger } from './logger';
import {
  FILE_EXTENSIONS,
  GEOJSON_TYPE,
  MIME_TYPE_PATTERNS,
  SIMPLE_GEOMETRY_TYPES
} from '$lib/features/commons/constants';
import { PIPELINE_CONST } from '$lib/features/data-pipeline/constants';
import * as m from '$lib/paraglide/messages';

const TABULAR_TEXT_EXTENSION = 'txt';
const SHAPEFILE_AUX_EXTENSIONS = ['sbn', 'sbx'] as const;

export interface FileValidationConfig {
  maxFileSize: number;
  maxTotalSize: number;
  maxFileCount: number;
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  strictMode: boolean;
}

export interface DetailedValidationResult extends ValidationResult {
  fileType: FileType;
  requiresAsyncValidation: boolean;
  metadata?: {
    detectedType?: string;
    actualMimeType?: string;
    magicNumber?: string;
    encoding?: string;
  };
}

export const FILE_VALIDATION_CONFIG: FileValidationConfig = {
  maxFileSize: STORAGE_LIMITS.maxFileSize,
  maxTotalSize: STORAGE_LIMITS.maxTotalFileSize,
  maxFileCount: STORAGE_LIMITS.maxFileCount,
  allowedExtensions: [
    'csv',
    'tsv',
    'txt',
    'geojson',
    'json',
    'geoparquet',
    'gpq',
    'parquet',
    'arrow',
    'shp',
    'shx',
    'dbf',
    'prj',
    'cpg',
    'sbn',
    'sbx',
    'gpkg',
    'kml',
    'kmz',
    'gpx',
    'zip'
  ],
  allowedMimeTypes: [
    'text/csv',
    'application/csv',
    'text/plain',
    'text/tab-separated-values',
    'application/json',
    'application/geo+json',
    'application/vnd.geo+json',
    'application/geoparquet',
    'application/x-parquet',
    'application/parquet',
    'application/vnd.apache.arrow.file',
    'application/x-shapefile',
    'application/x-dbf',
    'application/octet-stream',
    'application/geopackage+sqlite3',
    'application/x-sqlite3',
    'application/vnd.google-earth.kml+xml',
    'application/vnd.google-earth.kmz',
    'application/gpx+xml',
    'application/zip',
    'application/x-zip-compressed'
  ],
  strictMode: true
};

const config = FILE_VALIDATION_CONFIG;

export const FileValidator = {
  validate(file: File): DetailedValidationResult {
    const result: DetailedValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fileType: FileType.UNKNOWN,
      requiresAsyncValidation: false,
      metadata: {}
    };

    FileValidator.validateBasicProperties(file, result);

    result.fileType = FileValidator.detectFileType(file);
    result.metadata!.detectedType = result.fileType;

    FileValidator.validateByType(file, result);

    result.requiresAsyncValidation = FileValidator.requiresAsyncValidation(
      result.fileType
    );

    result.isValid = result.errors.length === 0;
    return result;
  },

  async validateAsync(
    file: File,
    initialResult: DetailedValidationResult
  ): Promise<DetailedValidationResult> {
    const result = { ...initialResult };

    try {
      const buffer = await FileValidator.readFileHeader(file, 512);
      result.metadata!.magicNumber = FileValidator.getMagicNumber(buffer);

      switch (result.fileType) {
        case FileType.CSV:

        // fallthrough
        case FileType.TSV:
          await FileValidator.validateCSVContent(file, buffer, result);
          break;

        case FileType.GEOJSON:
          await FileValidator.validateGeoJSONContent(file, buffer, result);
          break;

        case FileType.SHAPEFILE:
          await FileValidator.validateShapefileContent(file, buffer, result);
          break;

        case FileType.GEOPACKAGE:
          await FileValidator.validateGeoPackageContent(file, buffer, result);
          break;
      }
    } catch (error) {
      logger.error('Async validation failed', LogCategory.FILE, error);
      result.errors.push('Impossible de valider le contenu du fichier');
      result.isValid = false;
    }

    return result;
  },

  validateMultiple(files: File[]): {
    results: Map<string, DetailedValidationResult>;
    globalErrors: string[];
    isValid: boolean;
  } {
    const results = new Map<string, DetailedValidationResult>();
    const globalErrors: string[] = [];
    let totalSize = 0;

    if (files.length > config.maxFileCount) {
      globalErrors.push(
        `Maximum number of files exceeded (${config.maxFileCount})`
      );
    }

    for (const file of files) {
      const result = FileValidator.validate(file);
      results.set(file.name, result);
      totalSize += file.size;
    }

    if (totalSize > config.maxTotalSize) {
      globalErrors.push(
        `Total file size exceeds ${config.maxTotalSize / (1024 * 1024)} MB`
      );
    }

    FileValidator.validateShapefileGroup(files, results, globalErrors);

    return {
      results,
      globalErrors,
      isValid:
        globalErrors.length === 0 &&
        Array.from(results.values()).every((r) => r.isValid)
    };
  },

  validateBasicProperties(file: File, result: DetailedValidationResult): void {
    if (file.size === 0) {
      result.errors.push(m.validation_file_empty());
    } else if (file.size > config.maxFileSize) {
      result.errors.push(m.validation_file_too_large());
    } else if (file.size > config.maxFileSize * 0.8) {
      result.warnings.push('Large file, processing may be slow');
    }

    if (!file.name || file.name.length === 0) {
      result.errors.push('Invalid file name');
    }

    const suspiciousPatterns = [
      /\.\./,
      /[<>:"|?*\\]/,
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1f\x7f]/,
      /^\./
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(file.name)) {
        result.warnings.push('File name contains unusual characters');
        break;
      }
    }

    const extension = getFileExtension(file.name);
    if (!extension) {
      result.warnings.push('File without extension');
    } else if (!config.allowedExtensions.includes(extension)) {
      if (config.strictMode) {
        result.errors.push(`Extension .${extension} not supported`);
      } else {
        result.warnings.push(`Extension .${extension} may not be supported`);
      }
    }

    if (file.type) {
      result.metadata!.actualMimeType = file.type;
      if (!config.allowedMimeTypes.includes(file.type.toLowerCase())) {
        result.warnings.push(`MIME type ${file.type} not recognized`);
      }
    }
  },

  detectFileType(file: File): FileType {
    const extension = getFileExtension(file.name);
    const mimeType = file.type?.toLowerCase() || '';
    const hasExtension = <T extends readonly string[]>(values: T): boolean =>
      values.includes(extension as T[number]);
    const hasMimePattern = (pattern: string): boolean =>
      mimeType.includes(pattern);

    if (
      hasExtension(FILE_EXTENSIONS.CSV) ||
      hasMimePattern(MIME_TYPE_PATTERNS.CSV)
    ) {
      return FileType.CSV;
    }
    if (
      hasExtension(FILE_EXTENSIONS.TSV) ||
      hasMimePattern(MIME_TYPE_PATTERNS.TAB_SEPARATED)
    ) {
      return FileType.TSV;
    }
    if (
      extension === TABULAR_TEXT_EXTENSION &&
      !hasMimePattern(FILE_EXTENSIONS.GEOJSON[1])
    ) {
      return FileType.CSV;
    }

    if (
      hasExtension(FILE_EXTENSIONS.GEOJSON) ||
      hasMimePattern('geo+json') ||
      hasMimePattern(FILE_EXTENSIONS.GEOJSON[1])
    ) {
      return FileType.GEOJSON;
    }

    if (
      hasExtension(FILE_EXTENSIONS.SHAPEFILE) ||
      SHAPEFILE_AUX_EXTENSIONS.includes(
        extension as (typeof SHAPEFILE_AUX_EXTENSIONS)[number]
      )
    ) {
      return FileType.SHAPEFILE;
    }

    if (
      hasExtension(FILE_EXTENSIONS.GEOPACKAGE) ||
      hasMimePattern('geopackage')
    ) {
      return FileType.GEOPACKAGE;
    }

    if (
      hasExtension(FILE_EXTENSIONS.GEOPARQUET) ||
      hasMimePattern(MIME_TYPE_PATTERNS.PARQUET)
    ) {
      return FileType.GEOPARQUET;
    }

    if (hasExtension(FILE_EXTENSIONS.ARROW) || hasMimePattern('arrow')) {
      return FileType.ARROW;
    }

    if (hasExtension(FILE_EXTENSIONS.KML) || hasMimePattern('kml')) {
      return FileType.KML;
    }
    if (hasExtension(FILE_EXTENSIONS.KMZ) || hasMimePattern('kmz')) {
      return FileType.KMZ;
    }
    if (hasExtension(FILE_EXTENSIONS.GPX) || hasMimePattern('gpx')) {
      return FileType.GPX;
    }
    if (
      hasExtension(FILE_EXTENSIONS.ZIP) ||
      hasMimePattern(MIME_TYPE_PATTERNS.ZIP)
    ) {
      return FileType.ZIP;
    }

    return FileType.UNKNOWN;
  },

  validateByType(file: File, result: DetailedValidationResult): void {
    switch (result.fileType) {
      case FileType.CSV:

      // fallthrough
      case FileType.TSV:
        if (file.size > 10 * 1024 * 1024) {
          result.warnings.push('Large CSV/TSV file, parsing may be slow');
        }
        break;

      case FileType.SHAPEFILE: {
        const ext = getFileExtension(file.name);
        if (ext === 'shp' && file.size < 100) {
          result.warnings.push('SHP file suspiciously small');
        }
        break;
      }

      case FileType.GEOPACKAGE:
        if (file.size < 1024) {
          result.errors.push('GeoPackage file too small to be valid');
        }
        break;

      case FileType.GEOPARQUET:
        if (file.size < 1024) {
          result.errors.push('GeoParquet file too small to be valid');
        }
        break;

      case FileType.GEOJSON:
        if (file.size > 20 * 1024 * 1024) {
          result.warnings.push(
            'Large GeoJSON, consider a more efficient format like GeoPackage'
          );
        }
        break;

      case FileType.UNKNOWN:
        result.errors.push('File type not recognized');
        break;
    }
  },

  async validateCSVContent(
    _file: File,
    buffer: ArrayBuffer,
    result: DetailedValidationResult
  ): Promise<void> {
    const text = new TextDecoder('utf-8').decode(buffer);
    const lines = text.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length === 0) {
      result.errors.push('Empty CSV file');
      return;
    }

    if (lines.length === 1) {
      result.warnings.push(
        'CSV file contains only one line (header or single row of data)'
      );
    }

    const separators = [',', ';', '\t', '|'];
    let detectedSeparator = ',';
    let maxCount = 0;

    for (const sep of separators) {
      const count = (lines[0].match(new RegExp(sep, 'g')) || []).length;
      if (count > maxCount) {
        maxCount = count;
        detectedSeparator = sep;
      }
    }

    if (maxCount === 0) {
      result.warnings.push(
        'No separator detected, file may not be a valid CSV'
      );
    }

    const firstLineColumns = lines[0].split(detectedSeparator).length;
    let inconsistentLines = 0;

    for (let i = 1; i < Math.min(lines.length, 10); i++) {
      if (lines[i].split(detectedSeparator).length !== firstLineColumns) {
        inconsistentLines++;
      }
    }

    if (inconsistentLines > 0) {
      result.warnings.push('Inconsistent column count in first rows');
    }

    const hasBOM =
      buffer.byteLength >= 3 &&
      new Uint8Array(buffer)[0] === 0xef &&
      new Uint8Array(buffer)[1] === 0xbb &&
      new Uint8Array(buffer)[2] === 0xbf;

    if (hasBOM) {
      result.metadata!.encoding = `${PIPELINE_CONST.ENCODING.DEFAULT} with BOM`;
    } else {
      result.metadata!.encoding = PIPELINE_CONST.ENCODING.DEFAULT;
    }
  },

  async validateGeoJSONContent(
    file: File,
    buffer: ArrayBuffer,
    result: DetailedValidationResult
  ): Promise<void> {
    const text = new TextDecoder('utf-8').decode(buffer);

    try {
      const trimmed = text.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        result.errors.push('File does not start with { or [');
        return;
      }

      if (file.size < 1024 * 1024) {
        const parsed = JSON.parse(text);

        if (!parsed.type) {
          result.warnings.push(
            'Missing "type" property, may not be a valid GeoJSON'
          );
        } else if (
          ![
            GEOJSON_TYPE.FEATURE,
            GEOJSON_TYPE.FEATURE_COLLECTION,
            ...SIMPLE_GEOMETRY_TYPES,
            GEOJSON_TYPE.GEOMETRY_COLLECTION
          ].includes(parsed.type)
        ) {
          result.errors.push(`Invalid GeoJSON type: ${parsed.type}`);
        }

        if (
          parsed.type === GEOJSON_TYPE.FEATURE_COLLECTION &&
          !parsed.features
        ) {
          result.errors.push('FeatureCollection without "features" property');
        }
      }
    } catch (error) {
      logger.error(
        'GeoJSON content validation failed',
        LogCategory.FILE,
        error
      );
      if (file.size < 1024 * 1024) {
        result.errors.push('Invalid JSON');
      } else {
        result.warnings.push('Cannot fully validate JSON (file too large)');
      }
    }
  },

  async validateShapefileContent(
    file: File,
    buffer: ArrayBuffer,
    result: DetailedValidationResult
  ): Promise<void> {
    const view = new DataView(buffer);
    const ext = getFileExtension(file.name);

    if (ext === 'shp' && buffer.byteLength >= 4) {
      const magic = view.getUint32(0, false);
      if (magic !== 0x0000270a) {
        result.errors.push('Invalid SHP file signature');
      }
    }

    if (ext === 'dbf' && buffer.byteLength >= 1) {
      const version = view.getUint8(0);
      const validVersions = [0x03, 0x83, 0x8b, 0xcb, 0xf5, 0xfb];
      if (!validVersions.includes(version)) {
        result.warnings.push('Non-standard DBF version');
      }
    }
  },

  async validateGeoPackageContent(
    file: File,
    buffer: ArrayBuffer,
    result: DetailedValidationResult
  ): Promise<void> {
    const signature = new Uint8Array(buffer.slice(0, 16));
    const sqliteSignature = new TextDecoder('ascii').decode(signature);

    if (!sqliteSignature.startsWith('SQLite format 3')) {
      result.errors.push('Invalid GeoPackage file (not a SQLite file)');
      return;
    }

    if (file.size < 10 * 1024) {
      result.warnings.push('GeoPackage file suspiciously small');
    }
  },

  validateShapefileGroup(
    _files: File[],
    _results: Map<string, DetailedValidationResult>,
    _globalErrors: string[]
  ): void {},

  requiresAsyncValidation(fileType: FileType): boolean {
    return [
      FileType.CSV,
      FileType.TSV,
      FileType.GEOJSON,
      FileType.SHAPEFILE,
      FileType.GEOPACKAGE,
      FileType.GEOPARQUET
    ].includes(fileType);
  },

  async readFileHeader(file: File, bytes: number = 512): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const blob = file.slice(0, Math.min(bytes, file.size));

      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  },

  getMagicNumber(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer.slice(0, 8));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')
      .toUpperCase();
  },

  validateURL(url: string): DetailedValidationResult {
    const result: DetailedValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fileType: FileType.UNKNOWN,
      requiresAsyncValidation: false
    };

    try {
      const parsed = new URL(url);

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        result.errors.push('Only HTTP and HTTPS protocols are allowed');
      }

      const blockedDomains = ['localhost', '127.0.0.1', '0.0.0.0'];
      const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
      if (!isDev && blockedDomains.includes(parsed.hostname)) {
        result.errors.push('Domain not allowed');
      }

      const pathname = parsed.pathname;
      const extension = pathname.split('.').pop()?.toLowerCase();

      if (extension && config.allowedExtensions.includes(extension)) {
        result.fileType = FileValidator.detectFileType({
          name: pathname,
          type: ''
        } as File);
      } else {
        result.warnings.push('Cannot determine file type from URL');
      }

      if (parsed.protocol === 'http:') {
        result.warnings.push('Using insecure HTTP');
      }
    } catch (error) {
      logger.error('URL validation failed', LogCategory.FILE, error);
      result.errors.push('Invalid URL');
    }

    result.isValid = result.errors.length === 0;
    return result;
  }
} as const;

export const SUPPORTED_FILE_TYPES = {
  tabular: {
    extensions: ['.csv', '.tsv', '.txt'],
    mimeTypes: ['text/csv', 'text/tab-separated-values', 'text/plain'],
    description: 'Tabular data (CSV, TSV)'
  },
  geojson: {
    extensions: ['.geojson', '.json'],
    mimeTypes: ['application/geo+json', 'application/json'],
    description: 'GeoJSON'
  },
  shapefile: {
    extensions: ['.shp', '.shx', '.dbf', '.prj', '.cpg'],
    mimeTypes: ['application/x-shapefile', 'application/octet-stream'],
    description: 'Shapefile (all components)'
  },
  geopackage: {
    extensions: ['.gpkg'],
    mimeTypes: ['application/geopackage+sqlite3'],
    description: 'GeoPackage'
  },
  geoparquet: {
    extensions: ['.geoparquet', '.gpq', '.parquet'],
    mimeTypes: [
      'application/geoparquet',
      'application/x-parquet',
      'application/parquet'
    ],
    description: 'GeoParquet'
  },
  kml: {
    extensions: ['.kml', '.kmz'],
    mimeTypes: [
      'application/vnd.google-earth.kml+xml',
      'application/vnd.google-earth.kmz'
    ],
    description: 'KML / KMZ'
  },
  gpx: {
    extensions: ['.gpx'],
    mimeTypes: ['application/gpx+xml'],
    description: 'GPX (GPS Exchange)'
  },
  zip: {
    extensions: ['.zip'],
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    description: 'ZIP archive'
  }
};
