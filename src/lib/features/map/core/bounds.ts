import { GEO_COLUMN_NAMES } from '$lib/features/commons/constants/data.constants';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type {
  BinaryPathData,
  BinaryPointData,
  BinaryPolygonData
} from '@ateliercartographie/geoarrow-deck-stream';
import type { FeatureCollection, Geometry } from 'geojson';
import type { LngLatBoundsLike } from 'maplibre-gl';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  ArrowExtension,
  GeoArrowMetadataKey,
  GeometryType
} from '../constants';
import { parseGeoJsonGeometry } from '../io/geometry-parser';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';
import {
  parsePaths,
  parsePointData,
  parseSolidPolygons
} from '../utils/geoarrow-stream-bridge.utils';

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;
const DEGENERATE_BOUNDS_PADDING_DEGREES = 0.01;
const BOUNDS_READ_WARNING_LIMIT = 3;
const boundsReadWarnings = new Map<string, number>();
type RowInclusionPredicate = (rowIndex: number) => boolean;
type BoundsAccumulator = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

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

function createBoundsAccumulator(): BoundsAccumulator {
  return {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity
  };
}

function addCoordinateToBounds(
  accumulator: BoundsAccumulator,
  lng: number,
  lat: number
): void {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return;
  }

  if (lng < accumulator.minLng) accumulator.minLng = lng;
  if (lng > accumulator.maxLng) accumulator.maxLng = lng;
  if (lat < accumulator.minLat) accumulator.minLat = lat;
  if (lat > accumulator.maxLat) accumulator.maxLat = lat;
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

function finalizeBoundsAccumulator(
  accumulator: BoundsAccumulator
): LngLatBoundsLike | null {
  const { minLng, minLat, maxLng, maxLat } = accumulator;

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

function calculateBoundsFromGeometryData(
  jsTable: ArrowTable,
  geoColumn: string,
  includeRow?: RowInclusionPredicate
): LngLatBoundsLike | null {
  const geomVector = jsTable.getChild(geoColumn);
  if (!geomVector) {
    return null;
  }

  const bounds = createBoundsAccumulator();
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
          addCoordinateToBounds(bounds, lng, lat);
        }
      }
      continue;
    }

    const coord = extractCoordFromValue(geom);
    if (coord) {
      addCoordinateToBounds(bounds, coord[0], coord[1]);
    }
  }

  return finalizeBoundsAccumulator(bounds);
}

function addBinaryPositionRangeToBounds(
  accumulator: BoundsAccumulator,
  positions: Float32Array,
  startVertex: number,
  endVertex: number
): void {
  const vertexCount = Math.floor(positions.length / 2);
  const start = Math.max(0, Math.min(startVertex, vertexCount));
  const end = Math.max(start, Math.min(endVertex, vertexCount));

  for (let vertexIndex = start; vertexIndex < end; vertexIndex += 1) {
    const positionIndex = vertexIndex * 2;
    addCoordinateToBounds(
      accumulator,
      positions[positionIndex],
      positions[positionIndex + 1]
    );
  }
}

function calculateBoundsFromBinaryPoints(
  data: BinaryPointData,
  includeRow: RowInclusionPredicate
): LngLatBoundsLike | null {
  const bounds = createBoundsAccumulator();
  const pointCount = Math.min(
    data.length,
    data.featureIds.length,
    Math.floor(data.positions.length / 2)
  );

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    if (!includeRow(data.featureIds[pointIndex])) {
      continue;
    }

    const positionIndex = pointIndex * 2;
    addCoordinateToBounds(
      bounds,
      data.positions[positionIndex],
      data.positions[positionIndex + 1]
    );
  }

  return finalizeBoundsAccumulator(bounds);
}

function calculateBoundsFromBinaryPaths(
  data: BinaryPathData,
  includeRow: RowInclusionPredicate
): LngLatBoundsLike | null {
  const bounds = createBoundsAccumulator();
  const pathCount = Math.min(
    data.length,
    data.featureIds.length,
    Math.max(0, data.startIndices.length - 1)
  );

  for (let pathIndex = 0; pathIndex < pathCount; pathIndex += 1) {
    if (!includeRow(data.featureIds[pathIndex])) {
      continue;
    }

    addBinaryPositionRangeToBounds(
      bounds,
      data.positions,
      data.startIndices[pathIndex],
      data.startIndices[pathIndex + 1]
    );
  }

  return finalizeBoundsAccumulator(bounds);
}

function calculateBoundsFromBinaryPolygons(
  data: BinaryPolygonData,
  includeRow: RowInclusionPredicate
): LngLatBoundsLike | null {
  const bounds = createBoundsAccumulator();
  const polygonCount = Math.min(
    data.length,
    data.featureIds.length,
    Math.max(0, data.polygonIndices.length - 1)
  );

  for (let polygonIndex = 0; polygonIndex < polygonCount; polygonIndex += 1) {
    if (!includeRow(data.featureIds[polygonIndex])) {
      continue;
    }

    addBinaryPositionRangeToBounds(
      bounds,
      data.positions,
      data.polygonIndices[polygonIndex],
      data.polygonIndices[polygonIndex + 1]
    );
  }

  return finalizeBoundsAccumulator(bounds);
}

function isNativeGeoArrowExtension(extensionName: string | null): boolean {
  return (
    extensionName !== null &&
    extensionName.startsWith('geoarrow.') &&
    extensionName !== ArrowExtension.GEOARROW_WKB
  );
}

function calculateBoundsFromNativeGeoArrowRows(
  jsTable: ArrowTable,
  geometryType: GeometryType | null,
  includeRow: RowInclusionPredicate
): LngLatBoundsLike | null {
  try {
    switch (geometryType) {
      case GeometryType.POINT:
      case GeometryType.MULTIPOINT:
        return calculateBoundsFromBinaryPoints(
          parsePointData(jsTable),
          includeRow
        );
      case GeometryType.LINESTRING:
      case GeometryType.MULTILINESTRING:
        return calculateBoundsFromBinaryPaths(parsePaths(jsTable), includeRow);
      case GeometryType.POLYGON:
      case GeometryType.MULTIPOLYGON:
        return calculateBoundsFromBinaryPolygons(
          parseSolidPolygons(jsTable),
          includeRow
        );
      default:
        return null;
    }
  } catch (error) {
    logger.error(
      'Failed to calculate native GeoArrow row bounds',
      LogCategory.MAP,
      error
    );
    return null;
  }
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
    let primaryGeometryType: GeometryType | null = null;
    let isNativePrimaryColumn = false;

    if (geoMetadata) {
      const jsonMeta = JSON.parse(geoMetadata);
      primaryColumn = jsonMeta.primary_column ?? null;
      const primaryColumnMeta = primaryColumn
        ? jsonMeta.columns?.[primaryColumn]
        : null;
      const rawGeometryType = Array.isArray(primaryColumnMeta?.geometry_types)
        ? primaryColumnMeta.geometry_types[0]
        : null;
      primaryGeometryType =
        typeof rawGeometryType === 'string'
          ? (rawGeometryType.toUpperCase() as GeometryType)
          : null;
      const primaryField = primaryColumn
        ? jsTable.schema.fields.find((field) => field.name === primaryColumn)
        : null;
      const extensionName =
        primaryField?.metadata
          ?.get(GeoArrowMetadataKey.EXTENSION_NAME)
          ?.toLowerCase() ?? null;
      isNativePrimaryColumn = isNativeGeoArrowExtension(extensionName);
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

    if (isNativePrimaryColumn) {
      const bounds = calculateBoundsFromNativeGeoArrowRows(
        jsTable,
        primaryGeometryType,
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
