import type { InferredColumn } from './inferred-column';
import type { ColumnStats } from './column-stats';
import type { GeometryInfo } from './geometry-info';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';

/**
 * Final output of the data pipeline ready for UI and analysis layers.
 */
export interface DatasetResult {
  id: string;
  name: string;
  sourceFileId: string;
  tableName: string;
  columns: EnrichedColumn[];
  rowCount: number;
  geometry?: GeometryInfo;
  metadata: {
    processedAt: Date;
    fileType: string;
    parserUsed: string;
    processingDuration?: number;
    transformations?: string[]; // Sequence of transformations applied downstream.
    geoDuckTableReady?: boolean;
  };
  data?: Record<string, unknown>[]; // Deprecated: prefer querying the DuckDB table.
  originalData?: {
    columns: EnrichedColumn[];
    data: Record<string, unknown>[];
    rowCount: number;
  }; // Deprecated: kept for compatibility with older UI flows.
  fileSize?: number;
  format?: string;
  analysis?: {
    columns: EnrichedColumn[];
    hasGeoData: boolean;
    geoColumns?: unknown[];
    suggestedGeoColumn?: string;
    rowCount: number;
    warnings: string[];
  }; // Legacy analysis data kept until consumers migrate.
  createdAt?: Date;
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  geoDetection?: GeoDetectionResult;
}

export interface EnrichedColumn extends InferredColumn {
  stats: ColumnStats;
}
