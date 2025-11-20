import type { InferredColumn } from '../models/inferred-column';
import type { ColumnAnalysis } from '../models/column-analysis';

/**
 * Performs specialized analysis for a single column type.
 */
export interface IColumnAnalyzer {
  analyze(column: InferredColumn, values: unknown[]): ColumnAnalysis;
}
