import type { InferredColumn } from './inferred-column.entity';
import type { ColumnStats } from '../value-objects/column-stats.vo';
import type { GeometryInfo } from '../value-objects/geometry-info.vo';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';

/**
 * Dataset result entity
 *
 * Final output of data pipeline - fully processed and analyzed dataset.
 * Contains everything needed for visualization and analysis.
 *
 * @example
 * ```typescript
 * const result: DatasetResult = {
 *   id: '123e4567-e89b-12d3-a456-426614174000',
 *   name: 'countries.csv',
 *   sourceFileId: 'file-abc123',
 *   tableName: 'countries_mhtf02n5',
 *   columns: [
 *     {
 *       name: 'population',
 *       type: ColumnType.NUMBER,
 *       values: [...],
 *       stats: {
 *         count: 100,
 *         nulls: 0,
 *         uniques: 98,
 *         min: 100000,
 *         max: 1400000000,
 *         mean: 50000000,
 *         median: 30000000,
 *         stdDev: 150000000
 *       }
 *     }
 *   ],
 *   rowCount: 100,
 *   geometry: {
 *     type: 'Point',
 *     bounds: [-180, -90, 180, 90],
 *     centroid: [0, 0]
 *   },
 *   metadata: {
 *     processedAt: new Date(),
 *     fileType: 'csv',
 *     parserUsed: 'CSVParser',
 *     processingDuration: 150
 *   }
 * };
 * ```
 */
export interface DatasetResult {
  /**
   * Unique dataset ID
   */
  id: string;

  /**
   * Dataset name (usually filename)
   */
  name: string;

  /**
   * Source file ID (for tracking)
   */
  sourceFileId: string;

  /**
   * Analytics engine table name (e.g., DuckDB table)
   */
  tableName: string;

  /**
   * Fully enriched columns (type + stats + analysis)
   */
  columns: EnrichedColumn[];

  /**
   * Total row count
   */
  rowCount: number;

  /**
   * Geometry info (for spatial datasets)
   */
  geometry?: GeometryInfo;

  /**
   * Processing metadata
   */
  metadata: {
    processedAt: Date;
    fileType: string;
    parserUsed: string;
    processingDuration?: number;
    transformations?: string[];
  };

  /**
   * Raw data rows (for backwards compatibility)
   * @deprecated Use DuckDB queries via tableName instead
   */
  data?: Record<string, unknown>[];

  /**
   * Original data before transformations (for backwards compatibility)
   * @deprecated
   */
  originalData?: {
    columns: EnrichedColumn[];
    data: Record<string, unknown>[];
    rowCount: number;
  };

  /**
   * File size in bytes (for backwards compatibility)
   */
  fileSize?: number;

  /**
   * File format (for backwards compatibility)
   */
  format?: string;

  /**
   * Analysis result (for backwards compatibility)
   */
  analysis?: {
    columns: EnrichedColumn[];
    hasGeoData: boolean;
    geoColumns?: unknown[];
    suggestedGeoColumn?: string;
    rowCount: number;
    warnings: string[];
  };

  /**
   * Created timestamp (for backwards compatibility)
   */
  createdAt?: Date;

  /**
   * Bounds (for backwards compatibility with GeoJSON)
   */
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };

  /**
   * Geo column detection metadata (from DeepDataValidator)
   */
  geoDetection?: GeoDetectionResult;
}

/**
 * Enriched column - combines inferred column with statistics
 */
export interface EnrichedColumn extends InferredColumn {
  /**
   * Column statistics (from analytics engine)
   */
  stats: ColumnStats;
}
