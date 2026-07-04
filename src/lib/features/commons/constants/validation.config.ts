import { FileType } from '../types/create-project.types';

export type { ValidationResult } from '$lib/features/data-pipeline/types';

export {
  validationSuccess,
  validationFailure
} from '$lib/features/data-pipeline/types';

interface StorageLimits {
  maxFileSize: number;
  warningFileSize: number;
  maxProjectSize: number;
  maxProjectCount: number;
  maxStorageSize: number;
  maxTotalFileSize: number;
  maxFileCount: number;
}

export const FILE_SIZE_LIMITS: Record<FileType, number> = {
  [FileType.CSV]: 150 * 1024 * 1024,
  [FileType.TSV]: 150 * 1024 * 1024,
  [FileType.GEOJSON]: 150 * 1024 * 1024,
  [FileType.SHAPEFILE]: 200 * 1024 * 1024,
  [FileType.GEOPACKAGE]: 200 * 1024 * 1024,
  [FileType.GEOPARQUET]: 200 * 1024 * 1024,
  [FileType.ARROW]: 200 * 1024 * 1024,
  [FileType.KML]: 150 * 1024 * 1024,
  [FileType.KMZ]: 150 * 1024 * 1024,
  [FileType.GPX]: 150 * 1024 * 1024,
  [FileType.ZIP]: 100 * 1024 * 1024,
  [FileType.UNKNOWN]: 100 * 1024 * 1024
};

export const STORAGE_LIMITS: StorageLimits = {
  maxFileSize: 200 * 1024 * 1024,
  warningFileSize: 120 * 1024 * 1024,
  maxProjectSize: 150 * 1024 * 1024,
  maxProjectCount: 50,
  maxStorageSize: 500 * 1024 * 1024,
  maxTotalFileSize: 200 * 1024 * 1024,
  maxFileCount: 20
};

export const FILE_VALIDATION_INSPECTION = {
  CSV_LARGE_WARNING_SIZE_BYTES: 10 * 1024 * 1024,
  GEOJSON_LARGE_WARNING_SIZE_BYTES: 20 * 1024 * 1024,
  CSV_SAMPLE_LINE_COUNT: 10,
  GEOJSON_PARSE_SIZE_LIMIT_BYTES: 1024 * 1024,
  SHAPEFILE_MIN_SIZE_BYTES: 100,
  GEOPACKAGE_MIN_SIZE_BYTES: 1024,
  GEOPACKAGE_SUSPICIOUS_SMALL_SIZE_BYTES: 10 * 1024,
  GEOPARQUET_MIN_SIZE_BYTES: 1024,
  HEADER_READ_BYTES: 512,
  MAGIC_NUMBER_BYTES: 8,
  SHP_MAGIC_NUMBER: 0x0000270a,
  UTF8_BOM_BYTES: [0xef, 0xbb, 0xbf] as readonly number[],
  DBF_VALID_VERSIONS: [0x03, 0x83, 0x8b, 0xcb, 0xf5, 0xfb] as readonly number[]
} as const;

export function getMaxFileSizeForType(fileType: FileType): number {
  return FILE_SIZE_LIMITS[fileType] ?? STORAGE_LIMITS.maxFileSize;
}

export function getWarningFileSizeForType(fileType: FileType): number {
  return Math.floor(getMaxFileSizeForType(fileType) * 0.8);
}
