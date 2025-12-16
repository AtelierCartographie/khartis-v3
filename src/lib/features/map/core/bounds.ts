import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection, Geometry } from 'geojson';
import type { LngLatBoundsLike } from 'maplibre-gl';
import { GeoArrowMetadataKey, GeoJsonGeometryType } from '../constants';

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;

function isValidBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
): boolean {
  if (
    typeof minLng !== 'number' ||
    typeof minLat !== 'number' ||
    typeof maxLng !== 'number' ||
    typeof maxLat !== 'number'
  ) {
    return false;
  }

  if (
    minLat < MIN_LAT ||
    minLat > MAX_LAT ||
    maxLat < MIN_LAT ||
    maxLat > MAX_LAT ||
    minLng < MIN_LNG ||
    minLng > MAX_LNG ||
    maxLng < MIN_LNG ||
    maxLng > MAX_LNG
  ) {
    return false;
  }

  if (minLat >= maxLat || minLng >= maxLng) {
    return false;
  }

  return true;
}

function extractCoordsFromGeometry(geometry: Geometry | null): number[][] {
  if (!geometry) return [];

  if (geometry.type === GeoJsonGeometryType.Point) {
    return [geometry.coordinates];
  }

  if (
    geometry.type === GeoJsonGeometryType.MultiPoint ||
    geometry.type === GeoJsonGeometryType.LineString
  ) {
    return geometry.coordinates;
  }

  if (
    geometry.type === GeoJsonGeometryType.MultiLineString ||
    geometry.type === GeoJsonGeometryType.Polygon
  ) {
    return geometry.coordinates.flat();
  }

  if (geometry.type === GeoJsonGeometryType.MultiPolygon) {
    return geometry.coordinates.flat(2);
  }

  if (geometry.type === GeoJsonGeometryType.GeometryCollection) {
    return geometry.geometries.flatMap(extractCoordsFromGeometry);
  }

  return [];
}

export function calculateBoundsFromGeoArrow(
  jsTable: ArrowTable
): LngLatBoundsLike | null {
  try {
    const geoMetadata = jsTable.schema.metadata.get(GeoArrowMetadataKey.GEO);
    if (!geoMetadata) {
      return null;
    }

    const jsonMeta = JSON.parse(geoMetadata);
    const primaryColumn = jsonMeta.primary_column;
    const columnMeta = jsonMeta.columns?.[primaryColumn];

    if (!columnMeta?.bbox || !Array.isArray(columnMeta.bbox)) {
      return null;
    }

    const bbox = columnMeta.bbox;

    if (bbox.length !== 4) {
      return null;
    }

    const [minLng, minLat, maxLng, maxLat] = bbox;

    if (!isValidBbox(minLng, minLat, maxLng, maxLat)) {
      return null;
    }

    return [
      [minLng, minLat],
      [maxLng, maxLat]
    ];
  } catch (error) {
    logger.error(
      'Failed to calculate bounds from GeoArrow',
      LogCategory.MAP,
      error
    );
    return null;
  }
}

export function calculateBoundsFromGeoJSON(
  geojson: FeatureCollection
): LngLatBoundsLike | null {
  try {
    if (!geojson || !geojson.features || geojson.features.length === 0) {
      return null;
    }

    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    for (const feature of geojson.features) {
      const coords = extractCoordsFromGeometry(feature.geometry);

      for (const [lng, lat] of coords) {
        if (typeof lng === 'number' && typeof lat === 'number') {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }

    if (
      !isFinite(minLng) ||
      !isFinite(minLat) ||
      !isFinite(maxLng) ||
      !isFinite(maxLat)
    ) {
      return null;
    }

    if (!isValidBbox(minLng, minLat, maxLng, maxLat)) {
      return null;
    }

    return [
      [minLng, minLat],
      [maxLng, maxLat]
    ];
  } catch (error) {
    logger.error(
      'Failed to calculate bounds from GeoJSON',
      LogCategory.MAP,
      error
    );
    return null;
  }
}

