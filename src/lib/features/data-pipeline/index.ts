export { createFileFromUpload, dataPipeline } from './pipeline';

export {
  ColumnType,
  computeCentroid,
  fromDuckDBType,
  isGeoArrowMetadata,
  isNumericType,
  isZipDatasetResult
} from './types';

export type {
  AnalysisResult,
  ColumnAnalysis,
  ColumnInfo,
  ColumnStats,
  CsvImportOptions,
  DatasetMetadata,
  DatasetResult,
  EnrichedColumn,
  FileFormat,
  FileInfo,
  GeoArrowCRS,
  GeoArrowColumnMetadata,
  GeoArrowMetadata,
  GeoColumnInfo,
  GeometryInfo,
  ProcessedDataset,
  UploadedFilePayload,
  ZipDatasetResult
} from './types';

export { PIPELINE_CONST, isGeospatialFile } from './constants';

export { detectFileFormat, generateTableName } from './core/format-detector';

export { validateFile } from './core/validators';

export {
  extractGeoArrowMetadata,
  tableHasGeoArrowMetadata
} from './io/geoarrow-metadata';

export {
  buildStatisticsSnapshot,
  extractCategories,
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
  getShapefileBundlesFromArchive,
  getShapefileFilesFromArchive
} from './utils/zip-handler';
export type {
  ExtractedFile,
  ShapefileBundle,
  ZipExtractionResult
} from './utils/zip-handler';

export { getProcessor, registerAllProcessors } from './processors';
export type {
  FileProcessor,
  ProcessContext,
  ProcessorDataset
} from './processors';
