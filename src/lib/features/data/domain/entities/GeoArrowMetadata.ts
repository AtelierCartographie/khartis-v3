/**
 * GeoArrow Metadata Entity
 * Represents the standard GeoArrow metadata format
 * Based on https://geoarrow.org/geoparquet/metadata
 *
 * This structure is stored in Arrow table schema.metadata under key 'geo'
 * and is CRITICAL for Deck.gl rendering
 */
export interface GeoArrowMetadata {
  version: string; // "1.0.0" or "1.1.0"
  primary_column: string; // Name of the geometry column (usually 'geom' or 'geometry')
  columns: Record<string, GeoArrowColumnMetadata>;
}

/**
 * Metadata for a single geometry column
 */
export interface GeoArrowColumnMetadata {
  encoding: string; // "WKB" | "geoarrow.point" | "geoarrow.linestring" | "geoarrow.polygon"
  geometry_types: string[]; // ["Polygon", "MultiPolygon", "Point", etc.]
  bbox: [number, number, number, number]; // [xmin, ymin, xmax, ymax] - CRITICAL for rendering
  crs?: GeoArrowCRS;
  edges?: 'planar' | 'spherical'; // Optional edge interpretation
}

/**
 * Coordinate Reference System metadata
 */
export interface GeoArrowCRS {
  name?: string; // "EPSG:4326"
  id?: {
    authority: string; // "EPSG"
    code: number; // 4326
  };
  wkt?: string; // Full WKT CRS definition
}

/**
 * Type guard to check if object is valid GeoArrowMetadata
 */
export function isGeoArrowMetadata(obj: unknown): obj is GeoArrowMetadata {
  if (
    typeof obj !== 'object' ||
    obj === null ||
    typeof (obj as Record<string, unknown>).version !== 'string' ||
    typeof (obj as Record<string, unknown>).primary_column !== 'string'
  ) {
    return false;
  }

  const columns = (obj as Record<string, unknown>).columns;
  return typeof columns === 'object' && columns !== null;
}

/**
 * Extract bbox from GeoArrow metadata
 * Returns undefined if metadata or bbox is missing
 */
export function extractBBox(
  metadata: GeoArrowMetadata
): [number, number, number, number] | undefined {
  const primaryColumn = metadata.primary_column;
  const columnMetadata = metadata.columns[primaryColumn];
  return columnMetadata?.bbox;
}

/**
 * Extract geometry types from GeoArrow metadata
 * Returns empty array if metadata is missing
 */
export function extractGeometryTypes(metadata: GeoArrowMetadata): string[] {
  const primaryColumn = metadata.primary_column;
  const columnMetadata = metadata.columns[primaryColumn];
  return columnMetadata?.geometry_types || [];
}

/**
 * Extract primary geometry type from GeoArrow metadata
 * Returns undefined if metadata is missing
 */
export function extractPrimaryGeometryType(
  metadata: GeoArrowMetadata
): string | undefined {
  const types = extractGeometryTypes(metadata);
  return types.length > 0 ? types[0] : undefined;
}
