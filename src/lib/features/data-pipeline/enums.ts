import type { DatasetResult, ZipDatasetResult } from './types/dataset.types';

export enum ColumnType {
  BOOLEAN = 'boolean',
  DATE = 'date',
  NUMBER = 'number',
  GEOMETRY = 'geometry',
  TEXT = 'text'
}

export enum GeometryTypeEnum {
  POINT = 'Point',
  MULTIPOINT = 'MultiPoint',
  LINESTRING = 'LineString',
  MULTILINESTRING = 'MultiLineString',
  POLYGON = 'Polygon',
  MULTIPOLYGON = 'MultiPolygon'
}

export enum GeoLocationType {
  LATITUDE = 'latitude',
  LONGITUDE = 'longitude',
  COUNTRY_NAME = 'country_name',
  ISO2 = 'iso2',
  ISO3 = 'iso3',
  NUTS = 'nuts',
  REGION = 'region',
  CITY = 'city',
  COORDINATES = 'coordinates',
  LOCATION_NAME = 'location_name',
  UNKNOWN = 'unknown'
}

export enum FileFormatEnum {
  CSV = 'csv',
  GEOJSON = 'geojson',
  SHAPEFILE = 'shapefile',
  GEOPACKAGE = 'geopackage',
  GEOPARQUET = 'geoparquet',
  KML = 'kml',
  KMZ = 'kmz',
  GPX = 'gpx',
  UNKNOWN = 'unknown'
}

export function isNumericType(type: ColumnType): boolean {
  return type === ColumnType.NUMBER;
}

export function fromDuckDBType(duckType: string): ColumnType {
  const normalized = duckType.toLowerCase();

  if (normalized.includes('bool')) return ColumnType.BOOLEAN;
  if (normalized.includes('date') || normalized.includes('time'))
    return ColumnType.DATE;
  if (
    normalized === 'string' ||
    normalized === 'varchar' ||
    normalized === 'text'
  )
    return ColumnType.TEXT;
  if (
    normalized.includes('int') ||
    normalized.includes('double') ||
    normalized.includes('float') ||
    normalized.includes('decimal') ||
    normalized.includes('numeric')
  ) {
    return ColumnType.NUMBER;
  }
  if (normalized.includes('geometry') || normalized.includes('geom'))
    return ColumnType.GEOMETRY;

  return ColumnType.TEXT;
}

export function computeCentroid(
  bounds: [number, number, number, number]
): [number, number] {
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

export function isZipDatasetResult(
  result: DatasetResult | ZipDatasetResult
): result is ZipDatasetResult {
  return 'datasets' in result && Array.isArray(result.datasets);
}
