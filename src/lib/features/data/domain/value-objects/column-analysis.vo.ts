/**
 * Column analysis value object
 *
 * Specialized analysis beyond basic statistics.
 * Content varies by column type (numeric, text, date, geometry).
 *
 * @example
 * ```typescript
 * // Numeric column analysis
 * const analysis: ColumnAnalysis = {
 *   distribution: {
 *     histogram: [10, 20, 30, 25, 15],
 *     bins: [0, 20, 40, 60, 80, 100]
 *   },
 *   outliers: [985, 1002, 1050],
 *   suggested: {
 *     visualization: 'histogram',
 *     breaks: [0, 25, 50, 75, 100]
 *   }
 * };
 *
 * // Text column analysis
 * const analysis: ColumnAnalysis = {
 *   topValues: [
 *     { value: 'France', count: 50 },
 *     { value: 'Germany', count: 30 }
 *   ],
 *   suggested: {
 *     visualization: 'categorical',
 *     categoryType: 'nominal'
 *   }
 * };
 * ```
 */
export interface ColumnAnalysis {
  /**
   * Distribution info (for numeric/date columns)
   */
  distribution?: {
    histogram: number[];
    bins: number[];
  };

  /**
   * Detected outliers (for numeric columns)
   */
  outliers?: unknown[];

  /**
   * Top values (for text/categorical columns)
   */
  topValues?: Array<{ value: unknown; count: number }>;

  /**
   * Suggested visualizations and parameters
   */
  suggested?: {
    visualization: string;
    breaks?: number[];
    categoryType?: 'nominal' | 'ordinal';
  };

  /**
   * Geometry-specific info (for geometry columns)
   */
  geometryInfo?: {
    geometryType: string;
    bounds: [number, number, number, number];
    centroid: [number, number];
  };

  /**
   * Date-specific info (for date columns)
   */
  dateInfo?: {
    earliest: Date;
    latest: Date;
    range: string; // e.g., "2020-2025"
  };
}
