import { describe, expect, it } from 'vitest';
import {
  DataValidationError,
  DuckDBError,
  DuplicateFileError,
  NonFatalError,
  ParseError,
  PipelineError,
  formatError,
  isFatalError,
  isPipelineError
} from '$lib/features/commons/pipeline.errors';

describe('pipeline errors', () => {
  it('keeps PipelineError instanceof behavior and formatting', () => {
    const error = new PipelineError('Pipeline failed', 'PIPELINE_FAILED', {
      step: 'import'
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PipelineError);
    expect(error.name).toBe('PipelineError');
    expect(error.code).toBe('PIPELINE_FAILED');
    expect(error.details).toEqual({ step: 'import' });
    expect(isPipelineError(error)).toBe(true);
    expect(isFatalError(error)).toBe(true);
    expect(formatError(error)).toMatchObject({
      name: 'PipelineError',
      code: 'PIPELINE_FAILED',
      message: 'Pipeline failed',
      details: { step: 'import' },
      isFatal: true
    });
  });

  it('keeps specialized fatal error fields and codes', () => {
    const validationError = new DataValidationError('Invalid value', 'name', {
      reason: 'empty'
    });
    const parseError = new ParseError('Invalid file', 'geojson', {
      line: 4
    });
    const duckError = new DuckDBError('Query failed', 'SELECT 1', {
      table: 'places'
    });

    expect(validationError).toBeInstanceOf(PipelineError);
    expect(validationError).toBeInstanceOf(DataValidationError);
    expect(validationError.name).toBe('DataValidationError');
    expect(validationError.code).toBe('DATA_VALIDATION_ERROR');
    expect(validationError.field).toBe('name');
    expect(validationError.details).toEqual({
      field: 'name',
      reason: 'empty'
    });

    expect(parseError).toBeInstanceOf(PipelineError);
    expect(parseError).toBeInstanceOf(ParseError);
    expect(parseError.name).toBe('ParseError');
    expect(parseError.code).toBe('PARSE_ERROR');
    expect(parseError.fileType).toBe('geojson');
    expect(parseError.details).toEqual({ fileType: 'geojson', line: 4 });

    expect(duckError).toBeInstanceOf(PipelineError);
    expect(duckError).toBeInstanceOf(DuckDBError);
    expect(duckError.name).toBe('DuckDBError');
    expect(duckError.code).toBe('DUCKDB_ERROR');
    expect(duckError.query).toBe('SELECT 1');
    expect(duckError.details).toEqual({
      query: 'SELECT 1',
      table: 'places'
    });
  });

  it('keeps non-fatal subclasses non-fatal', () => {
    const nonFatal = new NonFatalError('Skipped row', 'ROW_SKIPPED', {
      row: 2
    });
    const duplicate = new DuplicateFileError('Duplicate file', 'data.csv', {
      fileId: 'file-1'
    });

    expect(nonFatal).toBeInstanceOf(PipelineError);
    expect(nonFatal).toBeInstanceOf(NonFatalError);
    expect(nonFatal.name).toBe('NonFatalError');
    expect(isFatalError(nonFatal)).toBe(false);

    expect(duplicate).toBeInstanceOf(PipelineError);
    expect(duplicate).toBeInstanceOf(NonFatalError);
    expect(duplicate).toBeInstanceOf(DuplicateFileError);
    expect(duplicate.name).toBe('DuplicateFileError');
    expect(duplicate.code).toBe('DUPLICATE_FILE');
    expect(duplicate.fileName).toBe('data.csv');
    expect(duplicate.details).toEqual({
      fileName: 'data.csv',
      fileId: 'file-1'
    });
    expect(formatError(duplicate)).toMatchObject({
      name: 'DuplicateFileError',
      code: 'DUPLICATE_FILE',
      message: 'Duplicate file',
      isFatal: false
    });
  });

  it('formats native and non-error values as fatal errors', () => {
    expect(formatError(new Error('Native error'))).toMatchObject({
      name: 'Error',
      message: 'Native error',
      isFatal: true
    });
    expect(formatError('plain failure')).toEqual({
      error: 'plain failure',
      isFatal: true
    });
  });
});
