import type { ColumnType } from './column-type';
import type { RawColumn } from './raw-column';

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
 *   type: ColumnType.NUMBER
 * };
 * The type field represents the inferred classification derived from the values.
 * ```
 */
export interface InferredColumn extends RawColumn {
  /**
   * Inferred column type
   */
  type: ColumnType;
}
