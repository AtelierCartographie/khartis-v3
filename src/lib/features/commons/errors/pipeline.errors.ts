/**
 * Custom Error Classes for Data Pipeline
 * Provides typed errors for better error handling and debugging
 */

/**
 * Base class for all pipeline errors
 */
export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Data validation errors
 * Thrown when data fails validation checks
 */
export class DataValidationError extends PipelineError {
  constructor(
    message: string,
    public readonly field?: string,
    details?: Record<string, any>
  ) {
    super(message, 'DATA_VALIDATION_ERROR', { field, ...details });
  }
}

/**
 * File grouping errors (e.g., incomplete shapefiles)
 */
export class FileGroupError extends PipelineError {
  constructor(
    message: string,
    public readonly missingFiles: string[],
    details?: Record<string, any>
  ) {
    super(message, 'FILE_GROUP_ERROR', { missingFiles, ...details });
  }
}

/**
 * Size limit errors
 */
export class SizeLimitError extends PipelineError {
  constructor(
    message: string,
    public readonly actualSize: number,
    public readonly maxSize: number,
    details?: Record<string, any>
  ) {
    super(message, 'SIZE_LIMIT_ERROR', { actualSize, maxSize, ...details });
  }
}

/**
 * Expression/formula evaluation errors
 */
export class ExpressionError extends PipelineError {
  constructor(
    message: string,
    public readonly expression?: string,
    details?: Record<string, any>
  ) {
    super(message, 'EXPRESSION_ERROR', { expression, ...details });
  }
}

/**
 * File parsing errors
 */
export class ParseError extends PipelineError {
  constructor(
    message: string,
    public readonly fileType?: string,
    details?: Record<string, any>
  ) {
    super(message, 'PARSE_ERROR', { fileType, ...details });
  }
}

/**
 * DuckDB operation errors
 */
export class DuckDBError extends PipelineError {
  constructor(
    message: string,
    public readonly query?: string,
    details?: Record<string, any>
  ) {
    super(message, 'DUCKDB_ERROR', { query, ...details });
  }
}

/**
 * Geographic matching errors
 */
export class GeoMatchError extends PipelineError {
  constructor(
    message: string,
    public readonly matchRate?: number,
    details?: Record<string, any>
  ) {
    super(message, 'GEO_MATCH_ERROR', { matchRate, ...details });
  }
}

/**
 * Type inference errors
 */
export class TypeInferenceError extends PipelineError {
  constructor(
    message: string,
    public readonly column?: string,
    details?: Record<string, any>
  ) {
    super(message, 'TYPE_INFERENCE_ERROR', { column, ...details });
  }
}

/**
 * Helper function to check if an error is a pipeline error
 */
export function isPipelineError(error: unknown): error is PipelineError {
  return error instanceof PipelineError;
}

/**
 * Helper function to get error code from any error
 */
export function getErrorCode(error: unknown): string {
  if (isPipelineError(error)) {
    return error.code;
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Non-fatal error that should show a toast but NOT trigger rollback
 * Examples: duplicate files, validation warnings, data quality issues
 */
export class NonFatalError extends PipelineError {
  constructor(
    message: string,
    code: string,
    details?: Record<string, any>
  ) {
    super(message, code, details);
  }
}

/**
 * Duplicate file error (non-fatal)
 */
export class DuplicateFileError extends NonFatalError {
  constructor(
    message: string,
    public readonly fileName: string,
    details?: Record<string, any>
  ) {
    super(message, 'DUPLICATE_FILE', { fileName, ...details });
  }
}

/**
 * Data quality warning (non-fatal)
 */
export class DataQualityWarning extends NonFatalError {
  constructor(
    message: string,
    public readonly warnings: string[],
    details?: Record<string, any>
  ) {
    super(message, 'DATA_QUALITY_WARNING', { warnings, ...details });
  }
}

/**
 * Check if error is fatal (requires rollback)
 */
export function isFatalError(error: unknown): boolean {
  if (!isPipelineError(error)) {
    // Unknown errors are considered fatal
    return true;
  }

  // NonFatalError and its subclasses are not fatal
  if (error instanceof NonFatalError) {
    return false;
  }

  // All other PipelineErrors are fatal
  return true;
}

/**
 * Helper function to format error for logging
 */
export function formatError(error: unknown): Record<string, any> {
  if (isPipelineError(error)) {
    return {
      name: error.name,
      code: error.code,
      message: error.message,
      details: error.details,
      stack: error.stack,
      isFatal: isFatalError(error)
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      isFatal: true
    };
  }

  return {
    error: String(error),
    isFatal: true
  };
}
