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
  parsePoints
} from '@ateliercartographie/geoarrow-deck-stream';
import type {
  BinaryPathData,
  BinaryPolygonData,
  BinaryPointData,
  DeckBinaryAttribute,
  ParserOptions,
  ProjectionLike
} from '@ateliercartographie/geoarrow-deck-stream';
import type { ProjectionSpec } from '@ateliercartographie/geoarrow-deck-stream/worker';
import { geoArea, geoStream, type GeoProjection, type GeoStream } from 'd3-geo';

import type {
  BasemapMetadata,
  ProjectionPreset,
  ProjectionPresetEntry,
  ProjectionPresets
} from '../types/basemap.types';
import {
  buildKhartisCompositeProjection,
  resolveSimpleProjection,
  KHARTIS_COMPOSITE_FACTORY,
  KHARTIS_PROJ4_FACTORY,
  type KhartisCompositeParams
} from './khartis-projection-factories.utils';
import {
  bumpWorkerParseVersion,
  getParseWorkerClient,
  ipcBytesForTable,
  trackWorkerParseVersion
} from './worker-parse.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  PERF_PHASE,
  perfMark,
  perfMeasure
} from '$lib/features/commons/utils/perf-marks.utils';

type BBoxTuple = [number, number, number, number];

const EXPECTED_GEOM_COL = 'geometry';
const normalizedTableCache = new WeakMap<ArrowTable, ArrowTable>();
const projectedBboxCache = new WeakMap<
  BasemapMetadata,
  Map<string, BBoxTuple | null>
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
const PROJECTED_BINARY_CACHE_LIMIT = 2;

function getCachedProjectedBinaryData<T>(
  cache: WeakMap<ArrowTable, Map<ProjectionLike, T>>,
  table: ArrowTable,
  projection: ProjectionLike
): T | null {
  const projectionMap = cache.get(table);
  if (!projectionMap) {
    return null;
  }

  if (!projectionMap.has(projection)) {
    return null;
  }

  const cached = projectionMap.get(projection) as T;
  projectionMap.delete(projection);
  projectionMap.set(projection, cached);
  return cached;
}

function setCachedProjectedBinaryData<T>(
  cache: WeakMap<ArrowTable, Map<ProjectionLike, T>>,
  table: ArrowTable,
  projection: ProjectionLike,
  data: T
): void {
  let projectionMap = cache.get(table);
  if (!projectionMap) {
    projectionMap = new Map();
    cache.set(table, projectionMap);
  }

  projectionMap.delete(projection);
  projectionMap.set(projection, data);

  while (projectionMap.size > PROJECTED_BINARY_CACHE_LIMIT) {
    const oldestProjection = projectionMap.keys().next().value;
    if (oldestProjection === undefined) {
      break;
    }
    projectionMap.delete(oldestProjection);
  }
}

const projectionSpecs = new WeakMap<ProjectionLike, ProjectionSpec>();

export function registerProjectionSpec<T extends ProjectionLike>(
  projection: T,
  spec: ProjectionSpec
): T {
  projectionSpecs.set(projection, spec);
  return projection;
}

export function getProjectionSpec(
  projection: ProjectionLike
): ProjectionSpec | null {
  return projectionSpecs.get(projection) ?? null;
}

registerProjectionSpec(IDENTITY_OPTIONS.projection, {
  projection: 'geoIdentity'
});

// Below this row count a synchronous parse costs a few milliseconds at most —
// cheaper than the worker round trip and it avoids an empty frame while the
// transferred buffers travel back.
const WORKER_PARSE_MIN_ROWS = 2000;

const EMPTY_PATH_DATA: BinaryPathData = {
  length: 0,
  positions: new Float32Array(0),
  startIndices: new Uint32Array([0]),
  featureIds: new Uint32Array(0),
  size: 2
};

const EMPTY_POLYGON_DATA: BinaryPolygonData = {
  length: 0,
  positions: new Float32Array(0),
  polygonIndices: new Uint32Array([0]),
  holeIndices: new Uint32Array(0),
  indices: new Uint32Array(0),
  featureIds: new Uint32Array(0),
  size: 2
};

const EMPTY_POINT_DATA: BinaryPointData = {
  length: 0,
  positions: new Float32Array(0),
  featureIds: new Uint32Array(0),
  size: 2
};

type WorkerParseMethod =
  'parseGeometry' | 'parsePolygonsToSolid' | 'parsePoints';

let workerKeyIdSeq = 0;
const workerKeyIds = new WeakMap<object, number>();
const workerPendingKeys = new Set<string>();
const workerFailedKeys = new Set<string>();

function workerKeyIdFor(reference: object): number {
  let id = workerKeyIds.get(reference);
  if (id === undefined) {
    id = ++workerKeyIdSeq;
    workerKeyIds.set(reference, id);
  }
  return id;
}

// Off-main-thread parse: on cache miss, posts the Arrow IPC bytes and the
// projection's serializable spec to the parse worker, returns an empty
// placeholder for this frame, and fills the projected cache when the worker
// responds (the version bump re-runs the reactive layer computation, which
// then hits the cache). Returns null when the worker path is unavailable —
// no registered spec, no Worker support, or a previous failure for this
// (table, projection) pair — and the caller must parse synchronously.
function requestWorkerParse<T>(
  method: WorkerParseMethod,
  table: ArrowTable,
  projection: ProjectionLike,
  placeholder: T,
  storeResult: (data: T) => void,
  options: { rewind: boolean } = { rewind: true }
): T | null {
  if (table.numRows < WORKER_PARSE_MIN_ROWS) {
    return null;
  }
  const spec = getProjectionSpec(projection);
  if (!spec) {
    return null;
  }
  const client = getParseWorkerClient();
  if (!client) {
    return null;
  }

  const key = `${method}:${workerKeyIdFor(table)}:${workerKeyIdFor(projection)}`;
  if (workerFailedKeys.has(key)) {
    return null;
  }

  trackWorkerParseVersion();

  if (!workerPendingKeys.has(key)) {
    workerPendingKeys.add(key);
    const ipcBytes = ipcBytesForTable(normalizeGeomColumnName(table));
    client[method](ipcBytes, spec, {
      capacityMultiplier: 1.0,
      rewind: options.rewind
    })
      .then((data) => {
        storeResult(data as T);
      })
      .catch((error: unknown) => {
        workerFailedKeys.add(key);
        logger.error(
          `Worker parse failed (${method}); falling back to main-thread parsing`,
          LogCategory.MAP,
          error
        );
      })
      .finally(() => {
        workerPendingKeys.delete(key);
        bumpWorkerParseVersion();
      });
  }

  return placeholder;
}

export function parsePaths(table: ArrowTable): BinaryPathData {
  let result = pathCache.get(table);
  if (!result) {
    const viaWorker = requestWorkerParse(
      'parseGeometry',
      table,
      IDENTITY_OPTIONS.projection,
      EMPTY_PATH_DATA,
      (data) => pathCache.set(table, data),
      { rewind: false }
    );
    if (viaWorker) {
      return viaWorker;
    }
    result = parseGeometry(normalizeGeomColumnName(table), IDENTITY_OPTIONS);
    pathCache.set(table, result);
  }
  return result;
}

export function parseSolidPolygons(table: ArrowTable): BinaryPolygonData {
  let result = solidPolygonCache.get(table);
  if (!result) {
    const viaWorker = requestWorkerParse(
      'parsePolygonsToSolid',
      table,
      IDENTITY_OPTIONS.projection,
      EMPTY_POLYGON_DATA,
      (data) => solidPolygonCache.set(table, data),
      { rewind: false }
    );
    if (viaWorker) {
      return viaWorker;
    }
    result = parsePolygonsToSolid(
      normalizeGeomColumnName(table),
      IDENTITY_OPTIONS
    );
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
    const normalized = normalizeGeomColumnName(table);
    // The direct WKB point decode is a flat byte scan — cheaper than any
    // worker round trip, so it stays synchronous.
    if (normalized.batches.length > 0) {
      const direct = decodeWkbPointsAllBatches(normalized);
      if (direct) {
        pointCache.set(table, direct);
        return direct;
      }
    }
    const viaWorker = requestWorkerParse(
      'parsePoints',
      table,
      IDENTITY_OPTIONS.projection,
      EMPTY_POINT_DATA,
      (data) => pointCache.set(table, data),
      { rewind: false }
    );
    if (viaWorker) {
      return viaWorker;
    }
    result = parsePoints(normalized, IDENTITY_OPTIONS);
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
    return registerProjectionSpec(geoIdentity(), { projection: 'geoIdentity' });
  }

  if (projTo.type === 'simple' && projTo.proj4) {
    try {
      return registerProjectionSpec(resolveSimpleProjection(projTo.proj4), {
        projection: KHARTIS_PROJ4_FACTORY,
        params: { proj4: projTo.proj4 }
      });
    } catch (error) {
      logger.error(
        'Failed to resolve simple basemap projection',
        LogCategory.MAP,
        error
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

  return geoIdentity();
}

type PresetLayout = ProjectionPresetEntry['layout'];

// The preset layouts are normalized to a design frame with a fixed
// width/height ratio (the IGN/Eurostat reference arrangement). Applying them
// to the raw canvas stretches the arrangement with the viewport: the mainland
// gets centered in an oversized cell while the insets stay pinned in absolute
// canvas coordinates, drifting away from it (the detached DOM-TOM arc on the
// France basemap). Letterboxing the design frame into the canvas keeps the
// authored arrangement at any viewport ratio.
function resolveCompositeLayoutTransform(
  preset: ProjectionPreset,
  width: number,
  height: number
): (layout: PresetLayout) => PresetLayout {
  const designAspect = preset.layoutAspect ?? deriveDesignAspect(preset);
  const canvasAspect = width / height;
  if (
    !Number.isFinite(designAspect) ||
    !Number.isFinite(canvasAspect) ||
    designAspect === null ||
    designAspect <= 0 ||
    canvasAspect <= 0
  ) {
    return (layout) => layout;
  }

  let boxWidth = 1;
  let boxHeight = 1;
  if (canvasAspect > designAspect) {
    boxWidth = designAspect / canvasAspect;
  } else {
    boxHeight = canvasAspect / designAspect;
  }
  const boxX = (1 - boxWidth) / 2;
  const boxY = (1 - boxHeight) / 2;

  return (layout) => ({
    x: boxX + layout.x * boxWidth,
    y: boxY + layout.y * boxHeight,
    width: layout.width * boxWidth,
    height: layout.height * boxHeight
  });
}

// Design ratio under which the mainland geometry exactly fills its layout
// cell — the arrangement the cells were authored around.
function deriveDesignAspect(preset: ProjectionPreset): number | null {
  const mainland =
    preset.entries.find((entry) => entry.id === 'mainland') ??
    preset.entries[0];
  const { layout } = mainland;
  if (!(layout.width > 0) || !(layout.height > 0)) {
    return null;
  }

  try {
    const projection = resolveSimpleProjection(mainland.proj4);
    const projected = sampleProjectedBbox(
      projection,
      projectionPresetEntryToBbox(mainland)
    );
    if (!projected) {
      return null;
    }
    const projectedWidth = projected[2] - projected[0];
    const projectedHeight = projected[3] - projected[1];
    if (!(projectedWidth > 0) || !(projectedHeight > 0)) {
      return null;
    }
    return (projectedWidth / projectedHeight) * (layout.height / layout.width);
  } catch {
    return null;
  }
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
    const transformLayout = resolveCompositeLayoutTransform(
      preset,
      width,
      height
    );
    const compositeParams: KhartisCompositeParams = {
      width,
      height,
      entries: preset.entries.map((entry) => ({
        id: entry.id,
        proj4: entry.proj4,
        bounds: [
          entry.bounds[0][0],
          entry.bounds[0][1],
          entry.bounds[1][0],
          entry.bounds[1][1]
        ],
        layout: transformLayout(entry.layout),
        scaleMultiplier: entry.scaleMultiplier
      }))
    };

    return registerProjectionSpec(
      buildKhartisCompositeProjection(compositeParams),
      { projection: KHARTIS_COMPOSITE_FACTORY, params: compositeParams }
    );
  } catch (error) {
    logger.error(
      'Failed to build composite basemap projection',
      LogCategory.MAP,
      error
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
  projection: ProjectionLike
): BinaryPolygonData {
  const cached = getCachedProjectedBinaryData(
    projSolidPolygonCache,
    table,
    projection
  );
  if (cached) {
    return cached;
  }

  const viaWorker = requestWorkerParse(
    'parsePolygonsToSolid',
    table,
    projection,
    EMPTY_POLYGON_DATA,
    (data) =>
      setCachedProjectedBinaryData(
        projSolidPolygonCache,
        table,
        projection,
        data
      )
  );
  if (viaWorker) {
    return viaWorker;
  }

  perfMark(PERF_PHASE.GEOARROW_PARSE);
  const result = parsePolygonsToSolid(normalizeGeomColumnName(table), {
    projection,
    capacityMultiplier: 1.0,
    rewind: true
  });
  setCachedProjectedBinaryData(
    projSolidPolygonCache,
    table,
    projection,
    result
  );
  perfMeasure(PERF_PHASE.GEOARROW_PARSE);
  return result;
}

export function parsePathsWithProjection(
  table: ArrowTable,
  projection: ProjectionLike
): BinaryPathData {
  const cached = getCachedProjectedBinaryData(projPathCache, table, projection);
  if (cached) {
    return cached;
  }

  const viaWorker = requestWorkerParse(
    'parseGeometry',
    table,
    projection,
    EMPTY_PATH_DATA,
    (data) =>
      setCachedProjectedBinaryData(projPathCache, table, projection, data)
  );
  if (viaWorker) {
    return viaWorker;
  }

  const result = parseGeometry(normalizeGeomColumnName(table), {
    projection,
    capacityMultiplier: 1.0,
    rewind: true
  });
  setCachedProjectedBinaryData(projPathCache, table, projection, result);
  return result;
}

export function parsePointDataWithProjection(
  table: ArrowTable,
  projection: ProjectionLike
): BinaryPointData {
  const cached = getCachedProjectedBinaryData(
    projPointCache,
    table,
    projection
  );
  if (cached) {
    return cached;
  }

  // The direct WKB point decode + point sampler is a flat scan — cheaper
  // than any worker round trip, so it stays synchronous.
  const normalized = normalizeGeomColumnName(table);
  if (normalized.batches.length > 0) {
    const direct = decodeWkbPointsAllBatches(normalized, projection);
    if (direct) {
      setCachedProjectedBinaryData(projPointCache, table, projection, direct);
      return direct;
    }
  }

  const viaWorker = requestWorkerParse(
    'parsePoints',
    table,
    projection,
    EMPTY_POINT_DATA,
    (data) =>
      setCachedProjectedBinaryData(projPointCache, table, projection, data)
  );
  if (viaWorker) {
    return viaWorker;
  }

  const result = parsePointsAllBatches(table, {
    projection,
    capacityMultiplier: 1.0,
    rewind: true
  });
  setCachedProjectedBinaryData(projPointCache, table, projection, result);
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

function signedRingArea(ring: GeoJSON.Position[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[i][0] - ring[j][0]) * (ring[i][1] + ring[j][1]);
  }
  return area / 2;
}

function ringContainsPoint(
  ring: GeoJSON.Position[],
  x: number,
  y: number
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

interface ClassifiedGeoJSONRing {
  ring: GeoJSON.Position[];
  area: number;
}

interface GeoJSONRingGroup {
  exterior: ClassifiedGeoJSONRing;
  holes: ClassifiedGeoJSONRing[];
}

// Same classification as the binary polygon sink: d3's clip stage emits
// rejoined rings in arbitrary order, so exteriors are the rings whose winding
// matches the bundle's net signed area, and each hole attaches to the
// smallest exterior containing one of its sampled vertices.
function groupBundleRings(rings: GeoJSON.Position[][]): GeoJSON.Position[][][] {
  const classified: ClassifiedGeoJSONRing[] = rings.map((ring) => ({
    ring,
    area: signedRingArea(ring)
  }));

  let netArea = 0;
  for (const entry of classified) {
    netArea += entry.area;
  }
  const refSign = Math.sign(netArea);
  if (refSign === 0) {
    return [];
  }

  const groups: GeoJSONRingGroup[] = [];
  const holes: ClassifiedGeoJSONRing[] = [];
  for (const entry of classified) {
    if (entry.area === 0) {
      continue;
    }
    if (Math.sign(entry.area) === refSign) {
      groups.push({ exterior: entry, holes: [] });
    } else {
      holes.push(entry);
    }
  }
  if (groups.length === 0) {
    return [];
  }

  for (const hole of holes) {
    const count = hole.ring.length;
    const samples = new Set([0, count >> 1, count >> 2]);
    let assigned: GeoJSONRingGroup | null = null;
    for (const sample of samples) {
      const [x, y] = hole.ring[sample];
      let best: GeoJSONRingGroup | null = null;
      for (const group of groups) {
        if (!ringContainsPoint(group.exterior.ring, x, y)) {
          continue;
        }
        if (
          !best ||
          Math.abs(group.exterior.area) < Math.abs(best.exterior.area)
        ) {
          best = group;
        }
      }
      if (best) {
        assigned = best;
        break;
      }
    }
    assigned?.holes.push(hole);
  }

  return groups.map((group) => [
    group.exterior.ring,
    ...group.holes.map((hole) => hole.ring)
  ]);
}

interface GeoJSONStreamCollector {
  collector: GeoStream;
  points: GeoJSON.Position[];
  lines: GeoJSON.Position[][];
  bundles: GeoJSON.Position[][][];
}

function createGeoJSONCollector(): GeoJSONStreamCollector {
  const points: GeoJSON.Position[] = [];
  const lines: GeoJSON.Position[][] = [];
  const bundles: GeoJSON.Position[][][] = [];
  let currentLine: GeoJSON.Position[] | null = null;
  let currentBundle: GeoJSON.Position[][] | null = null;

  const collector: GeoStream = {
    point(x: number, y: number): void {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      if (currentLine) {
        currentLine.push([x, y]);
      } else {
        points.push([x, y]);
      }
    },
    lineStart(): void {
      currentLine = [];
    },
    lineEnd(): void {
      if (!currentLine) {
        return;
      }
      if (currentBundle) {
        // d3 emits polygon rings without the closing duplicate; GeoJSON
        // requires closed rings.
        if (currentLine.length >= 3) {
          currentLine.push([...currentLine[0]]);
          currentBundle.push(currentLine);
        }
      } else if (currentLine.length >= 2) {
        lines.push(currentLine);
      }
      currentLine = null;
    },
    polygonStart(): void {
      currentBundle = [];
    },
    polygonEnd(): void {
      if (currentBundle && currentBundle.length > 0) {
        bundles.push(currentBundle);
      }
      currentBundle = null;
    },
    sphere(): void {}
  };

  return { collector, points, lines, bundles };
}

// d3's spherical clipping reads ring winding: a ring whose spherical area
// exceeds a hemisphere is "everything but the ring". Exteriors must stay
// below 2π and holes above, or clipped output covers the whole map.
function rewindRingForStream(
  ring: GeoJSON.Position[],
  isExterior: boolean
): GeoJSON.Position[] {
  const area = geoArea({ type: 'Polygon', coordinates: [ring] });
  const isSmall = area <= 2 * Math.PI;
  return isSmall === isExterior ? ring : [...ring].reverse();
}

function rewindGeometryForStream(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring, index) =>
        rewindRingForStream(ring, index === 0)
      )
    };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring, index) => rewindRingForStream(ring, index === 0))
      )
    };
  }
  return geometry;
}

function projectGeometryViaStream(
  geometry: GeoJSON.Geometry | null,
  projection: ProjectionLike
): GeoJSON.Geometry | null {
  if (!geometry) {
    return null;
  }

  if (geometry.type === 'GeometryCollection') {
    const geometries = geometry.geometries
      .map((child) => projectGeometryViaStream(child, projection))
      .filter((child): child is GeoJSON.Geometry => child !== null);
    return geometries.length > 0 ? { ...geometry, geometries } : null;
  }

  const { collector, points, lines, bundles } = createGeoJSONCollector();
  const projectionStream = (projection as GeoProjection).stream(collector);
  geoStream(rewindGeometryForStream(geometry), projectionStream);

  switch (geometry.type) {
    case 'Point':
      return points.length > 0
        ? { type: 'Point', coordinates: points[0] }
        : null;

    case 'MultiPoint':
      return points.length > 0
        ? { type: 'MultiPoint', coordinates: points }
        : null;

    case 'LineString':
    case 'MultiLineString': {
      if (lines.length === 0) {
        return null;
      }
      return lines.length === 1
        ? { type: 'LineString', coordinates: lines[0] }
        : { type: 'MultiLineString', coordinates: lines };
    }

    case 'Polygon':
    case 'MultiPolygon': {
      const polygons: GeoJSON.Position[][][] = [];
      for (const bundle of bundles) {
        polygons.push(...groupBundleRings(bundle));
      }
      return polygons.length > 0
        ? { type: 'MultiPolygon', coordinates: polygons }
        : null;
    }

    default:
      return null;
  }
}

export function projectGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  projection: ProjectionLike
): GeoJSON.FeatureCollection {
  // The d3 stream applies antimeridian/polar clipping and adaptive
  // resampling; sampling point-by-point instead draws full-width bands for
  // any geometry crossing the rotated antimeridian.
  if (typeof (projection as Partial<GeoProjection>).stream !== 'function') {
    return projectGeoJSONByPointSampling(geojson, projection);
  }

  return {
    ...geojson,
    features: geojson.features
      .map((f) => {
        const geometry = projectGeometryViaStream(f.geometry, projection);
        return geometry ? ({ ...f, geometry } as GeoJSON.Feature) : null;
      })
      .filter((f): f is GeoJSON.Feature => f !== null)
  };
}

function projectGeoJSONByPointSampling(
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
