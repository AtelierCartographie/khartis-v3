type CsvPrimitive = string | number | boolean | null | Date;

export type CsvMatrix = CsvPrimitive[][];

export interface ColumnInfo {
  name: string;
  type: string;
  stats: {
    count?: number;
    nulls?: number;
    uniques?: number;
    min?: unknown;
    max?: unknown;
    mean?: number;
  };
}
