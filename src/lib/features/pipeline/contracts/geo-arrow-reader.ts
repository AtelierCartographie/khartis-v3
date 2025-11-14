import type { Table as ArrowTable } from 'apache-arrow';
import type { GeoArrowMetadata } from '../models/geo-arrow-metadata';

/**
 * Interface for readers that preserve GeoArrow metadata
 *
 * SOLID Principle: Interface Segregation Principle
 * This interface defines the contract for reading GeoParquet files
 * with proper metadata preservation
 *
 * Based on khartis-pipeline-old implementation that successfully
 * preserves GeoArrow metadata during file reading
 */
export interface IGeoArrowReader {
  /**
   * Read GeoParquet file and preserve GeoArrow metadata
   *
   * CRITICAL: This method MUST preserve the 'geo' key in schema.metadata
   * The metadata contains bbox, geometry types, and CRS information
   * required for proper Deck.gl rendering
   *
   * @param buffer - GeoParquet file buffer (ArrayBuffer or Uint8Array)
   * @returns Arrow table with metadata in schema.metadata.get('geo')
   * @throws Error if file cannot be parsed or WASM not initialized
   */
  readGeoParquet(buffer: ArrayBuffer | Uint8Array): Promise<ArrowTable>;

  /**
   * Extract and parse GeoArrow metadata from Arrow table
   *
   * This method reads the 'geo' key from schema.metadata,
   * parses the JSON string, and returns typed metadata object
   *
   * @param table - Arrow table with potential metadata
   * @returns Parsed GeoArrow metadata or null if not present
   */
  extractMetadata(table: ArrowTable): GeoArrowMetadata | null;

  /**
   * Check if Arrow table has valid GeoArrow metadata
   *
   * @param table - Arrow table to check
   * @returns true if table.schema.metadata has 'geo' key
   */
  hasMetadata(table: ArrowTable): boolean;
}

/**
 * Type guard to check if a class implements IGeoArrowReader
 */
export function isGeoArrowReader(obj: unknown): obj is IGeoArrowReader {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const candidate = obj as {
    readGeoParquet?: unknown;
    extractMetadata?: unknown;
    hasMetadata?: unknown;
  };

  return (
    typeof candidate.readGeoParquet === 'function' &&
    typeof candidate.extractMetadata === 'function' &&
    typeof candidate.hasMetadata === 'function'
  );
}
