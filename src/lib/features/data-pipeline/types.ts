// Re-exports from commons geoarrow types
export type {
  GeoArrowCRS,
  GeoArrowColumnMetadata,
  GeoArrowMetadata
} from '$lib/features/commons/types/geoarrow.types';
export { isGeoArrowMetadata } from '$lib/features/commons/types/geoarrow.types';

// Enums and runtime helpers
export {
  ColumnType,
  computeCentroid,
  FileFormatEnum,
  fromDuckDBType,
  GeoLocationType,
  GeometryTypeEnum,
  isNumericType,
  isZipDatasetResult,
  validationFailure,
  validationSuccess
} from './enums';

// Column-related types
export type {
  ColumnAnalysis,
  ColumnInfo,
  ColumnStats,
  DuckAnalyticsColumn,
  EnrichedColumn,
  InferredColumn,
  RawColumn
} from './types/column.types';

// Geometry-related types
export type {
  AnalysisResult,
  GeoColumnInfo,
  GeometryInfo,
  ProcessedDatasetAnalysisResult
} from './types/geometry.types';

// Dataset-related types
export type {
  DatasetResult,
  ProcessedDataset,
  RawDataset,
  ZipDatasetResult
} from './types/dataset.types';

// Import/file-related types
export type {
  CsvImportOptions,
  DatasetMetadata,
  FileFormat,
  FileInfo,
  UploadedFilePayload,
  ValidationResult
} from './types/import.types';
