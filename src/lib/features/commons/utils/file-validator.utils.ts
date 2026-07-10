import {
  FILE_VALIDATION_INSPECTION,
  getMaxFileSizeForType,
  getWarningFileSizeForType,
  STORAGE_LIMITS,
  type ValidationResult
} from '../constants/validation.config';
import { FileType } from '../types/create-project.types';
import { getFileExtension } from './file.utils';
import {
  detectFileType,
  SHAPEFILE_AUX_EXTENSIONS
} from './file-type-detection.utils';
import { EnvironmentUtils } from './environment.utils';
import {
  GEOJSON_TYPE,
  SIMPLE_GEOMETRY_TYPES
} from '$lib/features/commons/constants';
import { PIPELINE_CONST } from '$lib/features/data-pipeline/constants';
import * as m from '$lib/paraglide/messages';

const REQUIRED_SHAPEFILE_EXTENSIONS = ['shp', 'shx', 'dbf'] as const;
const SHAPEFILE_GROUP_EXTENSIONS = [
  ...REQUIRED_SHAPEFILE_EXTENSIONS,
  'prj',
  'cpg',
  ...SHAPEFILE_AUX_EXTENSIONS
] as const;
const SHAPEFILE_GROUP_EXTENSION_SET = new Set<string>(
  SHAPEFILE_GROUP_EXTENSIONS
);
const KHARTIS_PROJECT_ARCHIVE_EXTENSIONS = ['kh', 'khartis'];

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

    result.fileType = FileValidator.detectFileType(file);
    result.metadata!.detectedType = result.fileType;

    FileValidator.validateBasicProperties(file, result, result.fileType);

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
      const buffer = await FileValidator.readFileHeader(
        file,
        FILE_VALIDATION_INSPECTION.HEADER_READ_BYTES
      );
      result.metadata!.magicNumber = FileValidator.getMagicNumber(buffer);

      switch (result.fileType) {
        case FileType.CSV:
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
    } catch {
      result.errors.push(m.validation_content_check_failed());
    }

    result.isValid = result.errors.length === 0;
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
        m.validation_file_count_exceeded({ max: String(config.maxFileCount) })
      );
    }

    for (const file of files) {
      const result = FileValidator.validate(file);
      results.set(file.name, result);
      totalSize += file.size;
    }

    if (totalSize > config.maxTotalSize) {
      globalErrors.push(
        m.validation_total_size_exceeded({
          size: String(config.maxTotalSize / (1024 * 1024))
        })
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

  validateBasicProperties(
    file: File,
    result: DetailedValidationResult,
    fileType: FileType
  ): void {
    const maxFileSize = getMaxFileSizeForType(fileType);
    const warningFileSize = getWarningFileSizeForType(fileType);

    if (file.size === 0) {
      result.errors.push(m.validation_file_empty());
    } else if (file.size > maxFileSize) {
      result.errors.push(m.validation_file_too_large());
    } else if (file.size > warningFileSize) {
      result.warnings.push(m.validation_large_file_slow());
    }

    if (!file.name || file.name.length === 0) {
      result.errors.push(m.validation_invalid_filename());
    }

    const suspiciousPatterns = [
      /\.\./,
      /[<>:"|?*\\]/,

      new RegExp(
        '[' +
          String.fromCharCode(0) +
          '-' +
          String.fromCharCode(31) +
          String.fromCharCode(127) +
          ']'
      ),
      /^\./
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(file.name)) {
        result.warnings.push(m.validation_filename_unusual_chars());
        break;
      }
    }

    const extension = getFileExtension(file.name);
    if (!extension) {
      result.warnings.push(m.validation_no_extension());
    } else if (!config.allowedExtensions.includes(extension)) {
      if (config.strictMode) {
        result.errors.push(
          m.validation_extension_unsupported({ ext: extension })
        );
      } else {
        result.warnings.push(
          m.validation_extension_maybe_unsupported({ ext: extension })
        );
      }
    }

    if (file.type) {
      result.metadata!.actualMimeType = file.type;
      if (!config.allowedMimeTypes.includes(file.type.toLowerCase())) {
        result.warnings.push(
          m.validation_mime_unrecognized({ mime: file.type })
        );
      }
    }
  },

  detectFileType(file: File): FileType {
    return detectFileType(file);
  },

  validateByType(file: File, result: DetailedValidationResult): void {
    switch (result.fileType) {
      case FileType.CSV:
      case FileType.TSV:
        if (
          file.size > FILE_VALIDATION_INSPECTION.CSV_LARGE_WARNING_SIZE_BYTES
        ) {
          result.warnings.push(m.validation_csv_large_slow());
        }
        break;

      case FileType.SHAPEFILE: {
        const ext = getFileExtension(file.name);
        if (
          ext === 'shp' &&
          file.size < FILE_VALIDATION_INSPECTION.SHAPEFILE_MIN_SIZE_BYTES
        ) {
          result.warnings.push(m.validation_shp_too_small());
        }
        break;
      }

      case FileType.GEOPACKAGE:
        if (file.size < FILE_VALIDATION_INSPECTION.GEOPACKAGE_MIN_SIZE_BYTES) {
          result.errors.push(m.validation_gpkg_too_small());
        }
        break;

      case FileType.GEOPARQUET:
        if (file.size < FILE_VALIDATION_INSPECTION.GEOPARQUET_MIN_SIZE_BYTES) {
          result.errors.push(m.validation_geoparquet_too_small());
        }
        break;

      case FileType.GEOJSON:
        if (
          file.size >
          FILE_VALIDATION_INSPECTION.GEOJSON_LARGE_WARNING_SIZE_BYTES
        ) {
          result.warnings.push(m.validation_geojson_large());
        }
        break;

      case FileType.UNKNOWN:
        result.errors.push(m.validation_type_unrecognized());
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
      result.errors.push(m.validation_csv_empty());
      return;
    }

    if (lines.length === 1) {
      result.warnings.push(m.validation_csv_single_line());
    }

    const separators = [',', ';', '\t', '|'];
    let detectedSeparator = ',';
    let maxCount = 0;

    for (const sep of separators) {
      const count = lines[0].split(sep).length - 1;
      if (count > maxCount) {
        maxCount = count;
        detectedSeparator = sep;
      }
    }

    if (maxCount === 0) {
      result.warnings.push(m.validation_csv_no_separator());
    }

    const firstLineColumns = lines[0].split(detectedSeparator).length;
    let inconsistentLines = 0;

    for (
      let i = 1;
      i <
      Math.min(lines.length, FILE_VALIDATION_INSPECTION.CSV_SAMPLE_LINE_COUNT);
      i++
    ) {
      if (lines[i].split(detectedSeparator).length !== firstLineColumns) {
        inconsistentLines++;
      }
    }

    if (inconsistentLines > 0) {
      result.warnings.push(m.validation_csv_inconsistent_cols());
    }

    const hasBOM =
      buffer.byteLength >= FILE_VALIDATION_INSPECTION.UTF8_BOM_BYTES.length &&
      FILE_VALIDATION_INSPECTION.UTF8_BOM_BYTES.every(
        (byte, index) => new Uint8Array(buffer)[index] === byte
      );

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
    const text =
      file.size <= buffer.byteLength
        ? new TextDecoder('utf-8').decode(buffer)
        : await file.text();

    try {
      const trimmed = text.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        result.errors.push(m.validation_json_no_opening());
        return;
      }

      if (
        file.size < FILE_VALIDATION_INSPECTION.GEOJSON_PARSE_SIZE_LIMIT_BYTES
      ) {
        const parsed = JSON.parse(text);

        if (!parsed.type) {
          result.warnings.push(m.validation_geojson_missing_type_prop());
        } else if (
          ![
            GEOJSON_TYPE.FEATURE,
            GEOJSON_TYPE.FEATURE_COLLECTION,
            ...SIMPLE_GEOMETRY_TYPES,
            GEOJSON_TYPE.GEOMETRY_COLLECTION
          ].includes(parsed.type)
        ) {
          result.errors.push(
            m.validation_geojson_invalid_type({ type: parsed.type })
          );
        }

        if (
          parsed.type === GEOJSON_TYPE.FEATURE_COLLECTION &&
          !parsed.features
        ) {
          result.errors.push(m.validation_geojson_no_features_prop());
        }
      }
    } catch {
      if (
        file.size < FILE_VALIDATION_INSPECTION.GEOJSON_PARSE_SIZE_LIMIT_BYTES
      ) {
        result.errors.push(m.validation_json_invalid());
      } else {
        result.warnings.push(m.validation_json_too_large_to_validate());
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
      if (magic !== FILE_VALIDATION_INSPECTION.SHP_MAGIC_NUMBER) {
        result.errors.push(m.validation_shp_invalid_signature());
      }
    }

    if (ext === 'dbf' && buffer.byteLength >= 1) {
      const version = view.getUint8(0);
      if (!FILE_VALIDATION_INSPECTION.DBF_VALID_VERSIONS.includes(version)) {
        result.warnings.push(m.validation_dbf_nonstandard());
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
      result.errors.push(m.validation_gpkg_not_sqlite());
      return;
    }

    if (
      file.size <
      FILE_VALIDATION_INSPECTION.GEOPACKAGE_SUSPICIOUS_SMALL_SIZE_BYTES
    ) {
      result.warnings.push(m.validation_gpkg_suspicious_small());
    }
  },

  validateShapefileGroup(
    files: File[],
    results: Map<string, DetailedValidationResult>,
    globalErrors: string[]
  ): void {
    const groups = new Map<string, Map<string, File[]>>();

    for (const file of files) {
      const extension = getFileExtension(file.name).toLowerCase();
      if (!SHAPEFILE_GROUP_EXTENSION_SET.has(extension)) {
        continue;
      }

      const baseName = file.name
        .slice(0, Math.max(0, file.name.length - extension.length - 1))
        .toLowerCase();
      const group = groups.get(baseName) ?? new Map<string, File[]>();
      const filesForExtension = group.get(extension) ?? [];
      filesForExtension.push(file);
      group.set(extension, filesForExtension);
      groups.set(baseName, group);
    }

    for (const group of groups.values()) {
      const missing = REQUIRED_SHAPEFILE_EXTENSIONS.filter(
        (extension) => !group.has(extension)
      );
      if (missing.length === 0) {
        continue;
      }

      const message = m.shapefile_incomplete_message({
        missing: missing.map((extension) => `.${extension}`).join(', ')
      });
      globalErrors.push(message);

      for (const groupFiles of group.values()) {
        for (const file of groupFiles) {
          const result = results.get(file.name);
          if (result) {
            result.errors.push(message);
            result.isValid = false;
          }
        }
      }
    }
  },

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
    if (typeof FileReader === 'undefined') {
      const blob = file.slice(0, Math.min(bytes, file.size));
      return blob.arrayBuffer();
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const blob = file.slice(0, Math.min(bytes, file.size));

      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  },

  getMagicNumber(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(
      buffer.slice(0, FILE_VALIDATION_INSPECTION.MAGIC_NUMBER_BYTES)
    );
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
        result.errors.push(m.validation_url_protocol_restricted());
      }

      const blockedDomains = ['localhost', '127.0.0.1', '0.0.0.0'];
      if (
        !EnvironmentUtils.isDevelopment() &&
        blockedDomains.includes(parsed.hostname)
      ) {
        result.errors.push(m.validation_url_domain_blocked());
      }

      const pathname = parsed.pathname;
      const extension = pathname.split('.').pop()?.toLowerCase();

      if (extension && KHARTIS_PROJECT_ARCHIVE_EXTENSIONS.includes(extension)) {
        result.errors.push(m.validation_project_archive_use_open_project());
      }

      if (extension && config.allowedExtensions.includes(extension)) {
        result.fileType = FileValidator.detectFileType({
          name: pathname,
          type: ''
        } as File);
      } else {
        result.warnings.push(m.validation_url_no_filetype());
      }

      if (parsed.protocol === 'http:') {
        result.warnings.push(m.validation_url_insecure_http());
      }
    } catch {
      result.errors.push(m.validation_invalid_url());
    }

    result.isValid = result.errors.length === 0;
    return result;
  }
} as const;

export const SUPPORTED_FILE_TYPES = {
  tabular: {
    extensions: ['.csv', '.tsv', '.txt'],
    mimeTypes: ['text/csv', 'text/tab-separated-values', 'text/plain'],
    get description() {
      return m.file_type_tabular();
    }
  },
  geojson: {
    extensions: ['.geojson', '.json'],
    mimeTypes: ['application/geo+json', 'application/json'],
    get description() {
      return m.file_type_geojson();
    }
  },
  shapefile: {
    extensions: ['.shp', '.shx', '.dbf', '.prj', '.cpg'],
    mimeTypes: ['application/x-shapefile', 'application/octet-stream'],
    get description() {
      return m.file_type_shapefile();
    }
  },
  geopackage: {
    extensions: ['.gpkg'],
    mimeTypes: ['application/geopackage+sqlite3'],
    get description() {
      return m.file_type_geopackage();
    }
  },
  geoparquet: {
    extensions: ['.geoparquet', '.gpq', '.parquet'],
    mimeTypes: [
      'application/geoparquet',
      'application/x-parquet',
      'application/parquet'
    ],
    get description() {
      return m.file_type_geoparquet();
    }
  },
  kml: {
    extensions: ['.kml', '.kmz'],
    mimeTypes: [
      'application/vnd.google-earth.kml+xml',
      'application/vnd.google-earth.kmz'
    ],
    get description() {
      return m.file_type_kml();
    }
  },
  gpx: {
    extensions: ['.gpx'],
    mimeTypes: ['application/gpx+xml'],
    get description() {
      return m.file_type_gpx();
    }
  },
  zip: {
    extensions: ['.zip'],
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    get description() {
      return m.file_type_zip();
    }
  }
};
