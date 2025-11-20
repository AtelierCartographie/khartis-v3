/**
 * Public API for the data ingestion pipeline plus extension contracts.
 */

export {
  createDataPipeline,
  createFileFromUpload,
  dataPipeline
} from './pipeline/create-data-pipeline';
export type { DataPipeline } from './pipeline/create-data-pipeline';

export * from './contracts';
export * from './models';

export type { ColumnInfo } from './types/AnalysisResult';
export type { ProcessedDataset } from './types/ProcessedDataset';

export {
  createParserList,
  findParser,
  getSupportedExtensions,
  getSupportedMimeTypes
} from './adapters/parsers';
export type { ParserList } from './adapters/parsers';
export { CSVParser } from './adapters/parsers/csv.parser';
export { GeoJSONParser } from './adapters/parsers/geojson.parser';
export { GeoPackageParser } from './adapters/parsers/geopackage.parser';
export { GeoParquetParser } from './adapters/parsers/geoparquet.parser';
export { KMLParser } from './adapters/parsers/kml.parser';
export { ShapefileParser } from './adapters/parsers/shapefile.parser';

export { createValidatorList, runValidators } from './adapters/validators';
export type { ValidatorList } from './adapters/validators';
export { QualityValidator } from './adapters/validators/quality.validator';
export { SchemaValidator } from './adapters/validators/schema.validator';
export { SizeValidator } from './adapters/validators/size.validator';

export { HeuristicTypeInferrer } from './adapters/type-inference/heuristic-inferrer';
