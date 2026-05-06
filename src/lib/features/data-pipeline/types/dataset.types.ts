import type { EnrichedColumn, ColumnInfo, RawColumn } from './column.types';
import type {
  GeometryInfo,
  AnalysisResult,
  ProcessedDatasetAnalysisResult
} from './geometry.types';
import type { DatasetMetadata, FileFormat } from './import.types';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import type { GeometryTypeEnum } from '../types';

export interface RawDataset {
  headers: string[];
  rows: unknown[][];
  columns: RawColumn[];
  geometry?: GeometryInfo;
  metadata: Record<string, unknown>;
}

export interface DatasetResult {
  id: string;
  name: string;
  sourceFileId: string;
  tableName: string;
  columns: EnrichedColumn[];
  rowCount: number;
  geometry?: GeometryInfo;
  metadata: DatasetMetadata;
  data?: Record<string, unknown>[];
  originalData?: {
    columns: EnrichedColumn[];
    data: Record<string, unknown>[];
    rowCount: number;
  };
  fileSize?: number;
  format?: FileFormat;
  analysis?: AnalysisResult;
  createdAt?: Date;
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  geoDetection?: GeoDetectionResult;
  joinedBasemap?: string;
  geoColumn?: string;
  simplificationApplied?: {
    rate: number;
    tolerance: number;
    originalVertices: number;
    simplifiedVertices: number;
    reductionPercentage: number;
    duration: number;
  };
}

export interface ProcessedDataset {
  id: string;
  name: string;
  sourceFileId?: string;
  format: FileFormat;
  data: Record<string, unknown>[];
  rowCount: number;
  columns: ColumnInfo[];
  analysis: ProcessedDatasetAnalysisResult;
  geometry?: `${GeometryTypeEnum}`;
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  duckdbTableName?: string;
  createdAt: Date;
  fileSize: number;
  metadata: { processedAt: Date; transformations: string[] };
  geoDetection?: GeoDetectionResult;
  originalData?: {
    columns: ColumnInfo[];
    data: Record<string, unknown>[];
    rowCount: number;
  };
}

export interface ZipDatasetResult {
  datasets: DatasetResult[];
  sourceZipName: string;
  totalFiles: number;
  processedFiles: number;
  skippedFiles: string[];
}
