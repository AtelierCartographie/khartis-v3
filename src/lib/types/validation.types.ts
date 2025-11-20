/**
 * Validation Types - Centralized type definitions for data validation
 *
 * These types provide proper typing for validation operations,
 * replacing 'any' types throughout the codebase.
 */

/**
 * Validation result structure
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Field validation result (for individual fields)
 */
export interface FieldValidationResult extends ValidationResult {
  fieldName: string;
  fieldValue: unknown;
}

/**
 * Data validation context
 */
export interface ValidationContext {
  strict?: boolean;
  skipWarnings?: boolean;
  maxErrors?: number;
  customRules?: ValidationRule[];
}

/**
 * Validation rule
 */
export interface ValidationRule<T = unknown> {
  name: string;
  validate: (value: T, context?: ValidationContext) => ValidationResult;
  severity: 'error' | 'warning';
}

/**
 * Data type validation
 */
export type ValidatableDataType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'object'
  | 'null'
  | 'undefined';

/**
 * Type validator function
 */
export type TypeValidator = (value: unknown) => boolean;

/**
 * Column validation result
 */
export interface ColumnValidationResult extends ValidationResult {
  columnName: string;
  columnIndex: number;
  detectedType: ValidatableDataType;
  nullCount: number;
  validCount: number;
  invalidCount: number;
  sampleInvalidValues?: unknown[];
}

/**
 * Dataset validation result
 */
export interface DatasetValidationResult extends ValidationResult {
  rowCount: number;
  columnCount: number;
  columnValidations: ColumnValidationResult[];
  hasGeoData: boolean;
  estimatedSize: number;
}

/**
 * File validation result
 */
export interface FileValidationResult extends ValidationResult {
  filename: string;
  fileSize: number;
  fileType: string;
  requiresAsyncValidation: boolean;
}

/**
 * Geo data validation result
 */
export interface GeoValidationResult extends ValidationResult {
  hasValidGeometry: boolean;
  geometryType?: string;
  featureCount?: number;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

/**
 * CSV validation options
 */
export interface CsvValidationOptions {
  maxRows?: number;
  maxColumns?: number;
  allowEmptyRows?: boolean;
  allowDuplicateHeaders?: boolean;
  encoding?: string;
}

/**
 * GeoJSON validation options
 */
export interface GeoJsonValidationOptions {
  maxFeatures?: number;
  validateGeometry?: boolean;
  allowNullGeometry?: boolean;
  strictCRS?: boolean;
}

/**
 * Validation helper type for data matrices
 */
export type DataMatrix = unknown[][];

/**
 * Row validation function type
 */
export type RowValidator = (
  row: unknown[],
  rowIndex: number,
  headers: string[]
) => ValidationResult;

/**
 * Column validation function type
 */
export type ColumnValidator = (
  values: unknown[],
  columnName: string,
  columnIndex: number
) => ColumnValidationResult;

/**
 * Type guards for validation results
 */
export function isValidationError(
  result: ValidationResult
): result is ValidationResult & { isValid: false } {
  return !result.isValid;
}

export function hasWarnings(result: ValidationResult): boolean {
  return result.warnings.length > 0;
}

/**
 * Helper to merge validation results
 */
export function mergeValidationResults(
  results: ValidationResult[]
): ValidationResult {
  return {
    isValid: results.every((r) => r.isValid),
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings)
  };
}

/**
 * Helper to create success validation result
 */
export function validationSuccess(warnings: string[] = []): ValidationResult {
  return {
    isValid: true,
    errors: [],
    warnings
  };
}

/**
 * Helper to create error validation result
 */
export function validationError(
  errors: string[],
  warnings: string[] = []
): ValidationResult {
  return {
    isValid: false,
    errors,
    warnings
  };
}
