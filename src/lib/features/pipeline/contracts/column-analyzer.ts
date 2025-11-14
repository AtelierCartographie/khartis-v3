import type { InferredColumn } from '../models/inferred-column';
import type { ColumnAnalysis } from '../models/column-analysis';

/**
 * Column analyzer interface - Strategy pattern
 *
 * Responsibility: Perform specialized analysis on a single column
 *
 * Each analyzer handles ONE column type (numeric, text, date, geometry, etc.)
 * Analyzers are selected by ColumnAnalyzerFactory based on column type.
 *
 * @example
 * ```typescript
 * class NumericColumnAnalyzer implements IColumnAnalyzer {
 *   analyze(column: InferredColumn, values: unknown[]): ColumnAnalysis {
 *     const numbers = values.filter(v => typeof v === 'number') as number[];
 *
 *     return {
 *       distribution: this.computeDistribution(numbers),
 *       outliers: this.detectOutliers(numbers),
 *       suggested: {
 *         visualization: 'histogram',
 *         breaks: this.suggestBreaks(numbers)
 *       }
 *     };
 *   }
 * }
 * ```
 */
export interface IColumnAnalyzer {
  /**
   * Analyze column and extract specialized insights
   *
   * @param column - InferredColumn with name, type, values
   * @param values - Array of values to analyze
   * @returns ColumnAnalysis with specialized insights
   */
  analyze(column: InferredColumn, values: unknown[]): ColumnAnalysis;
}
