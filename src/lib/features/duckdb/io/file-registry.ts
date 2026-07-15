import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import * as duckdb from '@duckdb/duckdb-wasm';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { DUCK_CONST } from '../constants';
import type { FileWithId, RegisterFilesOptions } from '../types';

const DBF_HEADER_LENGTH_OFFSET = 8;
const DBF_FIELD_DESCRIPTOR_LENGTH = 32;
const DBF_FIELD_NAME_LENGTH = 11;
const DBF_HEADER_TERMINATOR = 0x0d;

function normalizeName(str: string): string {
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

export function extractFilename(url: string): string {
  return url.split('/').pop() || '';
}

export function getFileType(
  filename: string
): 'tabular' | 'geofile' | 'parquet' {
  const basename = filename.split(/[?#]/, 1)[0];
  if (DUCK_CONST.REGEX.TABULAR.test(basename)) return DUCK_CONST.TYPE.TABULAR;
  if (DUCK_CONST.REGEX.GEO.test(basename)) return DUCK_CONST.TYPE.GEOFILE;
  if (DUCK_CONST.REGEX.PARQUET.test(basename)) return DUCK_CONST.TYPE.PARQUET;
  return DUCK_CONST.TYPE.TABULAR;
}

export function generateUniqueTableName(
  filename: string,
  existingNames: Map<string, string>
): string {
  const splitFilename = (name: string): string => {
    const index = name.indexOf('.');
    if (index === -1) return name;
    return name.slice(0, index);
  };
  const baseName = splitFilename(normalizeName(filename));
  let tablename = baseName;
  let counter = 1;
  while (existingNames.has(tablename)) {
    tablename = `${baseName}_${counter}`;
    counter++;
  }
  return tablename;
}

function addFileId(file: FileWithId): void {
  file.id = 'f_' + file.lastModified + '-' + normalizeName(file.name);
}

function isDbfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.dbf');
}

function decodeDbfFieldName(bytes: Uint8Array): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end -= 1;
  }

  return String.fromCharCode(...bytes.slice(0, end));
}

function encodeDbfFieldName(name: string): Uint8Array {
  const encoded = new Uint8Array(DBF_FIELD_NAME_LENGTH);

  for (
    let index = 0;
    index < name.length && index < DBF_FIELD_NAME_LENGTH;
    index += 1
  ) {
    encoded[index] = name.charCodeAt(index) & 0xff;
  }

  return encoded;
}

function normalizeDbfFieldKey(name: string): string {
  return name.trim().toLowerCase();
}

function createUniqueDbfFieldName(name: string, usedKeys: Set<string>): string {
  const trimmed = name.trim() || 'field';
  let attempt = 2;

  while (true) {
    const suffix = `_${attempt}`;
    const maxBaseLength = DBF_FIELD_NAME_LENGTH - suffix.length;
    const candidate = `${trimmed.slice(0, Math.max(1, maxBaseLength))}${suffix}`;
    const key = normalizeDbfFieldKey(candidate);

    if (!usedKeys.has(key)) {
      return candidate;
    }

    attempt += 1;
  }
}

async function patchDuplicateDbfFieldNames(file: File): Promise<File> {
  if (!isDbfFile(file)) {
    return file;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const headerLength =
    bytes[DBF_HEADER_LENGTH_OFFSET] |
    (bytes[DBF_HEADER_LENGTH_OFFSET + 1] << 8);

  if (
    !Number.isFinite(headerLength) ||
    headerLength <= DBF_FIELD_DESCRIPTOR_LENGTH ||
    headerLength > bytes.length
  ) {
    return file;
  }

  const fieldDescriptors: Array<{ offset: number; name: string }> = [];
  for (
    let offset = DBF_FIELD_DESCRIPTOR_LENGTH;
    offset + DBF_FIELD_DESCRIPTOR_LENGTH <= headerLength;
    offset += DBF_FIELD_DESCRIPTOR_LENGTH
  ) {
    if (bytes[offset] === DBF_HEADER_TERMINATOR) {
      break;
    }

    const nameBytes = bytes.slice(offset, offset + DBF_FIELD_NAME_LENGTH);
    fieldDescriptors.push({
      offset,
      name: decodeDbfFieldName(nameBytes)
    });
  }

  const usedKeys = new Set<string>();
  let renamedCount = 0;

  for (const descriptor of fieldDescriptors) {
    const currentKey = normalizeDbfFieldKey(descriptor.name);
    if (!usedKeys.has(currentKey)) {
      usedKeys.add(currentKey);
      continue;
    }

    const replacement = createUniqueDbfFieldName(descriptor.name, usedKeys);
    usedKeys.add(normalizeDbfFieldKey(replacement));
    bytes.set(encodeDbfFieldName(replacement), descriptor.offset);
    renamedCount += 1;
  }

  if (renamedCount === 0) {
    return file;
  }

  return new File([bytes], file.name, {
    type: file.type,
    lastModified: file.lastModified
  });
}

/**
 * Registers a list of files with the DuckDB database.
 *
 * Iterates over the provided files, assigns a unique ID to each file,
 * and registers it with DuckDB if it hasn't been registered already.
 *
 * @param db - The DuckDB instance.
 * @param registered_files - Set of already-registered file IDs.
 * @param files - An array of File objects to be registered.
 * @param options.shapefile - If true, all sibling files will share the same id (necessary for the spatial extension).
 */
export async function registerFiles(
  db: AsyncDuckDB,
  registered_files: Set<string>,
  files: File[],
  options: RegisterFilesOptions = {}
): Promise<void> {
  const { shapefile = false } = options;
  let shape_date: number | undefined;

  if (shapefile) {
    const shp = [...files].reverse().find((file) => file.name.endsWith('.shp'));
    shape_date = shp?.lastModified;
  }

  for (const file of files) {
    const fileWithId = file as FileWithId;
    if (shapefile && shape_date) {
      fileWithId.id = 'f_' + shape_date + '-' + normalizeName(file.name);
    } else {
      addFileId(fileWithId);
    }

    if (registered_files.has(fileWithId.id)) {
      continue;
    }

    const fileForDuckDB =
      shapefile && isDbfFile(file)
        ? await patchDuplicateDbfFieldNames(file)
        : file;

    await db.registerFileHandle(
      fileWithId.id,
      fileForDuckDB,
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
      true
    );
    registered_files.add(fileWithId.id);
  }
}

export async function dropRegisteredFile(
  db: AsyncDuckDB | null,
  registered_files: Set<string>,
  fileId: string | undefined
): Promise<void> {
  if (!fileId || !db) return;

  try {
    await db.dropFile(fileId);
  } catch (error) {
    logger.error(
      'Failed to drop registered DuckDB file',
      LogCategory.DUCKDB,
      error
    );
  } finally {
    registered_files.delete(fileId);
  }
}
