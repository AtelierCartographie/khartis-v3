import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection, Geometry } from 'geojson';
import type { LngLatBoundsLike } from 'maplibre-gl';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

export function calculateBoundsFromGeoArrow(
  jsTable: ArrowTable
): LngLatBoundsLike | null {
  try {
    const geoMetadata = jsTable.schema.metadata.get('geo');
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

    if (
      typeof minLng !== 'number' ||
      typeof minLat !== 'number' ||
      typeof maxLng !== 'number' ||
      typeof maxLat !== 'number'
    ) {
      return null;
    }

    if (
      minLat < -90 ||
      minLat > 90 ||
      maxLat < -90 ||
      maxLat > 90 ||
      minLng < -180 ||
      minLng > 180 ||
      maxLng < -180 ||
      maxLng > 180
    ) {
      return null;
    }

    if (minLat >= maxLat || minLng >= maxLng) {
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

function extractCoordsFromGeometry(geometry: Geometry | null): number[][] {
  if (!geometry) return [];

  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];

    case 'MultiPoint':

    // fallthrough
    case 'LineString':
      return geometry.coordinates;

    case 'MultiLineString':

    // fallthrough
    case 'Polygon':
      return geometry.coordinates.flat();

    case 'MultiPolygon':
      return geometry.coordinates.flat(2);

    case 'GeometryCollection':
      return geometry.geometries.flatMap(extractCoordsFromGeometry);

    default:
      return [];
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

    if (
      minLat < -90 ||
      minLat > 90 ||
      maxLat < -90 ||
      maxLat > 90 ||
      minLng < -180 ||
      minLng > 180 ||
      maxLng < -180 ||
      maxLng > 180
    ) {
      return null;
    }

    if (minLat >= maxLat || minLng >= maxLng) {
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
