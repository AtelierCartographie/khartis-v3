/**
 * Centralized Type Definitions
 *
 * This file exports all type definitions for the application,
 * providing a single source of truth for TypeScript types.
 */

// Core data types
export * from './data';
export * from './utility';

// Domain types
export * from './geometry.types';
export * from './validation.types';
export * from './serialization.types';
export * from './export.types';

// Re-export commonly used types for convenience
export type { JsonValue } from './utility';
export type { TabularData, GeoJSONData, ParsedData } from './data';
export type {
  Geometry,
  Position,
  Coordinate,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  Bounds
} from './geometry.types';
export type {
  ValidationResult,
  DatasetValidationResult,
  FileValidationResult
} from './validation.types';
export type {
  SerializedProject,
  SerializedProjectData,
  SerializedUploadedFile
} from './serialization.types';
export type {
  ExportFormat,
  ExportOptions,
  ExportableData,
  CsvData
} from './export.types';
