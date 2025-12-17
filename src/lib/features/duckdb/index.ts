// Core
export { Duck, initDuckDB } from './duck';

// Orchestrator
export { duckDBOrchestrator } from './orchestrator/orchestrator.svelte';

// GPS Operations
export { validateGPSColumns } from './orchestrator/gps-ops';
export type { GPSValidationResult } from './orchestrator/gps-ops';

// Validator
export { DuckDBValidatorService } from './validator.service';

// Arrow converter
export {
  convertTabularDataToArrow,
  insertArrowTableIntoDuckDB
} from './io/arrow-converter';

// Types
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
  SearchResultWithScore,
  SearchStats,
  TableMetadata
} from './types';

// Constants
export { CACHE_CONSTANTS, DUCK_CONST } from './constants';
