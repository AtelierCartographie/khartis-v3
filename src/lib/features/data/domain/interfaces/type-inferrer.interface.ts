import type { ColumnType } from '../value-objects/column-type.vo';
import type { InferredColumn } from '../entities/inferred-column.entity';
import type { RawColumn } from '../entities/raw-column.entity';

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
 *     // Check if all values are boolean
 *     if (values.every(v => typeof v === 'boolean')) {
 *       return ColumnType.BOOLEAN;
 *     }
 *     // ... other checks
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
