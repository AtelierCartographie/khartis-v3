import type { GeoArrowMetadata } from '$lib/features/commons/types/geoarrow.types';
import type { Table } from 'apache-arrow/Arrow';
import type { AnalysisResult } from '../types';

export interface DuckDBClientForFileProcessing {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  analyse(
    tableName: string,
    options?: { force?: boolean }
  ): Promise<AnalysisResult[]>;
  register_files(
    files: File[],
    options?: { shapefile?: boolean }
  ): Promise<void>;
  read_tabular(
    file: File,
    options: { tablename: string }
  ): Promise<string | null>;
  read_geofile(
    file: File,
    options: { tablename: string; shapefile?: boolean }
  ): Promise<string | unknown>;
}

export interface FileProcessorCallbacks {
  getRowCount: (tableName: string) => Promise<number>;
  createArrowTableWithMetadata: (tableName: string) => Promise<{
    arrowTableWithMetadata: Table;
    geoArrowMetadata: GeoArrowMetadata | null;
  }>;
}
