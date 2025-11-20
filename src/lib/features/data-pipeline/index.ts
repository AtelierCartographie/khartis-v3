/**
 * Public API for the data ingestion pipeline plus extension contracts.
 */

export {
  dataPipeline,
  createDataPipeline
} from './pipeline/create-data-pipeline';
export type { DataPipeline } from './pipeline/create-data-pipeline';

export * from './models';
export * from './contracts';

export type { ProcessedDataset } from './types/ProcessedDataset';
export type { ColumnInfo } from './types/AnalysisResult';

export { CSVParser } from './adapters/parsers/csv.parser';
export { GeoJSONParser } from './adapters/parsers/geojson.parser';
export { ShapefileParser } from './adapters/parsers/shapefile.parser';
export { GeoPackageParser } from './adapters/parsers/geopackage.parser';
export { KMLParser } from './adapters/parsers/kml.parser';
export { GeoParquetParser } from './adapters/parsers/geoparquet.parser';
export {
  createParserList,
  findParser,
  getSupportedExtensions,
  getSupportedMimeTypes
} from './adapters/parsers';
export type { ParserList } from './adapters/parsers';

export { SizeValidator } from './adapters/validators/size.validator';
export { SchemaValidator } from './adapters/validators/schema.validator';
export { QualityValidator } from './adapters/validators/quality.validator';
export { createValidatorList, runValidators } from './adapters/validators';
export type { ValidatorList } from './adapters/validators';

export { HeuristicTypeInferrer } from './adapters/type-inference/heuristic-inferrer';
