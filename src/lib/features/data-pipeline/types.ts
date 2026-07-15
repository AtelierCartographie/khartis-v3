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
  isZipDatasetResult
} from './enums';

// Column-related types
export type {
  ColumnAnalysis,
  ColumnInfo,
  ColumnStats,
  EnrichedColumn
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
  ZipDatasetResult
} from './types/dataset.types';

// Import/file-related types
export type {
  CsvImportOptions,
  DatasetMetadata,
  FileFormat,
  FileInfo,
  UploadedFilePayload
} from './types/import.types';
