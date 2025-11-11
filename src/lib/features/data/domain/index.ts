/**
 * Domain Layer - Public Exports
 *
 * This module exports all domain concepts (interfaces, entities, value objects).
 * These are the core business abstractions used throughout the application.
 *
 * Import from here, not from individual files:
 * ```typescript
 * import { IParser, RawDataset, ColumnType } from '$lib/features/data/domain';
 * ```
 */

// ============================================================================
// INTERFACES
// ============================================================================

export type { IParser } from './interfaces/parser.interface';
export { ParserError } from './interfaces/parser.interface';

export type { IValidator } from './interfaces/validator.interface';

export type { ITypeInferrer } from './interfaces/type-inferrer.interface';

export type { IAnalyticsEngine } from './interfaces/analytics-engine.interface';
export { AnalyticsEngineError } from './interfaces/analytics-engine.interface';

export type { IColumnAnalyzer } from './interfaces/column-analyzer.interface';

// ============================================================================
// ENTITIES
// ============================================================================

export type { RawColumn } from './entities/raw-column.entity';
export type { InferredColumn } from './entities/inferred-column.entity';
export type { RawDataset } from './entities/raw-dataset.entity';
export type {
  DatasetResult,
  EnrichedColumn
} from './entities/dataset-result.entity';

// ============================================================================
// VALUE OBJECTS
// ============================================================================

export {
  ColumnType,
  isNumericType,
  isTemporalType,
  isSpatialType,
  fromDuckDBType
} from './value-objects/column-type.vo';

export type { ValidationResult } from './value-objects/validation-result.vo';
export {
  validationSuccess,
  validationFailure,
  mergeValidationResults
} from './value-objects/validation-result.vo';

export type { ColumnStats } from './value-objects/column-stats.vo';
export {
  hasNumericStats,
  getNullPercentage,
  getUniquePercentage
} from './value-objects/column-stats.vo';

export type { ColumnAnalysis } from './value-objects/column-analysis.vo';

export type { GeometryInfo } from './value-objects/geometry-info.vo';
export {
  computeCentroid,
  isValidBounds,
  computeBoundsArea
} from './value-objects/geometry-info.vo';
