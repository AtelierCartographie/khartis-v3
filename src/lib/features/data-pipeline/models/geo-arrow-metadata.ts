/**
 * GeoArrow metadata stored in Arrow schema metadata under the "geo" key.
 * Based on https://geoarrow.org/geoparquet/metadata and required for Deck.gl rendering.
 */
export interface GeoArrowMetadata {
  version: string;
  primary_column: string;
  columns: Record<string, GeoArrowColumnMetadata>;
}

export interface GeoArrowColumnMetadata {
  encoding: string;
  geometry_types: string[];
  bbox: [number, number, number, number];
  crs?: GeoArrowCRS;
  edges?: 'planar' | 'spherical';
}

export interface GeoArrowCRS {
  name?: string;
  id?: {
    authority: string;
    code: number;
  };
  wkt?: string;
}

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

export function extractBBox(
  metadata: GeoArrowMetadata
): [number, number, number, number] | undefined {
  const primaryColumn = metadata.primary_column;
  const columnMetadata = metadata.columns[primaryColumn];
  return columnMetadata?.bbox;
}

export function extractGeometryTypes(metadata: GeoArrowMetadata): string[] {
  const primaryColumn = metadata.primary_column;
  const columnMetadata = metadata.columns[primaryColumn];
  return columnMetadata?.geometry_types || [];
}

export function extractPrimaryGeometryType(
  metadata: GeoArrowMetadata
): string | undefined {
  const types = extractGeometryTypes(metadata);
  return types.length > 0 ? types[0] : undefined;
}
