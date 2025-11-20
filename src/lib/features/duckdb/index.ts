export {
  duckDBOrchestrator,
  RefineOperation,
  type FilterOperator,
  type DataTableFilterInput,
  type DataTableFilter,
  type FilterStats,
  type DuckDBDataset
} from './services/duckdb-orchestrator.service.svelte';

export { DuckDBValidatorService } from './services/duckdb-validator.service';

export { Duck, initDuckDB } from './services/duckdb/duckdb';
export { insertArrowTableIntoDuckDB } from './services/duckdb/arrow-converter';
export type {
  AnalysisResult,
  ArrowTableLike,
  ColumnInfo
} from './services/duckdb/types';

export {
  duckDB,
  duckDbState,
  dbError,
  isDbInitializing,
  isDbReady,
  isQuerying,
  queryError
} from './db';
export type { DuckDBState, QueryState } from './db';
