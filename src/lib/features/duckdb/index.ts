export { Duck, initDuckDB } from './duck';
export { duckDBOrchestrator } from './orchestrator/orchestrator.svelte';
export { detectGPSColumns, validateGPSColumns } from './orchestrator/gps-ops';
export {
  buildFilterClause,
  buildFilterWhereClause,
  combineFilterClauses
} from './orchestrator/filter-ops';
export type { GPSValidationResult } from './orchestrator/gps-ops';
export type { JoinFuzzyPassEstimate } from './orchestrator/join-ops';
export { DuckDBSimplifiedType, RefineOperation } from './types';
export { GEO_CONSTANTS } from './constants';
export {
  findGeometryColumnByName,
  isGeometryColumnName,
  isGeometryColumnType
} from './utils/geometry-column.utils';
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
  FileWithId,
  FilterOperator,
  FilterStats,
  FinalizeJoinResult,
  GPSBounds,
  GPSColumns,
  QueryOptions,
  ReadGeofileOptions,
  ReadTabularOptions,
  SearchStats,
  TableMetadata
} from './types';
