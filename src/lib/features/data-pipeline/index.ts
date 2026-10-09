export { createFileFromUpload, dataPipeline } from './pipeline';

export { ColumnType, isZipDatasetResult } from './types';

export type {
  ColumnAnalysis,
  CsvImportOptions,
  DatasetResult,
  EnrichedColumn,
  GeoColumnInfo,
  GeometryInfo,
  ProcessedDataset,
  ZipDatasetResult
} from './types';

export { PIPELINE_CONST } from './constants';

export { extractGeoArrowMetadata } from './io/geoarrow-metadata';

export {
  buildStatisticsFromColumns,
  buildStatisticsSnapshot,
  readDatasetTableSnapshot
} from './operations/analysis';
export type { DatasetTableSnapshot } from './operations/analysis';

export {
  extractGeometryColumnCrs,
  normalizeCrsName
} from './operations/geometry';

export { normalizeFormattedNumericColumns } from './operations/tabular-numeric-normalization';

export {
  normalizeDatasets,
  normalizeToProcessedDataset
} from './utils/processed-dataset.utils';

export {
  createFileFromExtracted,
  extractZip,
  getShapefileFilesFromArchive
} from './utils/zip-handler';
export { readFileIntoTable } from './processors';
export type { FileTableRead } from './processors';
