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
    result = parseGeometry(table, IDENTITY_OPTIONS);
    pathCache.set(table, result);
  }
  return result;
}

export function parseSolidPolygons(table: ArrowTable): BinaryPolygonData {
  let result = solidPolygonCache.get(table);
  if (!result) {
    result = parsePolygonsToSolid(table, IDENTITY_OPTIONS);
    solidPolygonCache.set(table, result);
  }
  return result;
}

export function parsePointData(table: ArrowTable): BinaryPointData {
  let result = pointCache.get(table);
  if (!result) {
    result = parsePoints(table, IDENTITY_OPTIONS);
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
// Row accessor adapter (bridges DeckDataRow accessors to featureId lookups)
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
