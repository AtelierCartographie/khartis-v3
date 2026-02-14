type ConstructorLike = { prototype: object };

type ErrorWithStackCapture = ErrorConstructor & {
  captureStackTrace?: (targetObject: object, constructorOpt?: unknown) => void;
};

type ErrorDetails = Record<string, unknown>;

function assignPrototype(
  child: ConstructorLike,
  parentPrototype: object
): void {
  child.prototype = Object.create(parentPrototype, {
    constructor: {
      value: child,
      writable: true,
      configurable: true
    }
  });
}

function captureStack(error: Error, ctor: ConstructorLike): void {
  (Error as ErrorWithStackCapture).captureStackTrace?.(error, ctor);
}

export interface PipelineError extends Error {
  code: string;
  details?: ErrorDetails;
}

interface PipelineErrorConstructor {
  new (message: string, code: string, details?: ErrorDetails): PipelineError;
  readonly prototype: PipelineError;
}

export const PipelineError: PipelineErrorConstructor = function PipelineError(
  this: PipelineError,
  message: string,
  code: string,
  details?: ErrorDetails
): PipelineError {
  const error = new Error(message) as PipelineError;
  Object.setPrototypeOf(error, PipelineError.prototype);
  error.name = 'PipelineError';
  error.code = code;
  error.details = details;
  captureStack(error, PipelineError);
  return error;
} as unknown as PipelineErrorConstructor;

assignPrototype(PipelineError, Error.prototype);

export interface DataValidationError extends PipelineError {
  field?: string;
}

interface DataValidationErrorConstructor {
  new (
    message: string,
    field?: string,
    details?: ErrorDetails
  ): DataValidationError;
  readonly prototype: DataValidationError;
}

const DATA_VALIDATION_CODE = 'DATA_VALIDATION_ERROR';

export const DataValidationError: DataValidationErrorConstructor =
  function DataValidationError(
    this: DataValidationError,
    message: string,
    field?: string,
    details?: ErrorDetails
  ): DataValidationError {
    const error = new PipelineError(message, DATA_VALIDATION_CODE, {
      field,
      ...details
    }) as DataValidationError;
    Object.setPrototypeOf(error, DataValidationError.prototype);
    error.name = 'DataValidationError';
    error.field = field;
    captureStack(error, DataValidationError);
    return error;
  } as unknown as DataValidationErrorConstructor;

assignPrototype(DataValidationError, PipelineError.prototype);

export interface ParseError extends PipelineError {
  fileType?: string;
}

interface ParseErrorConstructor {
  new (message: string, fileType?: string, details?: ErrorDetails): ParseError;
  readonly prototype: ParseError;
}

const PARSE_ERROR_CODE = 'PARSE_ERROR';

export const ParseError: ParseErrorConstructor = function ParseError(
  this: ParseError,
  message: string,
  fileType?: string,
  details?: ErrorDetails
): ParseError {
  const error = new PipelineError(message, PARSE_ERROR_CODE, {
    fileType,
    ...details
  }) as ParseError;
  Object.setPrototypeOf(error, ParseError.prototype);
  error.name = 'ParseError';
  error.fileType = fileType;
  captureStack(error, ParseError);
  return error;
} as unknown as ParseErrorConstructor;

assignPrototype(ParseError, PipelineError.prototype);

export interface DuckDBError extends PipelineError {
  query?: string;
}

interface DuckDBErrorConstructor {
  new (message: string, query?: string, details?: ErrorDetails): DuckDBError;
  readonly prototype: DuckDBError;
}

const DUCKDB_ERROR_CODE = 'DUCKDB_ERROR';

export const DuckDBError: DuckDBErrorConstructor = function DuckDBError(
  this: DuckDBError,
  message: string,
  query?: string,
  details?: ErrorDetails
): DuckDBError {
  const error = new PipelineError(message, DUCKDB_ERROR_CODE, {
    query,
    ...details
  }) as DuckDBError;
  Object.setPrototypeOf(error, DuckDBError.prototype);
  error.name = 'DuckDBError';
  error.query = query;
  captureStack(error, DuckDBError);
  return error;
} as unknown as DuckDBErrorConstructor;

assignPrototype(DuckDBError, PipelineError.prototype);

export function isPipelineError(error: unknown): error is PipelineError {
  return error instanceof PipelineError;
}

/**
 * Non-fatal error that should show a toast but NOT trigger rollback
 * Examples: duplicate files, validation warnings, data quality issues
 */
export type NonFatalError = PipelineError;

interface NonFatalErrorConstructor {
  new (message: string, code: string, details?: ErrorDetails): PipelineError;
  readonly prototype: PipelineError;
}

export const NonFatalError: NonFatalErrorConstructor = function NonFatalError(
  this: NonFatalError,
  message: string,
  code: string,
  details?: ErrorDetails
): NonFatalError {
  const error = new PipelineError(message, code, details) as NonFatalError;
  Object.setPrototypeOf(error, NonFatalError.prototype);
  error.name = 'NonFatalError';
  captureStack(error, NonFatalError);
  return error;
} as unknown as NonFatalErrorConstructor;

assignPrototype(NonFatalError, PipelineError.prototype);

export interface DuplicateFileError extends NonFatalError {
  fileName: string;
}

interface DuplicateFileErrorConstructor {
  new (
    message: string,
    fileName: string,
    details?: ErrorDetails
  ): DuplicateFileError;
  readonly prototype: DuplicateFileError;
}

const DUPLICATE_FILE_CODE = 'DUPLICATE_FILE';

export const DuplicateFileError: DuplicateFileErrorConstructor =
  function DuplicateFileError(
    this: DuplicateFileError,
    message: string,
    fileName: string,
    details?: ErrorDetails
  ): DuplicateFileError {
    const error = new NonFatalError(message, DUPLICATE_FILE_CODE, {
      fileName,
      ...details
    }) as DuplicateFileError;
    Object.setPrototypeOf(error, DuplicateFileError.prototype);
    error.name = 'DuplicateFileError';
    error.fileName = fileName;
    captureStack(error, DuplicateFileError);
    return error;
  } as unknown as DuplicateFileErrorConstructor;

assignPrototype(DuplicateFileError, NonFatalError.prototype);

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
