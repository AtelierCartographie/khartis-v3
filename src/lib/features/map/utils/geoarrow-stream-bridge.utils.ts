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
import { type GeoProjection, type GeoStream } from 'd3-geo';

import * as _d3GeoProjection from 'd3-geo-projection';

const { geoNaturalEarth2 } = _d3GeoProjection as unknown as {
  geoNaturalEarth2: () => GeoProjection;
};
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type {
  BasemapMetadata,
  ProjectionPresetEntry,
  ProjectionPresets
} from '../types/basemap.types';
import { proj4d3 } from './proj4d3.utils';

type BBoxTuple = [number, number, number, number];

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

const EXPECTED_GEOM_COL = 'geometry';
const normalizedTableCache = new WeakMap<ArrowTable, ArrowTable>();
const projectedBboxCache = new WeakMap<
  BasemapMetadata,
  Map<string, BBoxTuple | null>
>();

type GeoBounds = [number, number, number, number];
type CompositeSubProjection = {
  id: string;
  projection: ProjectionLike;
  bounds: GeoBounds;
  screenExtent: [[number, number], [number, number]];
};

type CompositeProjectionLike = ProjectionLike & {
  getSubProjections: () => CompositeSubProjection[];
  getInsetBorders?: () => unknown;
  invert?: (coordinates: [number, number]) => [number, number] | null;
};

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
  bbox: BBoxTuple
): BBoxTuple | null {
  const [west, south, east, north] = bbox;
  const steps = 32;
  const interiorSteps = 8;
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

  for (let xStep = 1; xStep < interiorSteps; xStep++) {
    const lon = west + (xStep / interiorSteps) * (east - west);
    for (let yStep = 1; yStep < interiorSteps; yStep++) {
      const lat = south + (yStep / interiorSteps) * (north - south);
      tryProject(lon, lat);
    }
  }

  return xs.length === 0
    ? null
    : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function projectionPresetEntryToBbox(entry: ProjectionPresetEntry): BBoxTuple {
  return [
    entry.bounds[0][0],
    entry.bounds[0][1],
    entry.bounds[1][0],
    entry.bounds[1][1]
  ];
}

function unionBboxes(bboxes: BBoxTuple[]): BBoxTuple | null {
  if (bboxes.length === 0) {
    return null;
  }

  return [
    Math.min(...bboxes.map((bbox) => bbox[0])),
    Math.min(...bboxes.map((bbox) => bbox[1])),
    Math.max(...bboxes.map((bbox) => bbox[2])),
    Math.max(...bboxes.map((bbox) => bbox[3]))
  ];
}

function computeCompositeProjectedBbox(
  projection: ProjectionLike,
  metadata: BasemapMetadata,
  projectionPresets: ProjectionPresets | null
): BBoxTuple | null {
  const presetId = metadata.proj_to?.preset;
  if (!presetId || !projectionPresets) {
    return null;
  }

  const preset = projectionPresets[presetId];
  if (!preset?.entries?.length) {
    return null;
  }

  const projectedEntryBboxes = preset.entries
    .map((entry) =>
      sampleProjectedBbox(projection, projectionPresetEntryToBbox(entry))
    )
    .filter((bbox): bbox is BBoxTuple => bbox !== null);

  return unionBboxes(projectedEntryBboxes);
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

  const newBatches = table.batches.map(
    (batch) => new RecordBatch(newSchema, batch.data)
  );
  const result = new ArrowTableImpl(newSchema, newBatches);
  normalizedTableCache.set(table, result);
  return result;
}

function isWithinBounds(lon: number, lat: number, bounds: GeoBounds): boolean {
  return (
    lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3]
  );
}

function hasCompositeSubProjections(
  projection: ProjectionLike
): projection is CompositeProjectionLike {
  return (
    typeof (projection as { getSubProjections?: unknown }).getSubProjections ===
    'function'
  );
}

function withGeographicBoundsRouting(
  projection: CompositeProjectionLike
): CompositeProjectionLike {
  let cachedSink: GeoStream | null = null;
  let cachedStream: GeoStream | null = null;

  const routed = ((coordinates: [number, number]) =>
    projection(coordinates)) as CompositeProjectionLike;

  routed.stream = (sink: GeoStream): GeoStream => {
    if (cachedSink === sink && cachedStream) {
      return cachedStream;
    }

    const entries = projection.getSubProjections();
    const streams = entries.map((entry) => entry.projection.stream(sink));

    let ringBuffers: [number, number][][] | null = null;

    cachedStream = {
      point(lon: number, lat: number): void {
        if (ringBuffers) {
          for (let index = 0; index < entries.length; index++) {
            if (isWithinBounds(lon, lat, entries[index].bounds)) {
              ringBuffers[index].push([lon, lat]);
            }
          }
        } else {
          for (let index = 0; index < entries.length; index++) {
            if (isWithinBounds(lon, lat, entries[index].bounds)) {
              streams[index].point(lon, lat);
            }
          }
        }
      },
      sphere(): void {
        for (const stream of streams) {
          stream.sphere?.();
        }
      },
      lineStart(): void {
        ringBuffers = entries.map(() => []);
      },
      lineEnd(): void {
        if (!ringBuffers) return;
        for (let index = 0; index < streams.length; index++) {
          const points = ringBuffers[index];
          if (points.length > 0) {
            streams[index].lineStart();
            for (const [lon, lat] of points) {
              streams[index].point(lon, lat);
            }
            streams[index].lineEnd();
          }
        }
        ringBuffers = null;
      },
      polygonStart(): void {
        for (const stream of streams) {
          stream.polygonStart();
        }
      },
      polygonEnd(): void {
        for (const stream of streams) {
          stream.polygonEnd();
        }
      }
    };
    cachedSink = sink;
    return cachedStream;
  };

  routed.getSubProjections = () => projection.getSubProjections();

  if (projection.getInsetBorders) {
    routed.getInsetBorders = () => projection.getInsetBorders?.() ?? [];
  }

  if (projection.invert) {
    routed.invert = (coordinates: [number, number]) =>
      projection.invert?.(coordinates) ?? null;
  }

  return routed;
}

const IDENTITY_OPTIONS: ParserOptions = {
  projection: geoIdentity(),
  capacityMultiplier: 1.0,
  rewind: false
};

const pathCache = new WeakMap<ArrowTable, BinaryPathData>();
const solidPolygonCache = new WeakMap<ArrowTable, BinaryPolygonData>();
const pointCache = new WeakMap<ArrowTable, BinaryPointData>();

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

function decodeWkbPointsAllBatches(
  table: ArrowTable,
  projection?: ProjectionLike
): BinaryPointData | null {
  const geomVector =
    table.getChild('geometry') ?? table.getChild('wkb_geometry');
  if (!geomVector) return null;

  const totalLength = table.numRows;
  const positions = new Float32Array(totalLength * 2);
  const featureIds = new Uint32Array(totalLength);
  const projectPoint = projection
    ? createProjectionPointSampler(projection)
    : null;
  let outIdx = 0;
  let featureId = 0;

  for (let b = 0; b < geomVector.data.length; b++) {
    const data = geomVector.data[b];
    const offsets = data.valueOffsets as Int32Array;
    const values = data.values as Uint8Array;
    const batchLen = data.length;

    for (let i = 0; i < batchLen; i++) {
      const start = offsets[i];
      const end = offsets[i + 1];

      if (end - start !== 21) return null;
      const base = values.byteOffset + start;
      const view = new DataView(values.buffer, base, 21);
      const le = view.getUint8(0) === 1;

      const type = view.getUint32(1, le);
      if (type !== 1) return null;
      const x = view.getFloat64(5, le);
      const y = view.getFloat64(13, le);
      const position = projectPoint ? projectPoint([x, y]) : [x, y];
      if (!position) {
        featureId++;
        continue;
      }
      positions[outIdx * 2] = position[0];
      positions[outIdx * 2 + 1] = position[1];
      featureIds[outIdx] = featureId;
      outIdx++;
      featureId++;
    }
  }

  return { length: outIdx, positions, featureIds, size: 2 };
}

function parsePointsAllBatches(
  table: ArrowTable,
  options: ParserOptions
): BinaryPointData {
  const normalized = normalizeGeomColumnName(table);

  const isIdentityProjection =
    !options.projection || options.projection === IDENTITY_OPTIONS.projection;
  if (normalized.batches.length > 0) {
    const direct = decodeWkbPointsAllBatches(
      normalized,
      isIdentityProjection ? undefined : options.projection
    );
    if (direct) return direct;
  }

  return parsePoints(normalized, options);
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
    const projection = buildCompositeProjection({
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

    return hasCompositeSubProjections(projection)
      ? withGeographicBoundsRouting(projection)
      : projection;
  } catch (error) {
    logger.warn(
      'Failed to build composite projection, falling back to identity',
      LogCategory.MAP,
      { preset: presetId, error }
    );
    return null;
  }
}

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

export function computeProjectedBboxForBasemap(
  metadata: BasemapMetadata,
  projectionPresets: ProjectionPresets | null,
  width = 960,
  height = 600,

  overrideBbox?: BBoxTuple
): BBoxTuple | null {
  const projTo = metadata.proj_to;
  if (!projTo || projTo.type === 'identity') return null;

  const wgs84Bbox = overrideBbox ?? metadata.bbox;
  if (!wgs84Bbox) return null;

  const cacheKey = `${width}x${height}:${overrideBbox ? 'override' : 'auto'}:${wgs84Bbox.join(',')}`;
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
  const result =
    !overrideBbox && projTo.type === 'composite'
      ? (computeCompositeProjectedBbox(
          projection,
          metadata,
          projectionPresets
        ) ?? sampleProjectedBbox(projection, wgs84Bbox))
      : sampleProjectedBbox(projection, wgs84Bbox);

  if (!metadataCache) {
    metadataCache = new Map();
    projectedBboxCache.set(metadata, metadataCache);
  }
  metadataCache.set(cacheKey, result);

  return result;
}

export function computeProjectedBboxForProjection(
  projection: ProjectionLike,
  bbox: BBoxTuple
): BBoxTuple | null {
  return sampleProjectedBbox(projection, bbox);
}

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
  return { value: colors, size: 4, normalized: true };
}

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

export function columnAccessor<T>(
  table: ArrowTable,
  columnName: string,
  transform: (value: unknown) => T
): (featureId: number) => T {
  const vector = table.getChild(columnName);
  if (!vector) return () => transform(undefined);
  return (featureId: number): T => transform(vector.get(featureId));
}

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

export function pointPositions(data: BinaryPointData): Float64Array {
  const result = new Float64Array(data.length * 2);
  for (let i = 0; i < data.length * 2; i++) {
    result[i] = data.positions[i];
  }
  return result;
}

export function projectGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  projection: ProjectionLike
): GeoJSON.FeatureCollection {
  const projectPoint = createProjectionPointSampler(projection);

  function projectPosition(
    coordinates: GeoJSON.Position
  ): GeoJSON.Position | null {
    const [lon, lat] = coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return null;
    }

    const projected = projectPoint([lon, lat]);
    if (!projected) {
      return null;
    }

    const [x, y] = projected;
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  }

  function projectRing(
    coordinates: GeoJSON.Position[],
    minimumLength: number
  ): GeoJSON.Position[] | null {
    const projected: GeoJSON.Position[] = [];

    for (const coordinate of coordinates) {
      const point = projectPosition(coordinate);
      if (!point) {
        return null;
      }
      projected.push(point);
    }

    return projected.length >= minimumLength ? projected : null;
  }

  function projectLineToSegments(
    coordinates: GeoJSON.Position[],
    minimumLength: number
  ): GeoJSON.Position[][] {
    const segments: GeoJSON.Position[][] = [];
    let current: GeoJSON.Position[] = [];

    for (const coordinate of coordinates) {
      const point = projectPosition(coordinate);
      if (point) {
        current.push(point);
      } else {
        if (current.length >= minimumLength) {
          segments.push(current);
        }
        current = [];
      }
    }

    if (current.length >= minimumLength) {
      segments.push(current);
    }

    return segments;
  }

  function projectGeometry(
    geometry: GeoJSON.Geometry | null
  ): GeoJSON.Geometry | null {
    if (!geometry) {
      return null;
    }

    switch (geometry.type) {
      case 'Point': {
        const coordinates = projectPosition(geometry.coordinates);
        return coordinates ? { ...geometry, coordinates } : null;
      }

      case 'MultiPoint': {
        const coordinates = projectRing(geometry.coordinates, 1);
        return coordinates ? { ...geometry, coordinates } : null;
      }

      case 'LineString': {
        const segments = projectLineToSegments(geometry.coordinates, 2);
        if (segments.length === 0) {
          return null;
        }
        if (segments.length === 1) {
          return { ...geometry, coordinates: segments[0] };
        }
        return { type: 'MultiLineString', coordinates: segments };
      }

      case 'MultiLineString': {
        const allSegments: GeoJSON.Position[][] = [];
        for (const line of geometry.coordinates) {
          allSegments.push(...projectLineToSegments(line, 2));
        }
        if (allSegments.length === 0) {
          return null;
        }
        if (allSegments.length === 1) {
          return { type: 'LineString', coordinates: allSegments[0] };
        }
        return { ...geometry, coordinates: allSegments };
      }

      case 'Polygon': {
        const coordinates: GeoJSON.Position[][] = [];
        for (const ring of geometry.coordinates) {
          const projectedRing = projectRing(ring, 4);
          if (!projectedRing) {
            return null;
          }
          coordinates.push(projectedRing);
        }
        return coordinates.length > 0 ? { ...geometry, coordinates } : null;
      }

      case 'MultiPolygon': {
        const coordinates: GeoJSON.Position[][][] = [];
        for (const polygon of geometry.coordinates) {
          const projectedPolygon: GeoJSON.Position[][] = [];
          for (const ring of polygon) {
            const projectedRing = projectRing(ring, 4);
            if (!projectedRing) {
              return null;
            }
            projectedPolygon.push(projectedRing);
          }
          if (projectedPolygon.length === 0) {
            return null;
          }
          coordinates.push(projectedPolygon);
        }
        return coordinates.length > 0 ? { ...geometry, coordinates } : null;
      }

      case 'GeometryCollection': {
        const geometries = geometry.geometries
          .map((child) => projectGeometry(child))
          .filter((child): child is GeoJSON.Geometry => child !== null);

        return geometries.length > 0 ? { ...geometry, geometries } : null;
      }

      default:
        return null;
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
