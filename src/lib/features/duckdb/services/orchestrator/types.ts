import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import type { GeoArrowMetadata } from '$lib/features/data-pipeline/models/geo-arrow-metadata';
import { FileType } from '$lib/features/commons/store/create-project.types';
import type { Table } from 'apache-arrow/Arrow';
import type { AnalysisResult } from '../duckdb/types';

export { FileType };

export enum RefineOperation {
  UPPERCASE = 'uppercase',
  LOWERCASE = 'lowercase',
  TITLECASE = 'titlecase',
  TRIM = 'trim',
  TRIM_ALL = 'trim_all'
}

export type FilterOperator =
  | 'gte'
  | 'lte'
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'between'
  | 'top_asc'
  | 'top_desc'
  | 'empty'
  | 'not_empty';

export interface DataTableFilterInput {
  column: string;
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

export interface DuckDBDataset {
  id: string;
  tableName: string;
  sourceFileId: string;
  name: string;
  columns: AnalysisResult[];
  rowCount: number;
  metadata: {
    processedAt: Date;
    fileType: FileType;
  };
  geoDetection?: GeoDetectionResult;
  arrowTableWithMetadata?: Table;
  geoArrowMetadata?: GeoArrowMetadata;
  joinedBasemap?: string;
  geoColumn?: string;
  gpsMode?: boolean;
  gpsColumns?: { lat: string; lon: string };
}

export interface OrchestratorState {
  datasets: Map<string, DuckDBDataset>;
  currentTableName: string | null;
}
