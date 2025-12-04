/**
 * Centralized configuration for validation limits
 * Avoids duplication of constants between validation.utils.ts and file-validator.utils.ts
 */

export interface StorageLimits {
  maxFileSize: number;
  maxProjectSize: number;
  maxProjectCount: number;
  maxStorageSize: number;
  maxTotalFileSize: number;
  maxFileCount: number;
}

/**
 * Storage and file limits for the application
 * All validation files should use these constants
 */
export const STORAGE_LIMITS: StorageLimits = {
  /** Maximum size of an individual file: 50 MB */
  maxFileSize: 50 * 1024 * 1024,

  /** Maximum size of a complete project: 100 MB */
  maxProjectSize: 100 * 1024 * 1024,

  /** Maximum number of stored projects */
  maxProjectCount: 50,

  /** Maximum total storage size: 500 MB */
  maxStorageSize: 500 * 1024 * 1024,

  /** Maximum total size of all imported files: 100 MB */
  maxTotalFileSize: 100 * 1024 * 1024,

  /** Maximum number of files in an import */
  maxFileCount: 20
};

/**
 * Base interface for validation results
 * To be used as base for all validations
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
