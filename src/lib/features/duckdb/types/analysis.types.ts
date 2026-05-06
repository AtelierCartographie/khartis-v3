import type { DuckDBSimplifiedType } from '../enums';

export interface DuckDBMetadata {
  name: string;
  format: string;
  nb_entities: number;
  geometry: string;
  crs: string;
}

export interface AnalysisResult {
  name: string;
  type_simple: DuckDBSimplifiedType;
  min?: number | Date;
  max?: number | Date;
  histogram?: unknown;
  uniques?: number;
  nulls?: number;
  duplicates?: number;
  count?: number;
  semioType?: 'geoid' | 'geolat' | 'geolon' | 'QTA' | 'QTR' | 'QL' | 'QLO';
  semioScore?: number;
  [key: string]: unknown;
}

export type AnalysisResults = AnalysisResult[];
