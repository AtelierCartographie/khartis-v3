export type { ValidationResult } from '$lib/features/data-pipeline/types';

export {
  validationSuccess,
  validationFailure,
  mergeValidationResults
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

export const STORAGE_LIMITS: StorageLimits = {
  maxFileSize: 100 * 1024 * 1024,
  warningFileSize: 50 * 1024 * 1024,
  maxProjectSize: 150 * 1024 * 1024,
  maxProjectCount: 50,
  maxStorageSize: 500 * 1024 * 1024,
  maxTotalFileSize: 100 * 1024 * 1024,
  maxFileCount: 20
};
