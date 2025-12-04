// Pipeline facade
export { createFileFromUpload, dataPipeline, Pipeline } from './pipeline';
export type { DataPipeline } from './pipeline';

// Types (consolidated)
export {
  ColumnType,
  computeBoundsArea,
  computeCentroid,
  extractBBox,
  extractGeometryTypes,
  extractPrimaryGeometryType,
  fromDuckDBType,
  getNullPercentage,
  getUniquePercentage,
  hasNumericStats,
  isGeoArrowMetadata,
  isNumericType,
  isSpatialType,
  isTemporalType,
  isValidBounds,
  mergeValidationResults,
  validationFailure,
  validationSuccess
} from './types';

export type {
  AnalysisResult,
  ColumnAnalysis,
  ColumnInfo,
  ColumnStats,
  DatasetMetadata,
  DatasetResult,
  DuckAnalyticsColumn,
  EnrichedColumn,
  FileFormat,
  FileInfo,
  GeoArrowColumnMetadata,
  GeoArrowCRS,
  GeoArrowMetadata,
  GeoColumnInfo,
  GeometryInfo,
  InferredColumn,
  PipelineContext,
  ProcessedDataset,
  RawColumn,
  RawDataset,
  UploadedFilePayload,
  ValidationResult
} from './types';

// Constants
export {
  getSupportedExtensions,
  getSupportedMimeTypes,
  isGeospatialFile,
  isTabularFile,
  PIPELINE_CONST
} from './constants';

// Parsers
export {
  canParseFile,
  parseFile,
  parseGeoFile,
  ParserError,
  parseTabular
} from './core/parsers';

// Validators
export {
  validateFile,
  validateFileExtension,
  validateMimeType
} from './core/validators';

// GeoParquet reader
export {
  extractGeoArrowMetadata,
  geoParquetReader,
  initializeGeoParquetWasm,
  readGeoParquet,
  tableHasGeoArrowMetadata
} from './io/geoparquet-reader';

// GeoJSON utilities
export { convertGeoJSONToRawDataset } from './utils/geojson-converter';
export type {
  GeoJSONFeature,
  GeoJSONFeatureCollection
} from './utils/geojson-converter';

// GeoJSON guards
export {
  describeGeojsonStructure,
  isFeature,
  isFeatureArray,
  isFeatureCollection,
  isGeometry,
  isGeometryCollection,
  isRecord,
  normalizeGeojsonInput
} from './utils/geojson-guards';
export type { GeoJSONLike } from './utils/geojson-guards';
