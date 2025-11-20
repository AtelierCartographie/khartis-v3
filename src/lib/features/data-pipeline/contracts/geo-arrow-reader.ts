import type { Table as ArrowTable } from 'apache-arrow';
import type { GeoArrowMetadata } from '../models/geo-arrow-metadata';

/**
 * Reads GeoParquet while keeping GeoArrow metadata intact.
 */
export interface IGeoArrowReader {
  readGeoParquet(buffer: ArrayBuffer | Uint8Array): Promise<ArrowTable>;
  extractMetadata(table: ArrowTable): GeoArrowMetadata | null;
  hasMetadata(table: ArrowTable): boolean;
}

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
