// Core
export { Duck, initDuckDB } from './duck';

// Orchestrator
export { duckDBOrchestrator } from './orchestrator/orchestrator.svelte';

// Validator
export { DuckDBValidatorService } from './validator.service';

// Arrow converter
export {
  insertArrowTableIntoDuckDB,
  convertTabularDataToArrow
} from './io/arrow-converter';

// Types
export { RefineOperation } from './types';
export type {
  AnalysisResult,
  AnalysisResults,
  ArrowTableLike,
  SearchResultWithScore,
  SearchStats,
  FilterOperator,
  DataTableFilter,
  DataTableFilterInput,
  FilterStats,
  DuckDBDataset,
  DuckDBMetadata,
  DuckDBContext,
  TableMetadata,
  QueryOptions,
  ReadTabularOptions,
  ReadGeofileOptions,
  ReadLinkOptions,
  JoinByIdOptions,
  AnalyseOptions,
  GPSColumns,
  GPSBounds,
  FinalizeJoinResult
} from './types';

// Constants
export { DUCK_CONST, CACHE_CONSTANTS } from './constants';
