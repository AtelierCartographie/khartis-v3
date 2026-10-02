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
export { selectBasemapJoinKeyColumns } from './utils/basemap-join-key-columns.utils';
export type { MissingValueColumn } from './orchestrator/table-data-ops';
export { DuckDBSimplifiedType, RefineOperation } from './types';
export { GEO_CONSTANTS } from './constants';
export {
  buildTableInBackground,
  isBuiltTableFresh,
  isTableBuildPending,
  waitForTableBuild
} from './operations/background-table-build';
export {
  isGeometryColumnName,
  isGeometryColumnType
} from './utils/geometry-column.utils';
export type {
  AnalysisResult,
  AnalysisResults,
  DataTableFilter,
  DataTableFilterInput,
  DuckDBDataset,
  FileWithId,
  FilterOperator,
  FilterStats,
  GPSBounds,
  SearchStats
} from './types';
