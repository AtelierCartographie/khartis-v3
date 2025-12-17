export { Pipeline, createFileFromUpload, dataPipeline } from './pipeline';
export type { DataPipeline } from './pipeline';

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
  GeoArrowCRS,
  GeoArrowColumnMetadata,
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

export { PIPELINE_CONST, isGeospatialFile, isTabularFile } from './constants';

export {
  ParserError,
  canParseFile,
  parseFile,
  parseGeoFile,
  parseTabular
} from './core/parsers';

export {
  validateFile,
  validateFileExtension,
  validateMimeType
} from './core/validators';

export {
  extractGeoArrowMetadata,
  geoParquetReader,
  initializeGeoParquetWasm,
  readGeoParquet,
  tableHasGeoArrowMetadata
} from './io/geoparquet-reader';

export { convertGeoJSONToRawDataset } from './utils/geojson-converter';
export type {
  GeoJSONFeature,
  GeoJSONFeatureCollection
} from './utils/geojson-converter';

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
