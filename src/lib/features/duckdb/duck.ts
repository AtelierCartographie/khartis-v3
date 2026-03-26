import { getTableMetadata, markTableMutated } from './cache/cache-manager';
import {
  getContext,
  initEngine,
  isInitialized,
  loadMacros
} from './core/engine';
import { executeQuery, executeQueryStreaming } from './core/query';
import { exportToCsv, exportToGeoparquet } from './io/exporters';
import { registerFiles } from './io/file-registry';
import { readGeofile, readLink, readTabular } from './io/readers';
import { analyse, describeColumns } from './operations/analysis';

import { applyJoinAssociation, joinById } from './operations/join';
import { searchInTable } from './operations/search';
import { describeTable, dropRows, getRowCount } from './operations/table-ops';

import { analyse as analyseMacros } from './macros/analyse';
import { breaks as breaksMacros } from './macros/breaks';
import { join_macros } from './macros/join';
import { search_macros } from './macros/search';
import { simplification_macros } from './macros/simplification';

import type {
  AnalyseOptions,
  AnalysisResults,
  DuckDBMetadata,
  JoinByIdOptions,
  QueryOptions,
  ReadGeofileOptions,
  ReadLinkOptions,
  ReadTabularOptions,
  RegisterFilesOptions,
  SearchStats,
  TableMetadata
} from './types';

/**
 * DuckDB facade object exposing the legacy public API.
 *
 * Provides helpers to initialize the engine, ingest files, run queries,
 * run analyses/search/join operations, export datasets and manage table metadata.
 *
 * Main API methods:
 * - initDuckDB()
 * - query(sql, options?)
 * - register_files(files, options?)
 * - read_tabular(input, options?)
 * - read_geofile(geofile, options?)
 * - read_link(url, options?)
 * - describe_table(table)
 * - get_row_count(table)
 * - describeColumns(table)
 * - analyse(table, options?)
 * - searchInTable(table, searchQuery, options?)
 * - join_by_id(table, tableId, options?)
 * - apply_join_association(table, basemap)
 * - copy_to_csv_as_string(table, options?)
 * - copy_to_geoparquet_as_buffer(table)
 * - drop_rows(table, rowsId)
 * - get_table_metadata(table)
 * - invalidateTableCache(table)
 */
export const Duck = {
  get db() {
    return isInitialized() ? getContext().db : null;
  },

  get connection() {
    return isInitialized() ? getContext().connection : null;
  },

  get loaded_files() {
    return isInitialized() ? getContext().loaded_files : new Map();
  },

  get registered_files(): Set<string> {
    return isInitialized() ? getContext().registered_files : new Set<string>();
  },

  get table_metadata() {
    return isInitialized() ? getContext().table_metadata : new Map();
  },

  get table_geoparquet_cache() {
    return isInitialized() ? getContext().table_geoparquet_cache : new Map();
  },

  async query(sql: string, options?: QueryOptions): Promise<unknown> {
    const ctx = getContext();
    return executeQuery(ctx.connection, sql, options);
  },

  /**
   * Execute a query in streaming mode — reduces peak WASM memory for large results.
   * Returns a raw IPC buffer (Uint8Array). Use for full-table exports with geometry.
   */
  async queryStreaming(sql: string): Promise<Uint8Array> {
    const ctx = getContext();
    return executeQueryStreaming(ctx.connection, sql);
  },

  async register_files(
    files: File[],
    options?: RegisterFilesOptions
  ): Promise<void> {
    const ctx = getContext();
    return registerFiles(ctx.db, ctx.registered_files, files, options);
  },

  async read_tabular(
    input: string | File,
    options?: ReadTabularOptions
  ): Promise<string> {
    const ctx = getContext();
    return readTabular(ctx, input, options);
  },

  async read_geofile(
    geofile: File,
    options?: ReadGeofileOptions
  ): Promise<DuckDBMetadata | string> {
    const ctx = getContext();
    return readGeofile(ctx, geofile, options);
  },

  async read_link(url: string, options?: ReadLinkOptions): Promise<string> {
    const ctx = getContext();
    return readLink(ctx, url, options);
  },

  async describe_table(
    table: string
  ): Promise<{ name: string[]; type: string[] }> {
    const ctx = getContext();
    return describeTable(ctx, table);
  },

  async get_row_count(table: string): Promise<number> {
    const ctx = getContext();
    return getRowCount(ctx, table);
  },

  async drop_rows(table: string, rowsId: number[]): Promise<void> {
    const ctx = getContext();
    return dropRows(ctx, table, rowsId);
  },

  async copy_to_csv_as_string(
    table: string,
    options?: { delimiter?: string; header?: boolean }
  ): Promise<string> {
    const ctx = getContext();
    return exportToCsv(ctx, table, options);
  },

  async copy_to_geoparquet_as_buffer(table: string): Promise<Uint8Array> {
    const ctx = getContext();
    return exportToGeoparquet(ctx, table);
  },

  async describeColumns(table: string): Promise<AnalysisResults> {
    const ctx = getContext();
    return describeColumns(ctx, table);
  },

  async analyse(
    table: string,
    options?: AnalyseOptions
  ): Promise<AnalysisResults> {
    const ctx = getContext();
    return analyse(ctx, table, options);
  },

  async searchInTable(
    table: string,
    searchQuery: string,
    options?: { threshold?: number; column?: string }
  ): Promise<SearchStats> {
    const ctx = getContext();
    return searchInTable(ctx, table, searchQuery, options);
  },

  async join_by_id(
    table: string,
    tableId: string,
    options?: JoinByIdOptions
  ): Promise<AnalysisResults> {
    const ctx = getContext();
    return joinById(ctx, table, tableId, options);
  },

  async apply_join_association(table: string, basemap: string): Promise<void> {
    const ctx = getContext();
    return applyJoinAssociation(ctx, table, basemap);
  },

  invalidateTableCache(table: string): void {
    const ctx = getContext();
    markTableMutated(ctx, table);
  },

  get_table_metadata(table: string): TableMetadata {
    const ctx = getContext();
    return getTableMetadata(ctx, table);
  },

  cleanupTableResources(tableName: string): void {
    if (!isInitialized()) return;
    const ctx = getContext();

    ctx.loaded_files.delete(tableName);

    const registeredFile = Array.from(ctx.registered_files).find((id) =>
      id.includes(tableName)
    );
    if (registeredFile) {
      ctx.registered_files.delete(registeredFile);
    }

    ctx.table_metadata.delete(tableName);
    ctx.table_geoparquet_cache.delete(tableName);
  }
};

let duckInitPromise: Promise<void> | null = null;

export async function initDuckDB(): Promise<void> {
  if (isInitialized()) return;

  if (duckInitPromise) {
    await duckInitPromise;
    return;
  }

  duckInitPromise = (async () => {
    try {
      await initEngine();
      const allMacros =
        breaksMacros +
        analyseMacros +
        join_macros +
        search_macros +
        simplification_macros;
      await loadMacros(allMacros);
    } catch (error) {
      duckInitPromise = null;
      throw error;
    }
  })();

  await duckInitPromise;
}
