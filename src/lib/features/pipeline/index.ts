/**
 * Data Feature - Public API
 *
 * Provides a simple facade over the data ingestion pipeline plus
 * the core models/contracts needed to extend it.
 *
 * @example
 * ```typescript
 * import { dataPipeline, ColumnType } from '$lib/features/data';
 *
 * await dataPipeline.initialize();
 * const dataset = await dataPipeline.processFile(file);
 * ```
 */

export {
  dataPipeline,
  createDataPipeline
} from './pipeline/create-data-pipeline';
export type {
  DataPipeline,
  DataPipelineOptions
} from './pipeline/create-data-pipeline';

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
