import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import * as duckdb from '@duckdb/duckdb-wasm';
import { DUCK_CONST } from '../constants';
import type { FileWithId, RegisterFilesOptions } from '../types';

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

export function extractFilename(url: string): string {
  return url.split('/').pop() || '';
}

export function getFileType(
  filename: string
): 'tabular' | 'geofile' | 'parquet' | 'arrow' {
  if (DUCK_CONST.REGEX.ARROW.test(filename)) return DUCK_CONST.TYPE.ARROW;
  if (DUCK_CONST.REGEX.TABULAR.test(filename)) return DUCK_CONST.TYPE.TABULAR;
  if (DUCK_CONST.REGEX.GEO.test(filename)) return DUCK_CONST.TYPE.GEOFILE;
  if (DUCK_CONST.REGEX.PARQUET.test(filename)) return DUCK_CONST.TYPE.PARQUET;
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
  let tablename = normalizeName(filename);
  let counter = 1;
  tablename = splitFilename(tablename);
  while (existingNames.has(tablename)) {
    tablename = `${tablename}_${counter}`;
    counter++;
  }
  return tablename;
}

export function addFileId(file: FileWithId): void {
  file.id = file.lastModified + '-' + normalizeName(file.name);
}

export async function registerFiles(
  db: AsyncDuckDB,
  registered_files: Set<string>,
  files: File[],
  options: RegisterFilesOptions = {}
): Promise<void> {
  const { shapefile = false } = options;
  let shape_date: number | undefined;

  if (shapefile) {
    const shp = files.reverse().find((file) => file.name.endsWith('.shp'));
    shape_date = shp?.lastModified;
  }

  for (const file of files) {
    const fileWithId = file as FileWithId;
    if (shapefile && shape_date) {
      fileWithId.id = shape_date + '-' + normalizeName(file.name);
    } else {
      addFileId(fileWithId);
    }

    if (registered_files.has(fileWithId.id)) {
      continue;
    }

    await db.registerFileHandle(
      fileWithId.id,
      file,
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
    logger.warn('Failed to drop registered DuckDB file', LogCategory.DUCKDB, {
      fileId,
      error
    });
  } finally {
    registered_files.delete(fileId);
  }
}
