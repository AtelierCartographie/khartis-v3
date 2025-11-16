import type { ColumnType } from '../models/column-type';
import type { InferredColumn } from '../models/inferred-column';
import type { RawColumn } from '../models/raw-column';

/**
 * Type inferrer interface - Strategy pattern
 *
 * Responsibility: Infer column types from values
 *
 * Type inference follows priority: boolean → date → number → geometry → text
 * Each implementation uses different heuristics.
 *
 * @example
 * ```typescript
 * class HeuristicTypeInferrer implements ITypeInferrer {
 *   inferType(values: unknown[]): ColumnType {
 *     if (values.every(v => typeof v === 'boolean')) {
 *       return ColumnType.BOOLEAN;
 *     }
 *     return ColumnType.TEXT;
 *   }
 *
 *   inferColumnTypes(columns: RawColumn[]): InferredColumn[] {
 *     return columns.map(col => ({
 *       ...col,
 *       type: this.inferType(col.values)
 *     }));
 *   }
 * }
 * ```
 */
export interface ITypeInferrer {
  /**
   * Infer type of a single column from its values
   *
   * @param values - Array of values from the column
   * @returns Inferred ColumnType
   */
  inferType(values: unknown[]): ColumnType;

  /**
   * Infer types for all columns
   *
   * @param columns - Array of RawColumn (name + values)
   * @returns Array of InferredColumn (name + values + type)
   */
  inferColumnTypes(columns: RawColumn[]): InferredColumn[];
}
