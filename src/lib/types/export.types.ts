/**
 * Export Types - Centralized type definitions for data export operations
 *
 * These types provide proper typing for file export operations,
 * replacing 'any' types throughout the codebase.
 */

import type { TabularData, GeoJSONData } from './data';

/**
 * Supported export formats
 */
export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
  GEOJSON = 'geojson',
  TOPOJSON = 'topojson',
  SHAPEFILE = 'shapefile',
  PNG = 'png',
  SVG = 'svg',
  PDF = 'pdf'
}

/**
 * Export options for different formats
 */
export interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  encoding?: 'utf-8' | 'iso-8859-1';
  compression?: boolean;
}

/**
 * CSV export options
 */
export interface CsvExportOptions extends ExportOptions {
  format: ExportFormat.CSV;
  delimiter?: ',' | ';' | '\t' | '|';
  includeHeaders?: boolean;
  quoteAll?: boolean;
}

/**
 * JSON export options
 */
export interface JsonExportOptions extends ExportOptions {
  format: ExportFormat.JSON;
  prettify?: boolean;
  indent?: number;
}

/**
 * GeoJSON export options
 */
export interface GeoJsonExportOptions extends ExportOptions {
  format: ExportFormat.GEOJSON;
  prettify?: boolean;
  includeProperties?: boolean;
  crs?: string; // Coordinate Reference System
}

/**
 * Image export options
 */
export interface ImageExportOptions extends ExportOptions {
  format: ExportFormat.PNG | ExportFormat.SVG | ExportFormat.PDF;
  width?: number;
  height?: number;
  dpi?: number;
  quality?: number; // 0-100 for PNG/JPEG
  backgroundColor?: string;
}

/**
 * Union type for all export options
 */
export type AnyExportOptions =
  | CsvExportOptions
  | JsonExportOptions
  | GeoJsonExportOptions
  | ImageExportOptions;

/**
 * Exportable data types
 */
export type ExportableData =
  | TabularData
  | GeoJSONData
  | Record<string, unknown>;

/**
 * Export result
 */
export interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * CSV row type (for export operations)
 */
export type CsvRow = Record<string, string | number | boolean | null | Date>;

/**
 * CSV data type
 */
export type CsvData = CsvRow[];

/**
 * Type guard for CSV data
 */
export function isCsvData(data: unknown): data is CsvData {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return true;
  return (
    typeof data[0] === 'object' && data[0] !== null && !('type' in data[0])
  );
}

/**
 * Helper type for CSV value serialization
 */
export type CsvValue = string | number | boolean | null | Date;

/**
 * CSV serializer function type
 */
export type CsvSerializer = (value: CsvValue) => string;

/**
 * GeoJSON export data structure
 */
export interface GeoJsonExportData {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: string;
      coordinates: number[] | number[][] | number[][][];
    };
    properties: Record<string, unknown>;
  }>;
  crs?: {
    type: string;
    properties: Record<string, unknown>;
  };
}
