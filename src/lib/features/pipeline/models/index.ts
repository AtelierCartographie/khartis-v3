export type { DatasetResult, EnrichedColumn } from './dataset-result';
export type { RawDataset } from './raw-dataset';
export type { RawColumn } from './raw-column';
export type { InferredColumn } from './inferred-column';

export {
  ColumnType,
  isNumericType,
  isTemporalType,
  isSpatialType,
  fromDuckDBType
} from './column-type';

export type { ColumnStats } from './column-stats';
export {
  hasNumericStats,
  getNullPercentage,
  getUniquePercentage
} from './column-stats';

export type { ColumnAnalysis } from './column-analysis';
export type { GeometryInfo } from './geometry-info';
export {
  computeCentroid,
  isValidBounds,
  computeBoundsArea
} from './geometry-info';

export type { ValidationResult } from './validation-result';
export {
  validationSuccess,
  validationFailure,
  mergeValidationResults
} from './validation-result';

export type { GeoArrowMetadata } from './geo-arrow-metadata';
export {
  isGeoArrowMetadata,
  extractBBox,
  extractGeometryTypes,
  extractPrimaryGeometryType
} from './geo-arrow-metadata';
