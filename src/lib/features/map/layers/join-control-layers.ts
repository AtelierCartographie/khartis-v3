import type { Layer } from '@deck.gl/core';
import {
  PathLayer,
  ScatterplotLayer,
  SolidPolygonLayer
} from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  type BinaryPathData,
  type BinaryPolygonData,
  createPathLayerProps,
  createPolygonFillColorAttribute
} from '@ateliercartographie/geoarrow-deck-stream';

import type {
  JoinTerritoryStatus,
  JoinTerritoryStatusRow
} from '$lib/features/duckdb';
import {
  INTERNAL_COLUMN,
  JOINED_BASEMAP_COLUMN
} from '$lib/features/commons/constants/data.constants';
import { resolveClassPatterns } from '$lib/features/commons/services/pattern-palette.service';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';

import {
  JOIN_CONTROL_FILL_COLORS,
  JOIN_CONTROL_MARKER_RADIUS_PX,
  JOIN_CONTROL_MARKER_STATUSES,
  JOIN_CONTROL_MARKER_STROKE_COLOR,
  JOIN_CONTROL_MARKER_STROKE_WIDTH_PX,
  JOIN_CONTROL_OUTLINE_COLOR,
  JOIN_CONTROL_OUTLINE_WIDTH_PX,
  JOIN_CONTROL_PATTERNS,
  JOIN_CONTROL_SMALL_TERRITORY_RATIO,
  JOIN_CONTROL_STATUSES
} from '../constants/join-control.constants';
import type {
  JoinControlCounts,
  JoinControlHoverTarget
} from '../stores/join-control.store.svelte';
import type { DeckDataRow, LayerContext } from '../types';
import {
  pathColorAttr,
  pathWidthAttr
} from '../utils/geoarrow-stream-bridge.utils';
import { createCompatibleSolidPolygonLayerProps } from '../utils/solid-polygon-layer-props.utils';
import { createFeatureOutlineOverlay } from './hover-highlight-overlay';
import { resolvePageDisplayScale } from './layer-style.utils';
import {
  HIGHLIGHT_POINT_RING_RADIUS,
  HIGHLIGHT_STROKE_COLOR,
  HIGHLIGHT_STROKE_WIDTH
} from './layer-selection-overlays';
import {
  resolvePathParser,
  resolvePolygonParser
} from './layer-geometry-parsers';
import {
  createBinaryPolygonPatternOverlayLayer,
  createClassPatternProps,
  type PolygonPatternProps,
  THEMATIC_OVERLAY_PARAMETERS,
  TRANSPARENT_POLYGON_PATTERN_FILL_COLOR
} from './polygon-pattern-layer.utils';

type Rgba = [number, number, number, number];

const NO_ROW = -1;
const DUPLICATE_PATTERN_OPACITY = 0.9;

export interface JoinControlTerritories {
  /** Index in `rows` of each geometry row's entity, NO_ROW when unknown. */
  rowIndexByGeomRow: Int32Array;
  statusByGeomRow: JoinTerritoryStatus[];
  counts: JoinControlCounts;
}

/** What the tooltip and the hover outline read from the join-control layers. */
export interface JoinControlPickData {
  rows: JoinTerritoryStatusRow[];
  territories: JoinControlTerritories;
  geometry: ArrowTable;
  featureIdColumn: string;
  /** The finalized table, one row per source row. */
  dataset: ArrowTable;
  geoColumn: string;
  /** The joined dataset is a geographic file rather than a table. */
  sourceIsFile: boolean;
}

export interface JoinControlLayerInput {
  layerId: string;
  geometry: ArrowTable;
  featureIdColumn: string;
  dataset: ArrowTable;
  geoColumn: string;
  sourceIsFile: boolean;
  rows: JoinTerritoryStatusRow[];
  /** A basemap without boundary layers leaves the territories unseparated. */
  outlineTerritories: boolean;
  ctx: Pick<
    LayerContext,
    'modelMatrix' | 'beforeId' | 'customProjection' | 'pageDisplayScale'
  >;
}

export interface JoinControlLayers {
  /** Drawn over the basemap land, under its boundaries and labels. */
  territoryLayers: Layer<DeckDataRow>[];
  /** Drawn on top, so a territory too small to see keeps a hover target. */
  markerLayers: Layer<DeckDataRow>[];
  counts: JoinControlCounts;
  /** What outlines the territories hovered in the join panel or the table. */
  hoverSource: JoinControlHoverSource | null;
}

export interface JoinControlHoverSource {
  fillLayerId: string;
  pickData: JoinControlPickData;
  polyData: BinaryPolygonData;
  placement: Record<string, unknown>;
}

const unjoinedRowsCache = new WeakMap<
  JoinTerritoryStatusRow[],
  JoinTerritoryStatusRow[]
>();

/** The same entities with no row joined: every one of them lacks data. */
export function toUnjoinedRows(
  rows: JoinTerritoryStatusRow[]
): JoinTerritoryStatusRow[] {
  let unjoined = unjoinedRowsCache.get(rows);
  if (!unjoined) {
    unjoined = rows.map((row) => ({
      ...row,
      status: 'no_data',
      rowCount: 0,
      dataValues: [],
      valueCount: 0
    }));
    unjoinedRowsCache.set(rows, unjoined);
  }
  return unjoined;
}

const territoriesCache = new WeakMap<
  ArrowTable,
  WeakMap<JoinTerritoryStatusRow[], Map<string, JoinControlTerritories>>
>();

export function resolveJoinControlTerritories(
  geometry: ArrowTable,
  featureIdColumn: string,
  rows: JoinTerritoryStatusRow[]
): JoinControlTerritories {
  let byRows = territoriesCache.get(geometry);
  if (!byRows) {
    byRows = new WeakMap();
    territoriesCache.set(geometry, byRows);
  }
  let byColumn = byRows.get(rows);
  if (!byColumn) {
    byColumn = new Map();
    byRows.set(rows, byColumn);
  }
  const cached = byColumn.get(featureIdColumn);
  if (cached) return cached;

  const rowIndexById = new Map<string, number>();
  rows.forEach((row, index) => rowIndexById.set(row.territoryId, index));

  const idVector = geometry.getChild(featureIdColumn);
  const rowIndexByGeomRow = new Int32Array(geometry.numRows).fill(NO_ROW);
  const statusByGeomRow: JoinTerritoryStatus[] = [];
  const counts = Object.fromEntries(
    JOIN_CONTROL_STATUSES.map((status) => [status, 0])
  ) as JoinControlCounts;

  for (let geomRow = 0; geomRow < geometry.numRows; geomRow += 1) {
    const id = idVector?.get(geomRow);
    const rowIndex =
      id === null || id === undefined
        ? undefined
        : rowIndexById.get(String(id));
    const status = rowIndex === undefined ? 'no_data' : rows[rowIndex].status;
    if (rowIndex !== undefined) rowIndexByGeomRow[geomRow] = rowIndex;
    statusByGeomRow.push(status);
    counts[status] += 1;
  }

  const territories = { rowIndexByGeomRow, statusByGeomRow, counts };
  byColumn.set(featureIdColumn, territories);
  return territories;
}

interface FeatureExtents {
  /** Bounding-box center of each feature, NaN when it has no vertex. */
  centers: Float64Array;
  /** Larger side of each feature's bounding box. */
  sizes: Float64Array;
  /** Larger side of the whole geometry's bounding box. */
  extent: number;
}

const extentsCache = new WeakMap<BinaryPolygonData, FeatureExtents>();

function resolveFeatureExtents(
  polyData: BinaryPolygonData,
  featureCount: number
): FeatureExtents {
  const cached = extentsCache.get(polyData);
  if (cached && cached.sizes.length === featureCount) return cached;

  const bounds = new Float64Array(featureCount * 4);
  for (let feature = 0; feature < featureCount; feature += 1) {
    bounds.set([Infinity, Infinity, -Infinity, -Infinity], feature * 4);
  }
  const { positions, polygonIndices, featureIds } = polyData;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let polygon = 0; polygon < polyData.length; polygon += 1) {
    const feature = featureIds[polygon];
    if (feature >= featureCount) continue;
    const offset = feature * 4;
    for (
      let vertex = polygonIndices[polygon];
      vertex < polygonIndices[polygon + 1];
      vertex += 1
    ) {
      const x = positions[vertex * 2];
      const y = positions[vertex * 2 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < bounds[offset]) bounds[offset] = x;
      if (y < bounds[offset + 1]) bounds[offset + 1] = y;
      if (x > bounds[offset + 2]) bounds[offset + 2] = x;
      if (y > bounds[offset + 3]) bounds[offset + 3] = y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const centers = new Float64Array(featureCount * 2).fill(Number.NaN);
  const sizes = new Float64Array(featureCount).fill(Number.NaN);
  for (let feature = 0; feature < featureCount; feature += 1) {
    const offset = feature * 4;
    if (!Number.isFinite(bounds[offset])) continue;
    centers[feature * 2] = (bounds[offset] + bounds[offset + 2]) / 2;
    centers[feature * 2 + 1] = (bounds[offset + 1] + bounds[offset + 3]) / 2;
    sizes[feature] = Math.max(
      bounds[offset + 2] - bounds[offset],
      bounds[offset + 3] - bounds[offset + 1]
    );
  }

  const extents = {
    centers,
    sizes,
    extent: Number.isFinite(minX) ? Math.max(maxX - minX, maxY - minY) : 0
  };
  extentsCache.set(polyData, extents);
  return extents;
}

const patternPropsCache = new Map<
  JoinTerritoryStatus,
  { props: PolygonPatternProps; color: Rgba } | null
>();

function resolveStatusPattern(
  status: JoinTerritoryStatus
): { props: PolygonPatternProps; color: Rgba } | null {
  if (patternPropsCache.has(status)) {
    return patternPropsCache.get(status) ?? null;
  }
  const config = JOIN_CONTROL_PATTERNS[status];
  const pattern = config
    ? resolveClassPatterns(1, config, 'sequential', config.contrast)[0]
    : undefined;
  const resolved = pattern
    ? {
        props: createClassPatternProps([pattern], 0),
        color: [...hexToRgb(pattern.fill), 255] as Rgba
      }
    : null;
  patternPropsCache.set(status, resolved);
  return resolved;
}

const FILL_COLORS = Object.fromEntries(
  JOIN_CONTROL_STATUSES.map((status) => [
    status,
    [...hexToRgb(JOIN_CONTROL_FILL_COLORS[status]), 255]
  ])
) as Record<JoinTerritoryStatus, Rgba>;

type BinaryLayerData = Record<string, unknown> & {
  length: number;
  attributes: Record<string, unknown>;
};

// Binary attributes are rebuilt only when the geometry or the statuses
// change: deck then compares the data by reference and skips the upload.
const layerDataCache = new WeakMap<
  object,
  WeakMap<JoinTerritoryStatusRow[], Map<string, BinaryLayerData>>
>();

function memoLayerData(
  source: object,
  rows: JoinTerritoryStatusRow[],
  key: string,
  build: () => BinaryLayerData
): BinaryLayerData {
  let byRows = layerDataCache.get(source);
  if (!byRows) {
    byRows = new WeakMap();
    layerDataCache.set(source, byRows);
  }
  let byKey = byRows.get(rows);
  if (!byKey) {
    byKey = new Map();
    byRows.set(rows, byKey);
  }
  let data = byKey.get(key);
  if (!data) {
    data = build();
    byKey.set(key, data);
  }
  return data;
}

function placementProps(
  ctx: JoinControlLayerInput['ctx']
): Record<string, unknown> {
  return {
    ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
    ...(ctx.beforeId && { beforeId: ctx.beforeId })
  };
}

function createOutlineLayer(
  id: string,
  pathData: BinaryPathData,
  rows: JoinTerritoryStatusRow[],
  key: string,
  ctx: JoinControlLayerInput['ctx']
): Layer<DeckDataRow> {
  const data = memoLayerData(pathData, rows, key, () => {
    const built = createPathLayerProps(pathData).data as BinaryLayerData;
    built.attributes.getColor = pathColorAttr(
      pathData,
      () => JOIN_CONTROL_OUTLINE_COLOR
    );
    built.attributes.getWidth = pathWidthAttr(
      pathData,
      () => JOIN_CONTROL_OUTLINE_WIDTH_PX
    );
    return built;
  });

  return new PathLayer({
    id,
    ...({ data } as Record<string, unknown>),
    _pathType: 'open',
    widthUnits: 'pixels',
    widthScale: resolvePageDisplayScale(ctx),
    widthMinPixels: 0,
    pickable: false,
    parameters: THEMATIC_OVERLAY_PARAMETERS,
    ...placementProps(ctx),
    dataComparator: (newData, oldData) => newData === oldData
  }) as Layer<DeckDataRow>;
}

export function createJoinControlLayers(
  input: JoinControlLayerInput
): JoinControlLayers {
  const {
    layerId,
    geometry,
    featureIdColumn,
    dataset,
    geoColumn,
    sourceIsFile,
    rows,
    outlineTerritories,
    ctx
  } = input;
  const pageScale = resolvePageDisplayScale(ctx);
  const territories = resolveJoinControlTerritories(
    geometry,
    featureIdColumn,
    rows
  );
  const polyData = resolvePolygonParser(ctx.customProjection)(geometry);
  if (polyData.length === 0) {
    return {
      territoryLayers: [],
      markerLayers: [],
      counts: territories.counts,
      hoverSource: null
    };
  }

  const { statusByGeomRow } = territories;
  const statusOf = (featureId: number): JoinTerritoryStatus =>
    statusByGeomRow[featureId] ?? 'no_data';
  const pickData: JoinControlPickData = {
    rows,
    territories,
    geometry,
    featureIdColumn,
    dataset,
    geoColumn,
    sourceIsFile
  };

  const fillData = memoLayerData(
    polyData,
    rows,
    `fill:${featureIdColumn}`,
    () => {
      const built = createCompatibleSolidPolygonLayerProps(polyData)
        .data as unknown as BinaryLayerData;
      built.attributes.getFillColor = createPolygonFillColorAttribute(
        polyData,
        (featureId) => FILL_COLORS[statusOf(featureId)]
      );
      built.featureIds = polyData.featureIds;
      built.khartisPickGeometry = polyData;
      return built;
    }
  );
  // Reused buffers still describe the latest finalized table.
  fillData.khartisJoinControl = pickData;

  const territoryLayers: Layer<DeckDataRow>[] = [
    new SolidPolygonLayer({
      id: `${layerId}-fill`,
      ...({ data: fillData } as Record<string, unknown>),
      _normalize: false,
      pickable: true,
      parameters: THEMATIC_OVERLAY_PARAMETERS,
      ...placementProps(ctx),
      dataComparator: (newData, oldData) => newData === oldData
    }) as Layer<DeckDataRow>
  ];

  for (const status of JOIN_CONTROL_STATUSES) {
    const pattern = resolveStatusPattern(status);
    if (!pattern || territories.counts[status] === 0) continue;
    // The motif keeps its size on the page as the page zooms.
    const props =
      pageScale === 1
        ? pattern.props
        : {
            ...pattern.props,
            getFillPatternScale: pattern.props.getFillPatternScale * pageScale
          };
    const overlay = createBinaryPolygonPatternOverlayLayer(
      layerId,
      status,
      polyData,
      props,
      ctx,
      (featureId) =>
        statusOf(featureId) === status
          ? pattern.color
          : TRANSPARENT_POLYGON_PATTERN_FILL_COLOR,
      `${status}-pattern`,
      status === 'duplicate' ? DUPLICATE_PATTERN_OPACITY : undefined
    );
    if (overlay) territoryLayers.push(overlay);
  }

  const pathData = outlineTerritories
    ? resolvePathParser(ctx.customProjection)(geometry)
    : null;
  if (pathData && pathData.length > 0) {
    territoryLayers.push(
      createOutlineLayer(
        `${layerId}-outline`,
        pathData,
        rows,
        `outline:${featureIdColumn}`,
        ctx
      )
    );
  }

  const markerLayers: Layer<DeckDataRow>[] = [];
  const extents = resolveFeatureExtents(polyData, geometry.numRows);
  const smallSize = extents.extent * JOIN_CONTROL_SMALL_TERRITORY_RATIO;
  for (const status of JOIN_CONTROL_MARKER_STATUSES) {
    if (territories.counts[status] === 0) continue;
    const markerData = memoLayerData(
      polyData,
      rows,
      `markers:${status}:${featureIdColumn}`,
      () => {
        const positions: number[] = [];
        const featureIds: number[] = [];
        for (let feature = 0; feature < statusByGeomRow.length; feature += 1) {
          if (statusByGeomRow[feature] !== status) continue;
          if (!(extents.sizes[feature] < smallSize)) continue;
          positions.push(
            extents.centers[feature * 2],
            extents.centers[feature * 2 + 1]
          );
          featureIds.push(feature);
        }
        return {
          length: featureIds.length,
          attributes: {
            getPosition: { value: new Float64Array(positions), size: 2 }
          },
          featureIds: new Uint32Array(featureIds),
          khartisPickGeometry: polyData
        };
      }
    );
    if (markerData.length === 0) continue;
    markerData.khartisJoinControl = pickData;

    markerLayers.push(
      new ScatterplotLayer({
        id: `${layerId}-${status}-markers`,
        ...({ data: markerData } as Record<string, unknown>),
        filled: true,
        stroked: true,
        radiusUnits: 'pixels',
        radiusScale: pageScale,
        getRadius: JOIN_CONTROL_MARKER_RADIUS_PX,
        lineWidthUnits: 'pixels',
        lineWidthScale: pageScale,
        getLineWidth: JOIN_CONTROL_MARKER_STROKE_WIDTH_PX,
        getFillColor: FILL_COLORS[status],
        getLineColor: JOIN_CONTROL_MARKER_STROKE_COLOR,
        pickable: true,
        parameters: THEMATIC_OVERLAY_PARAMETERS,
        ...placementProps(ctx),
        dataComparator: (newData, oldData) => newData === oldData
      }) as unknown as Layer<DeckDataRow>
    );
  }

  return {
    territoryLayers,
    markerLayers,
    counts: territories.counts,
    hoverSource: {
      fillLayerId: `${layerId}-fill`,
      pickData,
      polyData,
      placement: placementProps(ctx)
    }
  };
}

interface HoverLookup {
  geomRowsById: Map<string, number[]>;
  idsByValue: Map<string, Set<string>>;
  idByRowId: Map<number, string>;
}

const hoverLookupCache = new WeakMap<
  JoinTerritoryStatusRow[],
  WeakMap<ArrowTable, HoverLookup>
>();

function resolveHoverLookup(pickData: JoinControlPickData): HoverLookup {
  const { rows, geometry, featureIdColumn, dataset, geoColumn } = pickData;
  let byDataset = hoverLookupCache.get(rows);
  if (!byDataset) {
    byDataset = new WeakMap();
    hoverLookupCache.set(rows, byDataset);
  }
  const cached = byDataset.get(dataset);
  if (cached) return cached;

  const geomRowsById = new Map<string, number[]>();
  const geomIdVector = geometry.getChild(featureIdColumn);
  for (let geomRow = 0; geomRow < geometry.numRows; geomRow += 1) {
    const id = geomIdVector?.get(geomRow);
    if (id === null || id === undefined) continue;
    const key = String(id);
    const geomRows = geomRowsById.get(key);
    if (geomRows) geomRows.push(geomRow);
    else geomRowsById.set(key, [geomRow]);
  }

  const idsByValue = new Map<string, Set<string>>();
  const idByRowId = new Map<number, string>();
  const idVector = dataset.getChild(JOINED_BASEMAP_COLUMN.ID);
  const valueVector = dataset.getChild(geoColumn);
  const rowIdVector = dataset.getChild(INTERNAL_COLUMN.ID);
  for (let row = 0; row < dataset.numRows; row += 1) {
    const id = idVector?.get(row);
    if (id === null || id === undefined) continue;
    const key = String(id);
    const value = valueVector?.get(row);
    if (value !== null && value !== undefined) {
      const ids = idsByValue.get(String(value));
      if (ids) ids.add(key);
      else idsByValue.set(String(value), new Set([key]));
    }
    const rowId = rowIdVector?.get(row);
    if (rowId !== null && rowId !== undefined) {
      idByRowId.set(Number(rowId), key);
    }
  }

  const lookup = { geomRowsById, idsByValue, idByRowId };
  byDataset.set(dataset, lookup);
  return lookup;
}

/**
 * Outlines the territories joined by the hovered source values or rows; a
 * territory too small for its outline also gets a ring.
 */
export function createJoinControlHoverLayers(
  source: JoinControlHoverSource,
  target: JoinControlHoverTarget
): Layer<DeckDataRow>[] {
  const lookup = resolveHoverLookup(source.pickData);
  const ids = new Set<string>();
  for (const value of target.values ?? []) {
    for (const id of lookup.idsByValue.get(value) ?? []) ids.add(id);
  }
  for (const rowId of target.rowIds ?? []) {
    const id = lookup.idByRowId.get(rowId);
    if (id !== undefined) ids.add(id);
  }
  const geomRows = [...ids].flatMap((id) => lookup.geomRowsById.get(id) ?? []);
  if (geomRows.length === 0) return [];

  const layerId = `${source.fillLayerId}-hover`;
  const layers: Layer<DeckDataRow>[] = [];
  const outline = createFeatureOutlineOverlay(
    layerId,
    source.polyData,
    geomRows,
    source.placement
  );
  if (outline) layers.push(outline as Layer<DeckDataRow>);

  const extents = resolveFeatureExtents(
    source.polyData,
    source.pickData.geometry.numRows
  );
  const smallSize = extents.extent * JOIN_CONTROL_SMALL_TERRITORY_RATIO;
  const ringPositions = geomRows.flatMap((geomRow) =>
    extents.sizes[geomRow] < smallSize
      ? [extents.centers[geomRow * 2], extents.centers[geomRow * 2 + 1]]
      : []
  );
  if (ringPositions.length > 0) {
    layers.push(
      new ScatterplotLayer({
        id: `${layerId}-rings`,
        data: {
          length: ringPositions.length / 2,
          attributes: {
            getPosition: { value: new Float64Array(ringPositions), size: 2 }
          }
        },
        filled: false,
        stroked: true,
        radiusUnits: 'pixels',
        getRadius: HIGHLIGHT_POINT_RING_RADIUS,
        lineWidthUnits: 'pixels',
        getLineWidth: HIGHLIGHT_STROKE_WIDTH,
        getLineColor: HIGHLIGHT_STROKE_COLOR,
        pickable: false,
        parameters: THEMATIC_OVERLAY_PARAMETERS,
        ...source.placement
      }) as unknown as Layer<DeckDataRow>
    );
  }
  return layers;
}

export function readJoinControlPickData(
  layerData: unknown
): JoinControlPickData | null {
  if (typeof layerData !== 'object' || layerData === null) return null;
  const pickData = Reflect.get(layerData, 'khartisJoinControl');
  return typeof pickData === 'object' && pickData !== null
    ? (pickData as JoinControlPickData)
    : null;
}
