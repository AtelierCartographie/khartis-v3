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
import { type GeoProjection } from 'd3-geo';
// d3-geo-projection has no bundled type declarations — import via namespace cast
import * as _d3GeoProjection from 'd3-geo-projection';

const { geoNaturalEarth2, geoProject } = _d3GeoProjection as unknown as {
  geoNaturalEarth2: () => GeoProjection;
  geoProject: (
    object: GeoJSON.GeoJsonObject,
    projection: ProjectionLike
  ) => GeoJSON.GeoJsonObject | null;
};
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

// geoarrow-deck-stream requires a "geometry" column; DuckDB ST_Read names it "geom"/"wkb_geometry".
const EXPECTED_GEOM_COL = 'geometry';
const normalizedTableCache = new WeakMap<ArrowTable, ArrowTable>();
const projectedBboxCache = new WeakMap<
  BasemapMetadata,
  Map<string, [number, number, number, number] | null>
>();

function createProjectionPointSampler(
  projection: ProjectionLike
): (coordinates: [number, number]) => [number, number] | null {
  let projected: [number, number] | null = null;
  const stream = projection.stream({
    point(x: number, y: number): void {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        projected = [x, y];
      }
    },
    lineStart(): void {},
    lineEnd(): void {},
    polygonStart(): void {},
    polygonEnd(): void {}
  });

  return (coordinates: [number, number]) => {
    projected = null;
    stream.point(coordinates[0], coordinates[1]);
    return projected;
  };
}

function sampleProjectedBbox(
  projection: ProjectionLike,
  bbox: [number, number, number, number]
): [number, number, number, number] | null {
  const [west, south, east, north] = bbox;
  const steps = 32;
  const xs: number[] = [];
  const ys: number[] = [];
  const projectPoint = createProjectionPointSampler(projection);

  const tryProject = (lon: number, lat: number) => {
    const result = projectPoint([lon, lat]);
    if (result && Number.isFinite(result[0]) && Number.isFinite(result[1])) {
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

  return xs.length === 0
    ? null
    : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

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

/**
 * Fast WKB Point decoder for multi-batch Arrow tables (e.g. dot-density output).
 *
 * The `geoarrow-deck-stream` library's `parsePoints` only reads the first
 * RecordBatch via `getFirstDataChunk`, so tables with N batches drop
 * (N-1) / N of their rows. Instead of calling the library 58 times and
 * concatenating (which re-allocates + re-runs WKB → native conversion per
 * batch), we decode WKB Points directly: each point is a fixed 21 bytes
 * (1 endian + 4 type + 8 X + 8 Y), so we iterate all batches in one pass
 * and write straight into pre-allocated Float32/Uint32 output buffers.
 */
function decodeWkbPointsAllBatches(table: ArrowTable): BinaryPointData | null {
  const geomVector =
    table.getChild('geometry') ?? table.getChild('wkb_geometry');
  if (!geomVector) return null;

  const totalLength = table.numRows;
  const positions = new Float32Array(totalLength * 2);
  const featureIds = new Uint32Array(totalLength);
  let outIdx = 0;

  for (let b = 0; b < geomVector.data.length; b++) {
    const data = geomVector.data[b];
    const offsets = data.valueOffsets as Int32Array;
    const values = data.values as Uint8Array;
    const batchLen = data.length;

    for (let i = 0; i < batchLen; i++) {
      const start = offsets[i];
      const end = offsets[i + 1];
      // WKB Point = 21 bytes. Guard against malformed / non-Point WKB by
      // bailing out and letting the caller fall back to the library.
      if (end - start !== 21) return null;
      const base = values.byteOffset + start;
      const view = new DataView(values.buffer, base, 21);
      const le = view.getUint8(0) === 1;
      // bytes 1-4 = type; 1 = Point (we only handle the Point case here)
      const type = view.getUint32(1, le);
      if (type !== 1) return null;
      positions[outIdx * 2] = view.getFloat64(5, le);
      positions[outIdx * 2 + 1] = view.getFloat64(13, le);
      featureIds[outIdx] = outIdx;
      outIdx++;
    }
  }

  return { length: outIdx, positions, featureIds, size: 2 };
}

function parsePointsAllBatches(
  table: ArrowTable,
  options: ParserOptions
): BinaryPointData {
  const normalized = normalizeGeomColumnName(table);
  // Fast path: identity projection + WKB Points (density output) can skip the
  // library entirely and decode straight to binary buffers in one pass.
  const isIdentityProjection =
    !options.projection || options.projection === IDENTITY_OPTIONS.projection;
  if (isIdentityProjection && normalized.batches.length > 0) {
    const direct = decodeWkbPointsAllBatches(normalized);
    if (direct) return direct;
  }

  // Library's parsePoints only reads the first RecordBatch; for multi-batch
  // tables we parse each batch as a single-batch table and concat the result.
  if (normalized.batches.length <= 1) {
    return parsePoints(normalized, options);
  }

  const perBatch = normalized.batches.map((batch) => {
    const singleBatchTable = new ArrowTableImpl(normalized.schema, [batch]);
    return parsePoints(singleBatchTable, options);
  });

  let totalLength = 0;
  for (const r of perBatch) totalLength += r.length;

  const positions = new Float32Array(totalLength * 2);
  const featureIds = new Uint32Array(totalLength);
  let posOffset = 0;
  let idOffset = 0;
  let featureIdBase = 0;
  for (const r of perBatch) {
    const posSlice = r.positions.subarray(0, r.length * 2);
    positions.set(posSlice, posOffset);
    posOffset += posSlice.length;

    const idSlice = r.featureIds.subarray(0, r.length);
    for (let i = 0; i < idSlice.length; i++) {
      featureIds[idOffset + i] = idSlice[i] + featureIdBase;
    }
    idOffset += idSlice.length;
    featureIdBase += r.length;
  }

  return { length: totalLength, positions, featureIds, size: 2 };
}

export function parsePointData(table: ArrowTable): BinaryPointData {
  let result = pointCache.get(table);
  if (!result) {
    try {
      result = parsePointsAllBatches(table, IDENTITY_OPTIONS);
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
    const projection = buildCompositeProjectionFromPresetId(
      projTo.preset,
      width,
      height,
      projectionPresets
    );
    if (projection) {
      return projection;
    }
  }

  logger.warn(
    `Unknown projection config, falling back to identity`,
    LogCategory.MAP,
    { projTo }
  );
  return geoIdentity();
}

export function buildCompositeProjectionFromPresetId(
  presetId: string,
  width: number,
  height: number,
  projectionPresets: ProjectionPresets | null
): ProjectionLike | null {
  if (!projectionPresets) {
    return null;
  }

  const preset = projectionPresets[presetId];
  if (!preset?.entries?.length) {
    return null;
  }

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
      { preset: presetId, error }
    );
    return null;
  }
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

  const cacheKey = `${width}x${height}:${wgs84Bbox.join(',')}`;
  let metadataCache = projectedBboxCache.get(metadata);
  if (metadataCache?.has(cacheKey)) {
    return metadataCache.get(cacheKey) ?? null;
  }

  const projection = buildProjectionForBasemap(
    metadata,
    width,
    height,
    projectionPresets
  );
  const result = sampleProjectedBbox(projection, wgs84Bbox);

  if (!metadataCache) {
    metadataCache = new Map();
    projectedBboxCache.set(metadata, metadataCache);
  }
  metadataCache.set(cacheKey, result);

  return result;
}

export function computeProjectedBboxForProjection(
  projection: ProjectionLike,
  bbox: [number, number, number, number]
): [number, number, number, number] | null {
  return sampleProjectedBbox(projection, bbox);
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
  const result = parsePointsAllBatches(table, {
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

/**
 * Per-vertex color attribute for PathLayer binary data.
 *
 * Deck.gl's PathLayer expects binary attributes such as getColor/getWidth
 * to follow the same vertex layout as getPath, not one value per path.
 */
export function pathColorAttr(
  data: BinaryPathData,
  colorLookup: (featureId: number) => [number, number, number, number]
): DeckBinaryAttribute {
  const vertexCount = data.positions.length / data.size;
  const colors = new Uint8Array(vertexCount * 4);

  for (let i = 0; i < data.length; i++) {
    const color = colorLookup(data.featureIds[i]);
    const vertexStart = data.startIndices[i];
    const vertexEnd =
      i + 1 < data.startIndices.length ? data.startIndices[i + 1] : vertexCount;

    for (
      let vertexIndex = vertexStart;
      vertexIndex < vertexEnd;
      vertexIndex++
    ) {
      const offset = vertexIndex * 4;
      colors[offset] = color[0];
      colors[offset + 1] = color[1];
      colors[offset + 2] = color[2];
      colors[offset + 3] = color[3];
    }
  }

  return { value: colors, size: 4, normalized: true };
}

/**
 * Per-vertex width attribute for PathLayer binary data.
 */
export function pathWidthAttr(
  data: BinaryPathData,
  widthLookup: (featureId: number) => number
): DeckBinaryAttribute {
  const vertexCount = data.positions.length / data.size;
  const widths = new Float32Array(vertexCount);

  for (let i = 0; i < data.length; i++) {
    const width = widthLookup(data.featureIds[i]);
    const vertexStart = data.startIndices[i];
    const vertexEnd =
      i + 1 < data.startIndices.length ? data.startIndices[i + 1] : vertexCount;

    for (
      let vertexIndex = vertexStart;
      vertexIndex < vertexEnd;
      vertexIndex++
    ) {
      widths[vertexIndex] = width;
    }
  }

  return { value: widths, size: 1 };
}

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
 * Split rendering accessor (issue #87) — given the basemap geometry Arrow
 * (data source for Deck.gl) and the dataset attribute Arrow joined on
 * `basemap_id`, returns an accessor that resolves a vertex's `featureId`
 * (geometry-row index) → stable feature id (`__feature_id__` / `id`) → dataset
 * row, then forwards to the supplied accessor. The dataset row map is built
 * once per call and indexed by stringified `basemap_id` to absorb int vs
 * varchar key drift.
 */
export function splitRowAccessor<T>(
  geometry: ArrowTable,
  dataset: ArrowTable,
  featureIdColumn: string,
  basemapIdColumnInDataset: string,
  accessor: (row: Record<string, unknown> | null) => T
): (featureId: number) => T {
  const geometryFeatureIdVector = geometry.getChild(featureIdColumn);
  const datasetByFeatureId = new Map<string, Record<string, unknown>>();
  const datasetBasemapIdVector = dataset.getChild(basemapIdColumnInDataset);
  if (datasetBasemapIdVector) {
    const datasetRowCount = dataset.numRows;
    for (let rowIndex = 0; rowIndex < datasetRowCount; rowIndex += 1) {
      const rawId = datasetBasemapIdVector.get(rowIndex);
      if (rawId === null || rawId === undefined) continue;
      const key = String(rawId);
      const row = dataset.get(rowIndex);
      if (row) {
        datasetByFeatureId.set(key, row as unknown as Record<string, unknown>);
      }
    }
  }

  return (featureId: number): T => {
    const rawFeatureId = geometryFeatureIdVector?.get(featureId);
    const key =
      rawFeatureId !== null && rawFeatureId !== undefined
        ? String(rawFeatureId)
        : '';
    const row = datasetByFeatureId.get(key) ?? null;
    return accessor(row);
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
  function sanitizeGeometry(
    geometry: GeoJSON.Geometry | null
  ): GeoJSON.Geometry | null {
    if (!geometry) {
      return null;
    }

    if (geometry.type !== 'GeometryCollection') {
      return geometry;
    }

    const geometries = geometry.geometries
      .map((child) => sanitizeGeometry(child))
      .filter((child): child is GeoJSON.Geometry => child !== null);

    return geometries.length > 0 ? { ...geometry, geometries } : null;
  }

  const projected = geoProject(
    geojson,
    projection
  ) as GeoJSON.FeatureCollection | null;

  if (!projected) {
    return {
      ...geojson,
      features: []
    };
  }

  return {
    ...projected,
    features: projected.features
      .map((f) => {
        const geometry = sanitizeGeometry(f.geometry);
        return geometry ? ({ ...f, geometry } as GeoJSON.Feature) : null;
      })
      .filter((f): f is GeoJSON.Feature => f !== null)
  };
}
