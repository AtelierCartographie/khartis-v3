import type { ColumnType } from './column-type';
import type { ColumnStats } from './column-stats';

/**
 * Enriched analysis built on top of column statistics.
 */
export interface ColumnAnalysis {
  name?: string;
  type?: ColumnType | string;
  stats?: Partial<ColumnStats> & {
    totalCount?: number;
    uniqueCount?: number;
    nullCount?: number;
  };
  distribution?: {
    histogram: number[];
    bins: number[];
  };
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
  dateInfo?: {
    earliest: Date;
    latest: Date;
    range: string;
  };
}
