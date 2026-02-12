export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class DataValidationError extends PipelineError {
  constructor(
    message: string,
    public readonly field?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'DATA_VALIDATION_ERROR', { field, ...details });
  }
}

export class ParseError extends PipelineError {
  constructor(
    message: string,
    public readonly fileType?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'PARSE_ERROR', { fileType, ...details });
  }
}

export class DuckDBError extends PipelineError {
  constructor(
    message: string,
    public readonly query?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'DUCKDB_ERROR', { query, ...details });
  }
}

export function isPipelineError(error: unknown): error is PipelineError {
  return error instanceof PipelineError;
}

/**
 * Non-fatal error that should show a toast but NOT trigger rollback
 * Examples: duplicate files, validation warnings, data quality issues
 */
export class NonFatalError extends PipelineError {
  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>
  ) {
    super(message, code, details);
  }
}

export class DuplicateFileError extends NonFatalError {
  constructor(
    message: string,
    public readonly fileName: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'DUPLICATE_FILE', { fileName, ...details });
  }
}

export function isFatalError(error: unknown): boolean {
  if (!isPipelineError(error)) {
    return true;
  }

  if (error instanceof NonFatalError) {
    return false;
  }

  return true;
}

export function formatError(error: unknown): Record<string, unknown> {
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
