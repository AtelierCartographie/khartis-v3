type ErrorWithStackCapture = ErrorConstructor & {
  captureStackTrace?: (targetObject: object, constructorOpt?: unknown) => void;
};

type ErrorDetails = Record<string, unknown>;

function captureStack(error: Error, constructorOpt: unknown): void {
  (Error as ErrorWithStackCapture).captureStackTrace?.(error, constructorOpt);
}

export class PipelineError extends Error {
  code: string;

  details?: ErrorDetails;

  constructor(message: string, code: string, details?: ErrorDetails) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
    this.details = details;
    captureStack(this, PipelineError);
  }
}

const DATA_VALIDATION_CODE = 'DATA_VALIDATION_ERROR';

export class DataValidationError extends PipelineError {
  field?: string;

  constructor(message: string, field?: string, details?: ErrorDetails) {
    super(message, DATA_VALIDATION_CODE, {
      field,
      ...details
    });
    this.name = 'DataValidationError';
    this.field = field;
    captureStack(this, DataValidationError);
  }
}

const PARSE_ERROR_CODE = 'PARSE_ERROR';

export class ParseError extends PipelineError {
  fileType?: string;

  constructor(message: string, fileType?: string, details?: ErrorDetails) {
    super(message, PARSE_ERROR_CODE, {
      fileType,
      ...details
    });
    this.name = 'ParseError';
    this.fileType = fileType;
    captureStack(this, ParseError);
  }
}

const DUCKDB_ERROR_CODE = 'DUCKDB_ERROR';

export class DuckDBError extends PipelineError {
  query?: string;

  constructor(message: string, query?: string, details?: ErrorDetails) {
    super(message, DUCKDB_ERROR_CODE, {
      query,
      ...details
    });
    this.name = 'DuckDBError';
    this.query = query;
    captureStack(this, DuckDBError);
  }
}

export function isPipelineError(error: unknown): error is PipelineError {
  return error instanceof PipelineError;
}

export class NonFatalError extends PipelineError {
  constructor(message: string, code: string, details?: ErrorDetails) {
    super(message, code, details);
    this.name = 'NonFatalError';
    captureStack(this, NonFatalError);
  }
}

const DUPLICATE_FILE_CODE = 'DUPLICATE_FILE';

export class DuplicateFileError extends NonFatalError {
  fileName: string;

  constructor(message: string, fileName: string, details?: ErrorDetails) {
    super(message, DUPLICATE_FILE_CODE, {
      fileName,
      ...details
    });
    this.name = 'DuplicateFileError';
    this.fileName = fileName;
    captureStack(this, DuplicateFileError);
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
