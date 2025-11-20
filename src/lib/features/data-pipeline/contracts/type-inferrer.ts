import type { ColumnType } from '../models/column-type';
import type { InferredColumn } from '../models/inferred-column';
import type { RawColumn } from '../models/raw-column';

/**
 * Infers semantic column types from raw values.
 */
export interface ITypeInferrer {
  inferType(values: unknown[]): ColumnType;
  inferColumnTypes(columns: RawColumn[]): InferredColumn[];
}
