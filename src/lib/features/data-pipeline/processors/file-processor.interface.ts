import type { GeoArrowMetadata } from '$lib/features/commons/types/geoarrow.types';
import type { Table } from 'apache-arrow/Arrow';
import type { FileFormat, FileInfo } from '../types';
import type {
  FileType,
  UploadedFile
} from '$lib/features/commons/store/create-project.types';

export interface DuckDBClient {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  analyse(
    tableName: string,
    options?: { force?: boolean }
  ): Promise<AnalysisResultForProcessor[]>;
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

export interface AnalysisResultForProcessor {
  name: string;
  type_simple: string;
  min?: number | Date;
  max?: number | Date;
  histogram?: unknown;
  uniques?: number;
  nulls?: number;
  duplicates?: number;
  count?: number;
  [key: string]: unknown;
}

export interface ProcessorCallbacks {
  getRowCount: (tableName: string) => Promise<number>;
  createArrowTableWithMetadata: (tableName: string) => Promise<{
    arrowTableWithMetadata: Table;
    geoArrowMetadata: GeoArrowMetadata | null;
  }>;
}

export interface ProcessorDataset {
  id: string;
  tableName: string;
  sourceFileId: string;
  name: string;
  columns: AnalysisResultForProcessor[];
  rowCount: number;
  metadata: {
    processedAt: Date;
    fileType: FileType;
  };
  geoDetection?: unknown;
  arrowTableWithMetadata?: Table;
  geoArrowMetadata?: GeoArrowMetadata;
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

export type FileProcessorFactory = () => FileProcessor;

export interface FileProcessorRegistration {
  processor: FileProcessor;
  priority: number;
}
