import { FileType } from '../store/create-project.types';

export type { ValidationResult } from '$lib/features/data-pipeline/types';

export {
  validationSuccess,
  validationFailure
} from '$lib/features/data-pipeline/types';

export interface StorageLimits {
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

export function getMaxFileSizeForType(fileType: FileType): number {
  return FILE_SIZE_LIMITS[fileType] ?? STORAGE_LIMITS.maxFileSize;
}

export function getWarningFileSizeForType(fileType: FileType): number {
  return Math.floor(getMaxFileSizeForType(fileType) * 0.8);
}
