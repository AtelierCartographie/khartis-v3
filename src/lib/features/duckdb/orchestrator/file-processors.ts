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
