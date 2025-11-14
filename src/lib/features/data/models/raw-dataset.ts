import type { RawColumn } from './raw-column';
import type { GeometryInfo } from './geometry-info';

/**
 * Raw dataset entity
 *
 * Output of Parser - raw data before type inference and analysis.
 * Represents data in tabular form (headers + rows).
 *
 * @example
 * ```typescript
 * const dataset: RawDataset = {
 *   headers: ['name', 'population', 'area'],
 *   rows: [
 *     ['France', '67000000', '643801'],
 *     ['Germany', '83000000', '357022']
 *   ],
 *   columns: [
 *     { name: 'name', values: ['France', 'Germany'] },
 *     { name: 'population', values: ['67000000', '83000000'] },
 *     { name: 'area', values: ['643801', '357022'] }
 *   ],
 *   geometry: undefined,
 *   metadata: {
 *     delimiter: ',',
 *     rowCount: 2
 *   }
 * };
 * ```
 */
export interface RawDataset {
  /**
   * Column headers
   */
  headers: string[];

  /**
   * Rows (array of arrays - column values in order)
   */
  rows: unknown[][];

  /**
   * Columns (alternative view - array of column objects)
   */
  columns: RawColumn[];

  /**
   * Geometry info (for spatial data only)
   */
  geometry?: GeometryInfo;

  /**
   * Parser-specific metadata
   */
  metadata: Record<string, unknown>;
}
