/**
 * Data Feature - Public API
 *
 * This is the ONLY file external code should import from.
 * It provides a clean facade over the data processing pipeline.
 *
 * @example
 * ```typescript
 * import { dataPipeline, ColumnType } from '$lib/features/data';
 *
 * // Initialize once
 * await dataPipeline.initialize();
 *
 * // Process file
 * const result = await dataPipeline.processFile(file);
 * console.log(result.tableName); // DuckDB table name
 * console.log(result.columns);   // Enriched columns with stats
 * ```
 *
 * ARCHITECTURE:
 *
 * ```
 * Domain Layer (Core Business Logic)
 *   ↓
 * Application Layer (Use Cases + Services)
 *   ↓
 * Infrastructure Layer (Implementations)
 * ```
 *
 * Follow SOLID principles:
 * - Single Responsibility: Each class has ONE job
 * - Open/Closed: Extend via interfaces, don't modify core
 * - Liskov Substitution: Implementations are interchangeable
 * - Interface Segregation: Small, focused contracts
 * - Dependency Inversion: Depend on abstractions
 */

// ============================================================================
// DOMAIN EXPORTS (Types & Interfaces)
// ============================================================================

export * from './domain';

// ============================================================================
// BACKWARDS COMPATIBILITY EXPORTS
// ============================================================================

// Export old types for components not yet migrated
export type { ProcessedDataset } from './types/ProcessedDataset';
export type { ColumnInfo } from './types/AnalysisResult';

// ============================================================================
// APPLICATION EXPORTS (Public API)
// ============================================================================

export {
  dataPipeline,
  DataPipelineService
} from './application/services/data-pipeline.service';

// ============================================================================
// INFRASTRUCTURE EXPORTS (For Extension)
// ============================================================================

// Parsers - export for custom parser registration
export { CSVParser } from './infrastructure/parsers/csv.parser';
export { GeoJSONParser } from './infrastructure/parsers/geojson.parser';
export { ShapefileParser } from './infrastructure/parsers/shapefile.parser';
export { GeoPackageParser } from './infrastructure/parsers/geopackage.parser';
export { KMLParser } from './infrastructure/parsers/kml.parser';
export { GeoParquetParser } from './infrastructure/parsers/geoparquet.parser';
export { ParserRegistry } from './infrastructure/parsers/parser.registry';

// Validators - export for custom validator registration
export { SizeValidator } from './infrastructure/validators/size.validator';
export { SchemaValidator } from './infrastructure/validators/schema.validator';
export { QualityValidator } from './infrastructure/validators/quality.validator';
export { ValidationChain } from './infrastructure/validators/validation.chain';

// Type Inference - export for custom type inferrers
export { HeuristicTypeInferrer } from './infrastructure/type-inference/heuristic-inferrer';

// Analytics - export for testing/mocking
// TODO Phase 4: Export analytics when implemented
// export { DuckDBAnalyticsEngine } from './infrastructure/analytics/duckdb/duckdb.engine';
// export { DuckDBClient } from './infrastructure/analytics/duckdb/duckdb.client';
