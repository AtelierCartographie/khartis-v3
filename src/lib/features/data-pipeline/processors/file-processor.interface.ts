import type { AnalysisResult } from '$lib/features/duckdb';
import type {
  FileType,
  UploadedFile
} from '$lib/features/commons/types/create-project.types';

export interface DuckDBClient {
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
    options: { tablename: string; format?: string; decimal_separator?: string }
  ): Promise<string | null>;
  read_geofile(
    file: File,
    options: { tablename: string; shapefile?: boolean }
  ): Promise<string | unknown>;
}

export interface ProcessorCallbacks {
  getRowCount: (tableName: string) => Promise<number>;
}

export interface ProcessorDataset {
  id: string;
  tableName: string;
  sourceFileId: string;
  name: string;
  columns: AnalysisResult[];
  rowCount: number;
  metadata: {
    processedAt: Date;
    fileType: FileType;
  };
  geoDetection?: unknown;
}

export interface ProcessContext {
  Duck: DuckDBClient;
  callbacks: ProcessorCallbacks;
  tableName: string;
}

export interface FileProcessor {
  readonly supportedFileTypes: FileType[];
  canHandle(file: UploadedFile): boolean;
  process(ctx: ProcessContext, file: UploadedFile): Promise<ProcessorDataset>;
}
