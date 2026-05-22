import { GEO_COLUMN_NAMES } from '$lib/features/commons/constants/data.constants';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection, Geometry } from 'geojson';
import type { LngLatBoundsLike } from 'maplibre-gl';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { GeoArrowMetadataKey } from '../constants';
import { parseGeoJsonGeometry } from '../io/geometry-parser';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;
const DEGENERATE_BOUNDS_PADDING_DEGREES = 0.01;
const BOUNDS_READ_WARNING_LIMIT = 3;
const boundsReadWarnings = new Map<string, number>();
type RowInclusionPredicate = (rowIndex: number) => boolean;

function warnBoundsReadFailureOnce(
  geoColumn: string,
  rowIndex: number,
  error: unknown
): void {
  const warningCount = boundsReadWarnings.get(geoColumn) ?? 0;

  if (warningCount >= BOUNDS_READ_WARNING_LIMIT) {
    return;
  }

  boundsReadWarnings.set(geoColumn, warningCount + 1);
  logger.error(
    'Failed to read geometry while calculating bounds',
    LogCategory.MAP,
    error,
    { extra: { geoColumn, rowIndex } }
  );
}

function safeReadGeometryValue(
  geomVector: NonNullable<ReturnType<ArrowTable['getChild']>>,
  geoColumn: string,
  rowIndex: number
): unknown {
  try {
    return geomVector.get(rowIndex);
  } catch (error) {
    warnBoundsReadFailureOnce(geoColumn, rowIndex, error);
    return null;
  }
}

const boundsCache = new WeakMap<ArrowTable, LngLatBoundsLike | null>();

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

function expandDegenerateAxis(
  min: number,
  max: number,
  minLimit: number,
  maxLimit: number
): [number, number] {
  if (min < max) {
    return [min, max];
  }

  const paddedMin = Math.max(minLimit, min - DEGENERATE_BOUNDS_PADDING_DEGREES);
  const paddedMax = Math.min(maxLimit, max + DEGENERATE_BOUNDS_PADDING_DEGREES);

  if (paddedMin < paddedMax) {
    return [paddedMin, paddedMax];
  }

  if (min <= minLimit) {
    return [
      minLimit,
      Math.min(maxLimit, minLimit + DEGENERATE_BOUNDS_PADDING_DEGREES)
    ];
  }

  return [
    Math.max(minLimit, maxLimit - DEGENERATE_BOUNDS_PADDING_DEGREES),
    maxLimit
  ];
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
  geoColumn: string,
  includeRow?: RowInclusionPredicate
): LngLatBoundsLike | null {
  const geomVector = jsTable.getChild(geoColumn);
  if (!geomVector) {
    return null;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const maxSamples = includeRow
    ? jsTable.numRows
    : Math.min(jsTable.numRows, 10000);
  const step = Math.max(1, Math.floor(jsTable.numRows / maxSamples));

  for (let i = 0; i < jsTable.numRows; i += step) {
    if (includeRow && !includeRow(i)) {
      continue;
    }

    const geom = safeReadGeometryValue(geomVector, geoColumn, i);

    const parsed = parseGeoJsonGeometry(geom);
    if (parsed) {
      const coords = extractCoordsFromGeometry(parsed);
      for (const coord of coords) {
        if (!Array.isArray(coord) || coord.length < 2) continue;
        const [lng, lat] = coord;
        if (typeof lng === 'number' && typeof lat === 'number') {
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
      const [lng, lat] = coord;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
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

  const [safeMinLng, safeMaxLng] = expandDegenerateAxis(
    minLng,
    maxLng,
    MIN_LNG,
    MAX_LNG
  );
  const [safeMinLat, safeMaxLat] = expandDegenerateAxis(
    minLat,
    maxLat,
    MIN_LAT,
    MAX_LAT
  );

  if (!isValidBbox(safeMinLng, safeMinLat, safeMaxLng, safeMaxLat)) {
    return null;
  }

  return [
    [safeMinLng, safeMinLat],
    [safeMaxLng, safeMaxLat]
  ];
}

export function calculateBoundsFromGeoArrowRows(
  jsTable: ArrowTable,
  includeRow: RowInclusionPredicate
): LngLatBoundsLike | null {
  try {
    if (jsTable.numRows === 0) {
      return null;
    }

    const geoMetadata = jsTable.schema.metadata.get(GeoArrowMetadataKey.GEO);
    let primaryColumn: string | null = null;

    if (geoMetadata) {
      const jsonMeta = JSON.parse(geoMetadata);
      primaryColumn = jsonMeta.primary_column ?? null;
    }

    if (primaryColumn) {
      const bounds = calculateBoundsFromGeometryData(
        jsTable,
        primaryColumn,
        includeRow
      );
      if (bounds) {
        return bounds;
      }
    }

    const geoColumn = findGeoColumn(jsTable);
    if (geoColumn && geoColumn !== primaryColumn) {
      const bounds = calculateBoundsFromGeometryData(
        jsTable,
        geoColumn,
        includeRow
      );
      if (bounds) {
        return bounds;
      }
    }

    for (const field of jsTable.schema.fields) {
      if (field.name === primaryColumn || field.name === geoColumn) continue;
      const bounds = calculateBoundsFromGeometryData(
        jsTable,
        field.name,
        includeRow
      );
      if (bounds) {
        return bounds;
      }
    }

    return null;
  } catch (error) {
    logger.error('Failed to calculate GeoJSON bounds', LogCategory.MAP, error);
    return null;
  }
}

export function calculateBoundsFromGeoArrow(
  jsTable: ArrowTable
): LngLatBoundsLike | null {
  const cached = boundsCache.get(jsTable);
  if (cached !== undefined) return cached;

  try {
    if (jsTable.numRows === 0) {
      boundsCache.set(jsTable, null);
      return null;
    }

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

          const isWorldBounds =
            minLng === -180 &&
            minLat === -90 &&
            maxLng === 180 &&
            maxLat === 90;

          if (!isWorldBounds && isValidBbox(minLng, minLat, maxLng, maxLat)) {
            const result: LngLatBoundsLike = [
              [minLng, minLat],
              [maxLng, maxLat]
            ];
            boundsCache.set(jsTable, result);
            return result;
          }
        }
      }
    }

    if (primaryColumn) {
      const bounds = calculateBoundsFromGeometryData(jsTable, primaryColumn);
      if (bounds) {
        boundsCache.set(jsTable, bounds);
        return bounds;
      }
    }

    const geoColumn = findGeoColumn(jsTable);
    if (geoColumn && geoColumn !== primaryColumn) {
      const bounds = calculateBoundsFromGeometryData(jsTable, geoColumn);
      if (bounds) {
        boundsCache.set(jsTable, bounds);
        return bounds;
      }
    }

    for (const field of jsTable.schema.fields) {
      if (field.name === primaryColumn || field.name === geoColumn) continue;
      const bounds = calculateBoundsFromGeometryData(jsTable, field.name);
      if (bounds) {
        boundsCache.set(jsTable, bounds);
        return bounds;
      }
    }

    boundsCache.set(jsTable, null);
    return null;
  } catch (error) {
    logger.error('Failed to calculate GeoArrow bounds', LogCategory.MAP, error);
    boundsCache.set(jsTable, null);
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
    logger.error('Failed to calculate feature bounds', LogCategory.MAP, error);
    return null;
  }
}
