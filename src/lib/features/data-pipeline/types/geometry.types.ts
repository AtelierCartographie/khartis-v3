import type { GeoColumnTypeValue } from '$lib/features/commons/constants/data.constants';
import type { EnrichedColumn, ColumnInfo } from './column.types';

export interface GeometryInfo {
  type: string;
  columnName?: string;
  bounds?: [number, number, number, number];
  centroid?: [number, number];
  crs?: string;
  featureCount?: number;
}

export interface GeoColumnInfo {
  index: number;
  columnName: string;
  type: GeoColumnTypeValue;
  confidence: number;
  isValid?: boolean;
}

export interface AnalysisResult {
  columns: EnrichedColumn[];
  geoColumns: GeoColumnInfo[];
  hasGeoData: boolean;
  suggestedGeoColumn?: string;
  rowCount: number;
  warnings: string[];
}

export interface ProcessedDatasetAnalysisResult {
  columns: ColumnInfo[];
  geoColumns: GeoColumnInfo[];
  hasGeoData: boolean;
  suggestedGeoColumn?: string;
  rowCount: number;
  warnings: string[];
}
