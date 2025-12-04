import { TypeInferenceError } from '$lib/features/commons/errors/pipeline.errors';
import type { DuckDBValue, ValidationResult } from '../types/index.js';
import { DUCK_CONST, type FileType, type FileWithId } from './types';

/**
 * Normalizes a string by removing accents, special characters, etc.
 */
export function normalizeName(str: string): string {
  let normalized = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\.\.|[/\\\\])/g, '')
    .replace(/[^a-zA-Z0-9_.]/g, '_');

  if (/^[0-9]/.test(normalized)) {
    normalized = 'a_' + normalized;
  }

  const maxLength = 150;
  if (normalized.length > maxLength) {
    normalized = normalized.substring(0, maxLength);
  }

  return normalized;
}

/**
 * Extract the filename from a url.
 */
export function extractFilename(url: string): string {
  return url.split('/').pop() || '';
}

/**
 * Get the type of file based on extension.
 */
export function getFileType(filename: string): FileType {
  if (DUCK_CONST.REGEX.TABULAR.test(filename)) return DUCK_CONST.TYPE.TABULAR;
  if (DUCK_CONST.REGEX.GEO.test(filename)) return DUCK_CONST.TYPE.GEOFILE;
  if (DUCK_CONST.REGEX.PARQUET.test(filename)) return DUCK_CONST.TYPE.PARQUET;
  return DUCK_CONST.TYPE.TABULAR;
}

/**
 * Generates a unique table name from a filename.
 */
export function generateUniqueTableName(
  filename: string,
  existingNames: Map<string, string>
): string {
  const splitFilename = (name: string): string => {
    const index = name.indexOf('.');
    if (index === -1) return name;
    return name.slice(0, index);
  };
  let tablename = normalizeName(filename);
  let counter = 1;
  tablename = splitFilename(tablename);
  while (existingNames.has(tablename)) {
    tablename = `${tablename}_${counter}`;
    counter++;
  }
  return tablename;
}

/**
 * Adds a unique identifier to a file object.
 */
export function addFileId(file: FileWithId): void {
  file.id = file.lastModified + '-' + normalizeName(file.name);
}

/**
 * Check if the value is an integer.
 */
export function isValidInteger(value: number | string): boolean {
  return (
    (typeof value === 'number' && Number.isInteger(value)) ||
    (typeof value === 'string' &&
      DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test(value))
  );
}

/**
 * Check if the value is a float.
 */
export function isValidFloat(value: number | string): boolean {
  return (
    typeof value === 'number' ||
    (typeof value === 'string' &&
      DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test(value))
  );
}

/**
 * Check if the value is a boolean.
 */
export function isValidBoolean(value: number | string | boolean): boolean {
  return (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    (typeof value === 'string' &&
      (DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test(value) ||
        DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_NUMBER.test(value)))
  );
}

/**
 * Validates and potentially casts a value based on a specified column type.
 */
export function validateAndCastValue(
  new_value: unknown,
  column_type: string
): ValidationResult {
  let isValid = false;
  let value: DuckDBValue = new_value as DuckDBValue;

  switch (column_type.toLowerCase()) {
    case 'integer':

    /* falls through */
    case 'bigint':
      isValid = isValidInteger(new_value as string | number);
      value =
        typeof new_value === 'string'
          ? parseInt(new_value, 10)
          : (new_value as number);
      break;

    case 'number':
      isValid = isValidFloat(new_value as string | number);
      value =
        typeof new_value === 'string'
          ? parseFloat(new_value)
          : (new_value as number);
      break;

    case 'string':
      isValid = true;
      value = String(new_value);
      break;

    case 'boolean':
      isValid = isValidBoolean(new_value as string | number | boolean);
      if (typeof new_value === 'number' || typeof new_value === 'boolean')
        value = Boolean(new_value);
      else if (typeof new_value === 'string') {
        if (new_value.toLowerCase() === 'true' || new_value === '1')
          value = true;
        if (new_value.toLowerCase() === 'false' || new_value === '0')
          value = false;
      }
      break;

    case 'date':
      if (
        new_value instanceof Date ||
        (typeof new_value === 'string' && !isNaN(Date.parse(new_value)))
      ) {
        isValid = true;
        if (!(new_value instanceof Date)) value = new Date(new_value);
      }
      break;

    case 'geometry':

    /* falls through */
    case 'other':

    /* falls through */
    default:
      throw new TypeInferenceError(
        `Unsupported column type: ${column_type}.`,
        undefined,
        {
          columnType: column_type
        }
      );
  }
  return { isValid, value };
}
