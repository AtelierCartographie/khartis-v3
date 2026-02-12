export { Duck, initDuckDB } from './duck';
export { duckDBOrchestrator } from './orchestrator/orchestrator.svelte';
export { validateGPSColumns } from './orchestrator/gps-ops';
export type { GPSValidationResult } from './orchestrator/gps-ops';
export { RefineOperation } from './types';
export type {
  AnalyseOptions,
  AnalysisResult,
  AnalysisResults,
  ArrowTableLike,
  CellSearchResult,
  DataTableFilter,
  DataTableFilterInput,
  DuckDBContext,
  DuckDBDataset,
  DuckDBMetadata,
  FilterOperator,
  FilterStats,
  FinalizeJoinResult,
  GPSBounds,
  GPSColumns,
  JoinByIdOptions,
  QueryOptions,
  ReadGeofileOptions,
  ReadLinkOptions,
  ReadTabularOptions,
  SearchStats,
  TableMetadata
} from './types';
