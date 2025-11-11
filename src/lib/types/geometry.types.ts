/**
 * Geometry Types - Centralized type definitions for geographic data
 *
 * These types provide proper typing for GeoJSON, coordinates, and geometry operations,
 * replacing 'any' types throughout the codebase.
 */

/**
 * Coordinate types
 */
export type Longitude = number; // -180 to 180
export type Latitude = number; // -90 to 90
export type Coordinate = [Longitude, Latitude];
export type Coordinate3D = [Longitude, Latitude, number]; // third value is altitude

/**
 * GeoJSON Position (can be 2D or 3D)
 */
export type Position = Coordinate | Coordinate3D;

/**
 * GeoJSON Geometry types
 */
export enum GeometryType {
  POINT = 'Point',
  MULTI_POINT = 'MultiPoint',
  LINE_STRING = 'LineString',
  MULTI_LINE_STRING = 'MultiLineString',
  POLYGON = 'Polygon',
  MULTI_POLYGON = 'MultiPolygon',
  GEOMETRY_COLLECTION = 'GeometryCollection'
}

/**
 * Base geometry interface
 */
export interface BaseGeometry {
  type: GeometryType;
}

/**
 * Point geometry
 */
export interface PointGeometry extends BaseGeometry {
  type: GeometryType.POINT;
  coordinates: Position;
}

/**
 * MultiPoint geometry
 */
export interface MultiPointGeometry extends BaseGeometry {
  type: GeometryType.MULTI_POINT;
  coordinates: Position[];
}

/**
 * LineString geometry
 */
export interface LineStringGeometry extends BaseGeometry {
  type: GeometryType.LINE_STRING;
  coordinates: Position[];
}

/**
 * MultiLineString geometry
 */
export interface MultiLineStringGeometry extends BaseGeometry {
  type: GeometryType.MULTI_LINE_STRING;
  coordinates: Position[][];
}

/**
 * Polygon geometry
 */
export interface PolygonGeometry extends BaseGeometry {
  type: GeometryType.POLYGON;
  coordinates: Position[][];
}

/**
 * MultiPolygon geometry
 */
export interface MultiPolygonGeometry extends BaseGeometry {
  type: GeometryType.MULTI_POLYGON;
  coordinates: Position[][][];
}

/**
 * GeometryCollection
 */
export interface GeometryCollection extends BaseGeometry {
  type: GeometryType.GEOMETRY_COLLECTION;
  geometries: Geometry[];
}

/**
 * Union type for all geometry types
 */
export type Geometry =
  | PointGeometry
  | MultiPointGeometry
  | LineStringGeometry
  | MultiLineStringGeometry
  | PolygonGeometry
  | MultiPolygonGeometry
  | GeometryCollection;

/**
 * GeoJSON Feature
 */
export interface GeoJsonFeature<G extends Geometry = Geometry> {
  type: 'Feature';
  geometry: G | null;
  properties: Record<string, unknown> | null;
  id?: string | number;
}

/**
 * GeoJSON FeatureCollection
 */
export interface GeoJsonFeatureCollection<G extends Geometry = Geometry> {
  type: 'FeatureCollection';
  features: GeoJsonFeature<G>[];
  bbox?: BBox;
}

/**
 * Bounding box [minX, minY, maxX, maxY] or [minX, minY, minZ, maxX, maxY, maxZ]
 */
export type BBox =
  | [number, number, number, number]
  | [number, number, number, number, number, number];

/**
 * Bounds interface (used in the application)
 */
export interface Bounds {
  minLon: Longitude;
  maxLon: Longitude;
  minLat: Latitude;
  maxLat: Latitude;
}

/**
 * Convert BBox to Bounds
 */
export function bboxToBounds(bbox: BBox): Bounds {
  return {
    minLon: bbox[0],
    minLat: bbox[1],
    maxLon: bbox[2],
    maxLat: bbox[3]
  };
}

/**
 * Convert Bounds to BBox
 */
export function boundsToBBox(bounds: Bounds): BBox {
  return [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat];
}

/**
 * Type guards for geometry types
 */
export function isPointGeometry(geometry: Geometry): geometry is PointGeometry {
  return geometry.type === GeometryType.POINT;
}

export function isPolygonGeometry(
  geometry: Geometry
): geometry is PolygonGeometry {
  return geometry.type === GeometryType.POLYGON;
}

export function isMultiPolygonGeometry(
  geometry: Geometry
): geometry is MultiPolygonGeometry {
  return geometry.type === GeometryType.MULTI_POLYGON;
}

export function isGeometryCollection(
  geometry: Geometry
): geometry is GeometryCollection {
  return geometry.type === GeometryType.GEOMETRY_COLLECTION;
}

/**
 * Style properties for geometry rendering
 */
export interface GeometryStyle {
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  radius?: number; // for points
}

/**
 * Coordinate Reference System (CRS)
 */
export interface CRS {
  type: 'name' | 'link';
  properties: {
    name?: string;
    href?: string;
    type?: string;
  };
}

/**
 * Common CRS definitions
 */
export const WGS84_CRS: CRS = {
  type: 'name',
  properties: {
    name: 'urn:ogc:def:crs:OGC:1.3:CRS84'
  }
};

export const EPSG_4326_CRS: CRS = {
  type: 'name',
  properties: {
    name: 'EPSG:4326'
  }
};
