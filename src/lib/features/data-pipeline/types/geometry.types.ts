import type { GeoLocationType } from '../types';
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
  type: `${GeoLocationType}`;
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
