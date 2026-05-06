import type { Table } from 'apache-arrow/Arrow';
import type { GeoArrowMetadata } from '$lib/features/commons/types/geoarrow.types';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import type { FileType } from '$lib/features/commons/types/create-project.types';
import type { AnalysisResult } from './analysis.types';

export interface CellSearchResult {
  rowId: number;
  columnName: string;
  value: string;
  score: number; // 1.0=exact, 0.99=contains, <0.99=fuzzy
}

export interface SearchStats {
  exactCount: number; // score === 1.0
  containsCount: number; // score === 0.99
  fuzzyCount: number; // score > threshold && score < 0.99
  totalCount: number;
  results: CellSearchResult[];
  isSampled?: boolean; // true if search was performed on a sample (large table)
}

export interface GPSColumns {
  lat: string;
  lon: string;
}

export interface GPSBounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface FinalizeJoinResult {
  joinedBasemap: string;
  geoColumn?: string;
  gpsMode?: boolean;
  gpsColumns?: GPSColumns;
}

export interface DuckDBDataset {
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
  geoDetection?: GeoDetectionResult;
  arrowTableWithMetadata?: Table;
  geoArrowMetadata?: GeoArrowMetadata;
  joinedBasemap?: string;
  geoColumn?: string;
  gpsMode?: boolean;
  gpsColumns?: GPSColumns;
}

export interface ArrowTableLike {
  get(index: number): Record<string, unknown>;
  numRows: number;
  toArray(): Record<string, unknown>[];
}
