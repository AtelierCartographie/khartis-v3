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
  id?: { authority: string; code: number };
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
