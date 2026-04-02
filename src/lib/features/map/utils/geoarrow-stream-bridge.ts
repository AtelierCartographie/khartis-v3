/**
 * Bridge between geoarrow-deck-stream and Deck.gl layers.
 *
 * Provides both identity (lon/lat passthrough) and projection-aware parsing.
 * Identity parsing is used for custom basemaps and MapLibre mode.
 * Projection-aware parsing applies composite/simple/identity projections
 * from basemap metadata for built-in basemaps in orthographic mode.
 */
import {
  type Table as ArrowTable,
  Schema,
  Field,
  RecordBatch,
  Table as ArrowTableImpl
} from 'apache-arrow/Arrow';
import {
  geoIdentity,
  parseGeometry,
  parsePolygonsToSolid,
  parsePoints,
  buildCompositeProjection
} from 'geoarrow-deck-stream';
import type {
  BinaryPathData,
  BinaryPolygonData,
  BinaryPointData,
  DeckBinaryAttribute,
  ParserOptions,
  ProjectionLike
} from 'geoarrow-deck-stream';
import type { GeoProjection } from 'd3-geo';
// d3-geo-projection has no bundled type declarations — import via namespace cast
import * as _d3GeoProjection from 'd3-geo-projection';

const { geoNaturalEarth2 } = _d3GeoProjection as unknown as Record<
  string,
  () => GeoProjection
>;
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type {
  BasemapMetadata,
  ProjectionPresets
} from '../types/basemap.types';
import { proj4d3 } from './proj4d3';

// Proj4 projection names not supported by proj4.js — mapped to d3-geo equivalents
const D3_GEO_PROJECTION_MAP: Record<string, () => GeoProjection> = {
  natearth2: geoNaturalEarth2
};

function resolveSimpleProjection(proj4String: string): GeoProjection {
  const match = proj4String.match(/\+proj=([^\s+]+)/);
  if (match) {
    const factory = D3_GEO_PROJECTION_MAP[match[1]];
    if (factory) return factory();
  }
  return proj4d3(proj4String);
}

// ---------------------------------------------------------------------------
// Geometry column normalization
// geoarrow-deck-stream expects the geometry column to be named "geometry".
// DuckDB ST_Read typically names it "geom" or "wkb_geometry".
// This helper renames the column in the Arrow schema so the library can find it.
// ---------------------------------------------------------------------------

const EXPECTED_GEOM_COL = 'geometry';
const normalizedTableCache = new WeakMap<ArrowTable, ArrowTable>();

function normalizeGeomColumnName(table: ArrowTable): ArrowTable {
  const cached = normalizedTableCache.get(table);
  if (cached) return cached;

  const geoMeta = table.schema?.metadata?.get('geo');
  if (!geoMeta) return table;

  let primaryColumn: string;
  try {
    primaryColumn = JSON.parse(geoMeta).primary_column;
  } catch {
    return table;
  }

  if (!primaryColumn || primaryColumn === EXPECTED_GEOM_COL) return table;

  // Rename the geometry column + update "geo" metadata to match
  const updatedFields = table.schema.fields.map((f) =>
    f.name === primaryColumn
      ? new Field(EXPECTED_GEOM_COL, f.type, f.nullable, f.metadata)
      : f
  );

  const parsedGeo = JSON.parse(geoMeta);
  parsedGeo.primary_column = EXPECTED_GEOM_COL;
  if (parsedGeo.columns?.[primaryColumn]) {
    parsedGeo.columns[EXPECTED_GEOM_COL] = parsedGeo.columns[primaryColumn];
    delete parsedGeo.columns[primaryColumn];
  }

  const metadataMap = new Map(table.schema.metadata);
  metadataMap.set('geo', JSON.stringify(parsedGeo));

  const newSchema = new Schema(updatedFields, metadataMap);
  // Rebuild each RecordBatch with the new schema so that the Table and
  // inner batch schemas stay equivalent (Apache Arrow enforces this).
  const newBatches = table.batches.map(
    (batch) => new RecordBatch(newSchema, batch.data)
  );
  const result = new ArrowTableImpl(newSchema, newBatches);
  normalizedTableCache.set(table, result);
  return result;
}

// ---------------------------------------------------------------------------
// Identity parsing (lon/lat passthrough — for custom basemaps, MapLibre mode)
// ---------------------------------------------------------------------------

const IDENTITY_OPTIONS: ParserOptions = {
  projection: geoIdentity(),
  capacityMultiplier: 1.0,
  rewind: false
};

const pathCache = new WeakMap<ArrowTable, BinaryPathData>();
const solidPolygonCache = new WeakMap<ArrowTable, BinaryPolygonData>();
const pointCache = new WeakMap<ArrowTable, BinaryPointData>();

// Projection-aware caches (2-key: table → projection → result).
// The ProjectionLike key is stable per basemap thanks to memoization in use-map-layers.
const projSolidPolygonCache = new WeakMap<
  ArrowTable,
  Map<ProjectionLike, BinaryPolygonData>
>();
const projPathCache = new WeakMap<
  ArrowTable,
  Map<ProjectionLike, BinaryPathData>
>();
const projPointCache = new WeakMap<
  ArrowTable,
  Map<ProjectionLike, BinaryPointData>
>();

export function parsePaths(table: ArrowTable): BinaryPathData {
  let result = pathCache.get(table);
  if (!result) {
    try {
      result = parseGeometry(normalizeGeomColumnName(table), IDENTITY_OPTIONS);
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
      result = parsePolygonsToSolid(
        normalizeGeomColumnName(table),
        IDENTITY_OPTIONS
      );
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
      result = parsePoints(normalizeGeomColumnName(table), IDENTITY_OPTIONS);
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
// Projection-aware parsing (for built-in basemaps with composite/simple proj)
// ---------------------------------------------------------------------------

/**
 * Build a d3-compatible projection from basemap metadata.
 * Returns geoIdentity for custom/identity basemaps, a composite projection
 * for DOM-TOM layouts, or a simple proj4-based projection.
 */
export function buildProjectionForBasemap(
  metadata: BasemapMetadata,
  width: number,
  height: number,
  projectionPresets: ProjectionPresets | null
): ProjectionLike {
  const projTo = metadata.proj_to;

  if (!projTo || projTo.type === 'identity') {
    return geoIdentity();
  }

  if (projTo.type === 'simple' && projTo.proj4) {
    try {
      return resolveSimpleProjection(projTo.proj4);
    } catch (error) {
      logger.warn(
        'Failed to build simple projection, falling back to identity',
        LogCategory.MAP,
        { proj4: projTo.proj4, error }
      );
      return geoIdentity();
    }
  }

  if (projTo.type === 'composite' && projTo.preset && projectionPresets) {
    const preset = projectionPresets[projTo.preset];
    if (preset?.entries?.length) {
      try {
        return buildCompositeProjection({
          width,
          height,
          entries: preset.entries.map((entry) => ({
            id: entry.id,
            projection: resolveSimpleProjection(entry.proj4),
            bounds: [
              entry.bounds[0][0],
              entry.bounds[0][1],
              entry.bounds[1][0],
              entry.bounds[1][1]
            ],
            layout: entry.layout,
            scaleMultiplier: entry.scaleMultiplier
          }))
        });
      } catch (error) {
        logger.warn(
          'Failed to build composite projection, falling back to identity',
          LogCategory.MAP,
          { preset: projTo.preset, error }
        );
        return geoIdentity();
      }
    }
  }

  logger.warn(
    `Unknown projection config, falling back to identity`,
    LogCategory.MAP,
    { projTo }
  );
  return geoIdentity();
}

/**
 * For composite basemaps (DOM-TOM), the full bbox spans ~120° of longitude.
 * Without composite projection (identity fallback), we use the mainland
 * bounds from the first preset entry for viewport fitting.
 */
export function getMainlandBboxForBasemap(
  metadata: BasemapMetadata,
  projectionPresets: ProjectionPresets | null
): [number, number, number, number] | null {
  const projTo = metadata.proj_to;
  if (projTo?.type !== 'composite' || !projTo.preset || !projectionPresets) {
    return null;
  }

  const preset = projectionPresets[projTo.preset];
  if (!preset?.entries?.length) return null;

  const mainEntry =
    preset.entries.find((e) => e.id === 'mainland') ?? preset.entries[0];
  const b = mainEntry.bounds;
  return [b[0][0], b[0][1], b[1][0], b[1][1]];
}

/**
 * Compute the bounding box of a basemap's output coordinates in projected space.
 * When a non-identity projection is active, the layers output coordinates in the
 * projection's pixel space (e.g. [0,960]×[0,500] for Natural Earth 2). The model
 * matrix must be computed in that same space, not in WGS84 lon/lat.
 *
 * Samples the WGS84 bbox boundary through the projection to find the projected extent.
 * Returns null for identity projections (use original WGS84 bbox unchanged).
 */
export function computeProjectedBboxForBasemap(
  metadata: BasemapMetadata,
  projectionPresets: ProjectionPresets | null,
  width = 960,
  height = 600,
  /** Override the WGS84 bbox to project (e.g., mainland-only bounds for composites) */
  overrideBbox?: [number, number, number, number]
): [number, number, number, number] | null {
  const projTo = metadata.proj_to;
  if (!projTo || projTo.type === 'identity') return null;

  const wgs84Bbox = overrideBbox ?? metadata.bbox;
  if (!wgs84Bbox) return null;

  const projection = buildProjectionForBasemap(
    metadata,
    width,
    height,
    projectionPresets
  );

  const [west, south, east, north] = wgs84Bbox;
  const steps = 20;
  const xs: number[] = [];
  const ys: number[] = [];

  const tryProject = (lon: number, lat: number) => {
    const proj = projection as unknown as (
      c: [number, number]
    ) => [number, number] | null;
    const result = proj([lon, lat]);
    if (result && isFinite(result[0]) && isFinite(result[1])) {
      xs.push(result[0]);
      ys.push(result[1]);
    }
  };

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lon = west + t * (east - west);
    const lat = south + t * (north - south);
    tryProject(lon, south);
    tryProject(lon, north);
    tryProject(west, lat);
    tryProject(east, lat);
  }
  tryProject((west + east) / 2, (south + north) / 2);

  if (xs.length === 0) return null;

  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Parse geometry with a specific projection.
 * Cached by (table, projection) — the projection reference is stable per basemap
 * (memoized in use-map-layers.svelte.ts), so the Map key is a reference equality check.
 */
export function parseSolidPolygonsWithProjection(
  table: ArrowTable,
  projection: ProjectionLike,
  rewind = true
): BinaryPolygonData {
  let projMap = projSolidPolygonCache.get(table);
  if (projMap) {
    const cached = projMap.get(projection);
    if (cached) return cached;
  }
  const result = parsePolygonsToSolid(normalizeGeomColumnName(table), {
    projection,
    capacityMultiplier: 1.0,
    rewind
  });
  if (!projMap) {
    projMap = new Map();
    projSolidPolygonCache.set(table, projMap);
  }
  projMap.set(projection, result);
  return result;
}

export function parsePathsWithProjection(
  table: ArrowTable,
  projection: ProjectionLike,
  rewind = true
): BinaryPathData {
  let projMap = projPathCache.get(table);
  if (projMap) {
    const cached = projMap.get(projection);
    if (cached) return cached;
  }
  const result = parseGeometry(normalizeGeomColumnName(table), {
    projection,
    capacityMultiplier: 1.0,
    rewind
  });
  if (!projMap) {
    projMap = new Map();
    projPathCache.set(table, projMap);
  }
  projMap.set(projection, result);
  return result;
}

export function parsePointDataWithProjection(
  table: ArrowTable,
  projection: ProjectionLike,
  rewind = true
): BinaryPointData {
  let projMap = projPointCache.get(table);
  if (projMap) {
    const cached = projMap.get(projection);
    if (cached) return cached;
  }
  const result = parsePoints(normalizeGeomColumnName(table), {
    projection,
    capacityMultiplier: 1.0,
    rewind
  });
  if (!projMap) {
    projMap = new Map();
    projPointCache.set(table, projMap);
  }
  projMap.set(projection, result);
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

// ---------------------------------------------------------------------------
// GeoJSON coordinate projection (for WKB fallback path)
// ---------------------------------------------------------------------------

/**
 * Project GeoJSON coordinates through a d3-compatible projection.
 * Used when WKB data falls through to the GeoJSON path and needs to align
 * with basemap layers that are in projected coordinate space.
 *
 * Features where ANY vertex fails to project (outside basemap bounds) are
 * dropped entirely. This prevents mixed pixel-space / degree-space coordinates
 * which would produce diagonal streaks connecting correctly-projected vertices
 * to unprojectable ones.
 */
export function projectGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  projection: ProjectionLike
): GeoJSON.FeatureCollection {
  const proj = projection as unknown as (
    c: [number, number]
  ) => [number, number] | null;

  function projectCoord(coord: number[]): [number, number] | null {
    const result = proj([coord[0], coord[1]]);
    if (result && isFinite(result[0]) && isFinite(result[1])) {
      return [result[0], result[1]];
    }
    return null;
  }

  function projectCoords(coords: number[][]): number[][] | null {
    const out: number[][] = [];
    for (const c of coords) {
      const p = projectCoord(c);
      if (!p) return null;
      out.push(p);
    }
    return out;
  }

  function projectRings(rings: number[][][]): number[][][] | null {
    const out: number[][][] = [];
    for (const ring of rings) {
      const r = projectCoords(ring);
      if (!r) return null;
      out.push(r);
    }
    return out;
  }

  function projectGeometry(geom: GeoJSON.Geometry): GeoJSON.Geometry | null {
    switch (geom.type) {
      case 'Point': {
        const c = projectCoord(geom.coordinates);
        return c ? { ...geom, coordinates: c } : null;
      }
      case 'MultiPoint': {
        const cs = projectCoords(geom.coordinates);
        return cs ? { ...geom, coordinates: cs } : null;
      }
      case 'LineString': {
        const cs = projectCoords(geom.coordinates);
        return cs ? { ...geom, coordinates: cs } : null;
      }
      case 'MultiLineString': {
        const rs = projectRings(geom.coordinates);
        return rs ? { ...geom, coordinates: rs } : null;
      }
      case 'Polygon': {
        const rs = projectRings(geom.coordinates);
        return rs ? { ...geom, coordinates: rs } : null;
      }
      case 'MultiPolygon': {
        const projected = geom.coordinates.map(projectRings);
        if (projected.some((r) => r === null)) return null;
        return { ...geom, coordinates: projected as number[][][][] };
      }
      case 'GeometryCollection': {
        const geoms = geom.geometries.map(projectGeometry);
        if (geoms.some((g) => g === null)) return null;
        return { ...geom, geometries: geoms as GeoJSON.Geometry[] };
      }
      default:
        return geom;
    }
  }

  return {
    ...geojson,
    features: geojson.features
      .map((f) => {
        const geometry = projectGeometry(f.geometry);
        return geometry ? ({ ...f, geometry } as GeoJSON.Feature) : null;
      })
      .filter((f): f is GeoJSON.Feature => f !== null)
  };
}
