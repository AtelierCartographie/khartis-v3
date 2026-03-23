import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { GEO_COLUMN_NAMES } from '$lib/features/commons/constants/data.constants';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection, Geometry } from 'geojson';
import type { LngLatBoundsLike } from 'maplibre-gl';
import { GeoArrowMetadataKey } from '../constants';
import { parseGeoJsonGeometry } from '../io/geometry-parser';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';

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

  if (geometry.type === GEOJSON_TYPE.POINT) {
    return [geometry.coordinates];
  }

  if (
    geometry.type === GEOJSON_TYPE.MULTI_POINT ||
    geometry.type === GEOJSON_TYPE.LINE_STRING
  ) {
    return geometry.coordinates;
  }

  if (
    geometry.type === GEOJSON_TYPE.MULTI_LINE_STRING ||
    geometry.type === GEOJSON_TYPE.POLYGON
  ) {
    return geometry.coordinates.flat();
  }

  if (geometry.type === GEOJSON_TYPE.MULTI_POLYGON) {
    return geometry.coordinates.flat(2);
  }

  if (geometry.type === GEOJSON_TYPE.GEOMETRY_COLLECTION) {
    return geometry.geometries.flatMap(extractCoordsFromGeometry);
  }

  return [];
}

function findGeoColumn(jsTable: ArrowTable): string | null {
  for (const field of jsTable.schema.fields) {
    const name = field.name.toLowerCase();
    if ((GEO_COLUMN_NAMES as readonly string[]).includes(name)) {
      return field.name;
    }
  }
  return null;
}

function extractCoordFromValue(value: unknown): [number, number] | null {
  if (!value) return null;

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const lon = obj.lon ?? obj.lng ?? obj.longitude ?? obj.x;
    const lat = obj.lat ?? obj.latitude ?? obj.y;
    if (typeof lon === 'number' && typeof lat === 'number') {
      return [lon, lat];
    }
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return extractCoordFromValue(parsed);
    } catch {
      return null;
    }
  }

  if (Array.isArray(value) && value.length >= 2) {
    const [lng, lat] = value;
    if (typeof lng === 'number' && typeof lat === 'number') {
      return [lng, lat];
    }
  }

  return null;
}

function calculateBoundsFromGeometryData(
  jsTable: ArrowTable,
  geoColumn: string
): LngLatBoundsLike | null {
  const geomVector = jsTable.getChild(geoColumn);
  if (!geomVector) {
    logger.debug('Column not found in table', LogCategory.MAP, {
      geoColumn,
      availableColumns: jsTable.schema.fields.map((f) => f.name)
    });
    return null;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let parsedCount = 0;
  let coordCount = 0;

  const maxSamples = Math.min(jsTable.numRows, 10000);
  const step = Math.max(1, Math.floor(jsTable.numRows / maxSamples));

  if (jsTable.numRows > 0) {
    const firstGeom = geomVector.get(0);
    logger.debug('First geometry value in column', LogCategory.MAP, {
      geoColumn,
      valueType: typeof firstGeom,
      isNull: firstGeom === null,
      isUndefined: firstGeom === undefined,
      isArray: Array.isArray(firstGeom),
      sample:
        typeof firstGeom === 'string'
          ? firstGeom.substring(0, 100)
          : JSON.stringify(firstGeom)?.substring(0, 100)
    });
  }

  for (let i = 0; i < jsTable.numRows; i += step) {
    const geom = geomVector.get(i);

    const parsed = parseGeoJsonGeometry(geom);
    if (parsed) {
      parsedCount++;
      const coords = extractCoordsFromGeometry(parsed);
      for (const coord of coords) {
        if (!Array.isArray(coord) || coord.length < 2) continue;
        const [lng, lat] = coord;
        if (typeof lng === 'number' && typeof lat === 'number') {
          coordCount++;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
      continue;
    }

    const coord = extractCoordFromValue(geom);
    if (coord) {
      coordCount++;
      const [lng, lat] = coord;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  logger.debug('Bounds calculation stats', LogCategory.MAP, {
    geoColumn,
    totalRows: jsTable.numRows,
    sampledRows: Math.ceil(jsTable.numRows / step),
    parsedGeometries: parsedCount,
    extractedCoords: coordCount
  });

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
}

export function calculateBoundsFromGeoArrow(
  jsTable: ArrowTable
): LngLatBoundsLike | null {
  try {
    logger.debug('Starting bounds calculation', LogCategory.MAP, {
      numRows: jsTable.numRows,
      numCols: jsTable.schema.fields.length,
      columns: jsTable.schema.fields.map((f) => f.name),
      hasGeoMetadata: Boolean(
        jsTable.schema.metadata.get(GeoArrowMetadataKey.GEO)
      )
    });

    const geoMetadata = jsTable.schema.metadata.get(GeoArrowMetadataKey.GEO);
    let primaryColumn: string | null = null;

    if (geoMetadata) {
      const jsonMeta = JSON.parse(geoMetadata);
      primaryColumn = jsonMeta.primary_column ?? null;
      const columnMeta = primaryColumn
        ? jsonMeta.columns?.[primaryColumn]
        : null;

      if (columnMeta?.bbox && Array.isArray(columnMeta.bbox)) {
        const bbox = columnMeta.bbox;

        if (bbox.length === 4) {
          const [minLng, minLat, maxLng, maxLat] = bbox;

          // Check if bbox is world bounds (DuckDB default) - if so, skip and calculate from data
          const isWorldBounds =
            minLng === -180 &&
            minLat === -90 &&
            maxLng === 180 &&
            maxLat === 90;

          if (!isWorldBounds && isValidBbox(minLng, minLat, maxLng, maxLat)) {
            logger.debug('Using bbox from GeoArrow metadata', LogCategory.MAP, {
              bbox
            });
            return [
              [minLng, minLat],
              [maxLng, maxLat]
            ];
          }

          if (isWorldBounds) {
            logger.debug(
              'Skipping world bounds from metadata, will calculate from geometry',
              LogCategory.MAP
            );
          }
        }
      }
    }

    if (primaryColumn) {
      logger.debug(
        'No bbox in metadata, calculating from primary column',
        LogCategory.MAP,
        { primaryColumn }
      );
      const bounds = calculateBoundsFromGeometryData(jsTable, primaryColumn);
      if (bounds) return bounds;
    }

    const geoColumn = findGeoColumn(jsTable);
    if (geoColumn && geoColumn !== primaryColumn) {
      logger.debug(
        'Calculating bounds from discovered geometry column',
        LogCategory.MAP,
        { geoColumn }
      );
      const bounds = calculateBoundsFromGeometryData(jsTable, geoColumn);
      if (bounds) return bounds;
    }

    logger.debug('Trying all columns to find coordinates', LogCategory.MAP, {
      fields: jsTable.schema.fields.map((f) => f.name)
    });
    for (const field of jsTable.schema.fields) {
      if (field.name === primaryColumn || field.name === geoColumn) continue;
      const bounds = calculateBoundsFromGeometryData(jsTable, field.name);
      if (bounds) {
        logger.debug('Found bounds in column', LogCategory.MAP, {
          column: field.name
        });
        return bounds;
      }
    }

    logger.warn(
      'No geometry column found for bounds calculation',
      LogCategory.MAP,
      { fields: jsTable.schema.fields.map((f) => f.name) }
    );
    return null;
  } catch (error) {
    logger.warn(
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
    logger.warn(
      'Failed to calculate bounds from GeoJSON',
      LogCategory.MAP,
      error
    );
    return null;
  }
}
