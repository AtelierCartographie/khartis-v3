import type { ColumnType } from '../types';
import type { GeoColumnTypeValue } from '$lib/features/commons/constants/data.constants';

export interface ColumnStats {
  name: string;
  type: ColumnType;
  count: number;
  nulls: number;
  uniques: number;
  min?: unknown;
  max?: unknown;
  mean?: number;
  median?: number;
  stdDev?: number;
  share_integers?: number;
  share_floats?: number;
  share_rank_interval?: number;
  extent_magnitude?: number;
  skewness?: number;
  /** A few real values of the column: min, its neighbour, the 5–95% quantiles, the max's neighbour, max. */
  value_sample?: number[];
  categories?: string[];
}

export interface EnrichedColumn {
  name: string;
  type: ColumnType;
  stats: ColumnStats;
}

export interface ColumnAnalysis {
  name?: string;
  type?: ColumnType | string;
  geo_type?: GeoColumnTypeValue;
  geo_confidence?: number;
  stats?: Partial<ColumnStats> & {
    totalCount?: number;
    uniqueCount?: number;
    nullCount?: number;
  };
  distribution?: { histogram: number[]; bins: number[] };
  outliers?: unknown[];
  topValues?: Array<{ value: unknown; count: number }>;
  suggested?: {
    visualization: string;
    breaks?: number[];
    categoryType?: 'nominal' | 'ordinal';
  };
  geometryInfo?: {
    geometryType: string;
    bounds: [number, number, number, number];
    centroid: [number, number];
  };
  dateInfo?: { earliest: Date; latest: Date; range: string };
}

export interface ColumnInfo {
  name: string;
  type: 'number' | 'string' | 'date' | 'boolean' | 'geometry';
  nullable: boolean;
  unique: boolean;
  min?: number | string | Date;
  max?: number | string | Date;
  mean?: number;
}
