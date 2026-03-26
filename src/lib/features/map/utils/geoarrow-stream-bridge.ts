/**
 * Bridge between geoarrow-deck-stream and Deck.gl layers.
 *
 * Encapsulates the shared parser config (geoIdentity passthrough) and
 * provides khartis-specific helpers (point attribute builders, row accessor).
 *
 * For now, uses geoIdentity() so coordinates stay as lon/lat —
 * Deck.gl's MapView handles web mercator projection.
 */
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  geoIdentity,
  parseGeometry,
  parsePolygonsToSolid,
  parsePoints
} from 'geoarrow-deck-stream';
import type {
  BinaryPathData,
  BinaryPolygonData,
  BinaryPointData,
  DeckBinaryAttribute,
  ParserOptions
} from 'geoarrow-deck-stream';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

// Shared parser config — identity projection (lon/lat passthrough)
const IDENTITY_OPTIONS: ParserOptions = {
  projection: geoIdentity(),
  capacityMultiplier: 1.0,
  rewind: true
};

// ---------------------------------------------------------------------------
// Parsing helpers (encapsulate shared IDENTITY_OPTIONS)
// WeakMap caches ensure each Arrow table is parsed at most once per type.
// When the table is GC'd, the cached result is automatically released.
// ---------------------------------------------------------------------------

const pathCache = new WeakMap<ArrowTable, BinaryPathData>();
const solidPolygonCache = new WeakMap<ArrowTable, BinaryPolygonData>();
const pointCache = new WeakMap<ArrowTable, BinaryPointData>();

export function parsePaths(table: ArrowTable): BinaryPathData {
  let result = pathCache.get(table);
  if (!result) {
    try {
      result = parseGeometry(table, IDENTITY_OPTIONS);
    } catch (error) {
      logger.error(
        'Failed to parse paths from Arrow table',
        LogCategory.MAP,
        error
      );
      throw error;
    }
    pathCache.set(table, result);
  }
  return result;
}

export function parseSolidPolygons(table: ArrowTable): BinaryPolygonData {
  let result = solidPolygonCache.get(table);
  if (!result) {
    try {
      result = parsePolygonsToSolid(table, IDENTITY_OPTIONS);
    } catch (error) {
      logger.error(
        'Failed to parse solid polygons from Arrow table',
        LogCategory.MAP,
        error
      );
      throw error;
    }
    solidPolygonCache.set(table, result);
  }
  return result;
}

export function parsePointData(table: ArrowTable): BinaryPointData {
  let result = pointCache.get(table);
  if (!result) {
    try {
      result = parsePoints(table, IDENTITY_OPTIONS);
    } catch (error) {
      logger.error(
        'Failed to parse points from Arrow table',
        LogCategory.MAP,
        error
      );
      throw error;
    }
    pointCache.set(table, result);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Point attribute factories (not provided by geoarrow-deck-stream)
// ---------------------------------------------------------------------------

/**
 * Per-point color attribute for ScatterplotLayer.
 * Each point maps 1:1 to a featureId (original Arrow row index).
 */
export function pointColorAttr(
  data: BinaryPointData,
  colorLookup: (featureId: number) => [number, number, number, number]
): DeckBinaryAttribute {
  const numPoints = data.length;
  const colors = new Uint8Array(numPoints * 4);
  const rowCache = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < numPoints; i++) {
    const fid = data.featureIds[i];
    let color = rowCache.get(fid);
    if (!color) {
      color = colorLookup(fid);
      rowCache.set(fid, color);
    }
    const offset = i * 4;
    colors[offset] = color[0];
    colors[offset + 1] = color[1];
    colors[offset + 2] = color[2];
    colors[offset + 3] = color[3];
  }
  return { value: colors, size: 4 };
}

/**
 * Per-point radius attribute for ScatterplotLayer.
 */
export function pointRadiusAttr(
  data: BinaryPointData,
  radiusLookup: (featureId: number) => number
): DeckBinaryAttribute {
  const numPoints = data.length;
  const radii = new Float32Array(numPoints);
  const rowCache = new Map<number, number>();
  for (let i = 0; i < numPoints; i++) {
    const fid = data.featureIds[i];
    let radius = rowCache.get(fid);
    if (radius === undefined) {
      radius = radiusLookup(fid);
      rowCache.set(fid, radius);
    }
    radii[i] = radius;
  }
  return { value: radii, size: 1 };
}

// ---------------------------------------------------------------------------
// Row accessor adapters (bridges DeckDataRow accessors to featureId lookups)
// ---------------------------------------------------------------------------

export function rowAccessor<T>(
  table: ArrowTable,
  accessor: (row: Record<string, unknown>) => T
): (featureId: number) => T {
  return (featureId: number): T => {
    const row = table.get(featureId);
    return accessor(row as unknown as Record<string, unknown>);
  };
}

/**
 * Optimized accessor for single-column lookups.
 * Avoids creating a full row proxy — reads directly from the column vector.
 */
export function columnAccessor<T>(
  table: ArrowTable,
  columnName: string,
  transform: (value: unknown) => T
): (featureId: number) => T {
  const vector = table.getChild(columnName);
  if (!vector) return () => transform(undefined);
  return (featureId: number): T => transform(vector.get(featureId));
}

// ---------------------------------------------------------------------------
// DataFilterExtension: per-feature filter value attribute
// ---------------------------------------------------------------------------

/**
 * Build a Float32 binary attribute for DataFilterExtension's getFilterValue.
 * Works with any binary data type (points, paths, polygons) that has featureIds.
 * Each feature gets a single numeric value read from the specified Arrow column.
 */
export function filterValueAttr(
  data: { readonly length: number; readonly featureIds: Uint32Array },
  table: ArrowTable,
  columnName: string
): DeckBinaryAttribute {
  const n = data.length;
  const values = new Float32Array(n);
  const vector = table.getChild(columnName);
  if (!vector) return { value: values, size: 1 };

  const rowCache = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const fid = data.featureIds[i];
    let val = rowCache.get(fid);
    if (val === undefined) {
      const raw = vector.get(fid);
      val =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'bigint'
            ? Number(raw)
            : parseFloat(String(raw));
      if (!Number.isFinite(val)) val = NaN;
      rowCache.set(fid, val);
    }
    values[i] = val;
  }
  return { value: values, size: 1 };
}

// ---------------------------------------------------------------------------
// Binary centroid extraction (avoids GeoJSON conversion for label placement)
// ---------------------------------------------------------------------------

/**
 * Extract centroid positions from binary polygon data.
 * Computes bounding-box centroid per polygon from the vertex array directly.
 */
export function polygonCentroids(data: BinaryPolygonData): Float64Array {
  const centroids = new Float64Array(data.length * 2);
  const positions = data.positions;
  const polyIndices = data.polygonIndices;

  for (let i = 0; i < data.length; i++) {
    const start = polyIndices[i] * 2;
    const end =
      (i + 1 < data.length ? polyIndices[i + 1] : positions.length / 2) * 2;
    // Use mean of coordinates instead of bbox centroid to handle antimeridian-crossing polygons
    let sumX = 0,
      sumY = 0,
      count = 0;
    for (let j = start; j < end; j += 2) {
      sumX += positions[j];
      sumY += positions[j + 1];
      count++;
    }
    centroids[i * 2] = count > 0 ? sumX / count : 0;
    centroids[i * 2 + 1] = count > 0 ? sumY / count : 0;
  }
  return centroids;
}

/**
 * Extract centroid positions from binary path data (line midpoints).
 */
export function pathCentroids(data: BinaryPathData): Float64Array {
  const centroids = new Float64Array(data.length * 2);
  const positions = data.positions;
  const startIndices = data.startIndices;

  for (let i = 0; i < data.length; i++) {
    const start = startIndices[i] * 2;
    const end =
      (i + 1 < data.length ? startIndices[i + 1] : positions.length / 2) * 2;
    const midIdx = start + Math.floor((end - start) / 4) * 2;
    centroids[i * 2] = positions[midIdx] ?? 0;
    centroids[i * 2 + 1] = positions[midIdx + 1] ?? 0;
  }
  return centroids;
}

/**
 * Extract positions from binary point data.
 */
export function pointPositions(data: BinaryPointData): Float64Array {
  // Points positions are already flat [x0,y0,x1,y1,...] — return as Float64
  const result = new Float64Array(data.length * 2);
  for (let i = 0; i < data.length * 2; i++) {
    result[i] = data.positions[i];
  }
  return result;
}
