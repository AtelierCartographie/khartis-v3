export interface ColumnInfo {
  name: string;
  type: string;
}

export type TableRow = Record<string, unknown>;

export type SortOrder = 'ASC' | 'DESC' | null;

export type ColumnType = 'text' | 'number' | 'date' | 'boolean';

export const TABLE_ROW_HEIGHT = 32;
export const DOM_UPDATE_DELAY_MS = 50;
