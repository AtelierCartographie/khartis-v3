import type { ProcessedDataset } from '$lib/features/data-pipeline';

export interface ColumnInfo {
  name: string;
  type: string;
}

export type TableRow = Record<string, unknown>;

export interface AdvancedDataTableProps {
  dataset?: ProcessedDataset;

  tableName?: string;

  highlightIds?: number[];

  showSummaryPlots?: boolean;

  maxRows?: number;
}

export interface GetTableDataOptions {
  offset: number;
  limit: number;
  orderBy?: string | null;
  order?: 'ASC' | 'DESC' | null;
}

export interface TableDataResult {
  numRows: number;
  get(index: number): TableRow;
}

export type SortOrder = 'ASC' | 'DESC' | null;

export interface PlotOptions {
  width: number;
  height: number;
  main_color: string;
  nulls_color: string;
}

export const EXCLUDED_COLUMNS = ['geom', 'geometry', '__id'] as const;

export const TABLE_ROW_HEIGHT = 40;
