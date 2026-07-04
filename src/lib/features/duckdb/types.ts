import type { GeoArrowMetadata } from '$lib/features/commons/types/geoarrow.types';

export type { GeoArrowMetadata };
export { FileType } from '$lib/features/commons/types/create-project.types';

export {
  DuckDBSimplifiedType,
  FilterOperatorEnum,
  QueryFormatEnum,
  RefineOperation
} from './enums';
export type { FilterOperator, QueryFormat } from './enums';

export type {
  AnalysisResult,
  AnalysisResults,
  DuckDBMetadata
} from './types/analysis.types';

export type { DuckDBContext } from './types/context.types';

export type {
  ArrowTableLike,
  CellSearchResult,
  DuckDBDataset,
  FinalizeJoinResult,
  GPSBounds,
  GPSColumns,
  SearchStats
} from './types/dataset.types';

export type {
  ExtensionsLoaded,
  ExtensionLoadPromises
} from './types/extension.types';

export type {
  AnalyseOptions,
  FileWithId,
  ReadGeofileOptions,
  ReadLinkOptions,
  ReadTabularOptions,
  RegisterFilesOptions
} from './types/io.types';

export type {
  DescribeResult,
  DuckDBStreamingBindings,
  DuckDBUnsafeBindings,
  QueryOptions
} from './types/query.types';

export type {
  DataTableFilter,
  DataTableFilterInput,
  FilterStats,
  JoinInfo,
  TableMetadata
} from './types/table.types';
