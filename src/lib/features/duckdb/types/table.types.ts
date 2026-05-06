import type { AnalysisResults } from './analysis.types';
import type { FilterOperator } from '../enums';

export interface TableMetadata {
  analysis?: AnalysisResults | null;
  join: JoinInfo | null;
  filters: Map<number, string>;
  version?: number;
}

export interface JoinInfo {
  id: string;
  join_results_name: string;
  basemap_join_ref: string | null;
}

export interface DataTableFilterInput {
  column: string;
  columnType?: string | null;
  operator: FilterOperator;
  value?: string | number;
  secondaryValue?: string | number;
  limit?: number;
}

export interface DataTableFilter extends DataTableFilterInput {
  id: string;
  label: string;
  sql: string;
}

export interface FilterStats {
  total: number;
  filtered: number;
}
