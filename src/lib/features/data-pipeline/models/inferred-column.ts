import type { ColumnType } from './column-type';
import type { RawColumn } from './raw-column';

/**
 * Raw column enriched with an inferred type.
 */
export interface InferredColumn extends RawColumn {
  type: ColumnType;
}
