import type { ColumnType } from '../value-objects/column-type.vo';
import type { RawColumn } from './raw-column.entity';

/**
 * Inferred column entity
 *
 * Extends RawColumn with inferred type information.
 * Created by TypeInferrer after analyzing raw values.
 *
 * @example
 * ```typescript
 * const column: InferredColumn = {
 *   name: 'population',
 *   values: ['1000', '2000', '3000'],
 *   type: ColumnType.NUMBER // Inferred from values
 * };
 * ```
 */
export interface InferredColumn extends RawColumn {
  /**
   * Inferred column type
   */
  type: ColumnType;
}
