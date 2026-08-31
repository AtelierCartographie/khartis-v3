import {
  BASEMAP_LAYER_ID,
  type BasemapLayerId
} from '$lib/features/map/stores/basemap-layers.store.svelte';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import type {
  BasemapLayer,
  BasemapMetadata
} from '$lib/features/map/types/basemap.types';
import {
  PrimitiveFilterType,
  type PrimitiveFilter
} from '$lib/features/commons/stores/visualization.store.svelte';
import { DeckLayerId } from '$lib/features/map/constants/map.constants';

/**
 * Panel row id helpers — the single source of truth for the ids that key the
 * flat layer order. Both the layer panel (`layers.store`) and the GPU render
 * mapping (`use-map-layers` / `applyPanelRenderOrder`) build ids through these
 * so a row and the deck layers it owns always resolve to the same key.
 */
export const VISUALIZATION_SUBLAYER_SEPARATOR = '::';
export const GLOBAL_BASEMAP_LAYER_PREFIX = 'basemap';
export const TILED_BASEMAP_LAYER_SEPARATOR = 'tiled-basemap::';

export function buildVisualizationSubLayerId(
  visualizationId: string,
  primitive: PrimitiveFilter
): string {
  return `${visualizationId}${VISUALIZATION_SUBLAYER_SEPARATOR}${primitive}`;
}

// Basemap auxiliary layers are deduplicated globally in the flattened panel: a
// single row drives the one shared GPU basemap stack, so its id carries no
// per-visualization prefix.
export function buildBasemapSubLayerId(basemapLayerKey: string): string {
  return `${GLOBAL_BASEMAP_LAYER_PREFIX}${VISUALIZATION_SUBLAYER_SEPARATOR}${basemapLayerKey}`;
}

export function buildTiledBasemapLayerId(layerId: string): string {
  return `${TILED_BASEMAP_LAYER_SEPARATOR}${layerId}`;
}

/**
 * The panel primitive a thematic deck layer belongs to, derived from its id
 * prefix (`createLayerId`). Both text overlays — `text-layer` and `label-layer`
 * — resolve to the TEXT row; the geometry layers resolve to their own
 * primitive. Returns null for ids that carry no primitive (notably the GeoJSON
 * fallback), letting the render keep such a layer glued to its neighbour rather
 * than forcing it onto a row it doesn't own. This is the render-side twin of
 * `buildVisualizationSubLayerId`: the panel builds row ids from (viz, primitive)
 * and the render maps each deck layer back to one through this classifier.
 */
export function classifyThematicLayerPrimitive(
  layerId: string
): PrimitiveFilter | null {
  if (
    layerId.startsWith(DeckLayerId.TEXT_LAYER) ||
    layerId.startsWith(DeckLayerId.LABEL_LAYER)
  ) {
    return PrimitiveFilterType.TEXT;
  }
  if (layerId.startsWith(DeckLayerId.POINT_LAYER)) {
    return PrimitiveFilterType.POINT;
  }
  if (layerId.startsWith(DeckLayerId.LINE_LAYER)) {
    return PrimitiveFilterType.LINE;
  }
  if (layerId.startsWith(DeckLayerId.POLYGON_LAYER)) {
    return PrimitiveFilterType.POLYGON;
  }
  return null;
}

// LIMIT and LAND metadata layers get one panel row per file (key); every other
// metadata type collapses onto the row of its mapped basemap layer id.
export function isPerKeyAuxLayerType(
  type: BasemapLayerType | undefined
): boolean {
  return type === BasemapLayerType.LIMIT || type === BasemapLayerType.LAND;
}

export function isBasemapLayersToolRenderableType(
  type: BasemapLayerType
): boolean {
  return (
    type !== BasemapLayerType.CENTROID &&
    type !== BasemapLayerType.GEOGRAPHIC_LINES
  );
}

export function getCustomBaseLayerType(
  metadata: BasemapMetadata
): BasemapLayerType | undefined {
  return metadata.layers.find(
    (layer) =>
      layer.type === BasemapLayerType.POLYGON ||
      layer.type === BasemapLayerType.LINE ||
      layer.type === BasemapLayerType.POINT
  )?.type;
}

export function mapMetadataLayerTypeToBasemapLayerId(
  type: BasemapLayerType,
  isCustom: boolean,
  isCustomLine: boolean
): BasemapLayerId | null {
  switch (type) {
    case BasemapLayerType.LAND:
      return isCustomLine ? null : BASEMAP_LAYER_ID.TERRE;
    case BasemapLayerType.LIMIT:
      return BASEMAP_LAYER_ID.FRONTIERES;
    case BasemapLayerType.CENTROID:
    case BasemapLayerType.POINT:
      return isCustom ? null : BASEMAP_LAYER_ID.VILLES;
    case BasemapLayerType.GRATICULE:
      return BASEMAP_LAYER_ID.MERIDIENS;
    case BasemapLayerType.GEOGRAPHIC_LINES:
      return BASEMAP_LAYER_ID.MERIDIENS;
    case BasemapLayerType.POLYGON:
      return isCustom ? BASEMAP_LAYER_ID.TERRE : BASEMAP_LAYER_ID.MERS;
    case BasemapLayerType.LINE:
      return isCustom ? BASEMAP_LAYER_ID.FRONTIERES : BASEMAP_LAYER_ID.RIVIERES;
    case BasemapLayerType.SPHERE:
      return BASEMAP_LAYER_ID.SPHERE;
    default:
      return null;
  }
}

/** The aux-store key a metadata layer is filed under (matches the panel). */
export function resolveMetadataLayerKey(
  layer: Pick<BasemapLayer, 'file' | 'type'>,
  metadataFile: string
): string {
  return layer.file ?? `${metadataFile}:${layer.type}`;
}

/**
 * A row in the flat layer order. Both the layer panel (`layers.store`) and the
 * GPU render mapping (`use-map-layers`) describe their rows with this shape so
 * the default stacking and merge below produce a consistent order from either
 * side, even though the panel sees all rows and the render only the live ones.
 */
export interface LayerOrderRow {
  id: string;
  kind?: string;
  primitive?: PrimitiveFilter;
  parentId?: string;
  basemapRenderGroup?: 'foreground' | 'background';
  basemapRenderBelowThematic?: boolean;
}

/**
 * Canonical default stacking, top(front)→bottom(back): markers
 * (Text→Symbol→Line) over the foreground-below basemap (Sphère, Frontières…)
 * over polygon fills over the background fills (Terre, Mers). Within each
 * primitive band a more recently created visualization sits in front, so a
 * freshly added viz reads on top by default. `vizFrontToBackIds` is the
 * visualization array (creation order); its last entry is the newest/front.
 */
export function computeDefaultLayerOrder(
  rows: readonly LayerOrderRow[],
  vizFrontToBackIds: readonly string[]
): string[] {
  const vizFrontRank = (vizId: string | undefined): number => {
    if (!vizId) return Number.MAX_SAFE_INTEGER;
    const index = vizFrontToBackIds.indexOf(vizId);
    return index === -1
      ? Number.MAX_SAFE_INTEGER
      : vizFrontToBackIds.length - 1 - index;
  };

  const vizRows = rows.filter((row) => row.kind === 'viz-primitive');
  const basemapRows = rows.filter((row) => row.kind !== 'viz-primitive');

  const primitiveBand = (primitive: PrimitiveFilter): LayerOrderRow[] =>
    vizRows
      .filter((row) => row.primitive === primitive)
      .sort((a, b) => vizFrontRank(a.parentId) - vizFrontRank(b.parentId));

  const markerBands = [
    PrimitiveFilterType.TEXT,
    PrimitiveFilterType.POINT,
    PrimitiveFilterType.LINE
  ].flatMap((primitive) => primitiveBand(primitive));
  const polygonBand = primitiveBand(PrimitiveFilterType.POLYGON);

  // Basemap rows keep their incoming (display-order) sequence within a bucket;
  // only the bucket placement relative to the thematic bands matters here.
  const foregroundAbove = basemapRows.filter(
    (row) =>
      row.basemapRenderGroup === 'foreground' && !row.basemapRenderBelowThematic
  );
  const foregroundBelow = basemapRows.filter(
    (row) =>
      row.basemapRenderGroup === 'foreground' && row.basemapRenderBelowThematic
  );
  const background = basemapRows.filter(
    (row) => row.basemapRenderGroup !== 'foreground'
  );

  return [
    ...foregroundAbove,
    ...markerBands,
    ...foregroundBelow,
    ...polygonBand,
    ...background
  ].map((row) => row.id);
}

/**
 * Projects the live rows onto the persisted flat order: honour the persisted
 * positions, drop ids whose rows no longer exist, and splice rows the order has
 * never seen in at their `computeDefaultLayerOrder` slot (before the first
 * already-placed row with a deeper default rank). Deterministic.
 */
export function mergeLayerOrder(
  rows: readonly LayerOrderRow[],
  persisted: readonly string[],
  vizFrontToBackIds: readonly string[]
): string[] {
  const liveIds = new Set(rows.map((row) => row.id));
  const kept = persisted.filter((id) => liveIds.has(id));
  const keptSet = new Set(kept);

  const defaultOrder = computeDefaultLayerOrder(rows, vizFrontToBackIds);
  const defaultRank = new Map(defaultOrder.map((id, index) => [id, index]));
  const rankOf = (id: string): number =>
    defaultRank.get(id) ?? Number.MAX_SAFE_INTEGER;

  const result = [...kept];
  for (const id of defaultOrder) {
    if (keptSet.has(id)) continue;
    const myRank = rankOf(id);
    let insertAt = result.length;
    for (let i = 0; i < result.length; i += 1) {
      if (rankOf(result[i]) > myRank) {
        insertAt = i;
        break;
      }
    }
    result.splice(insertAt, 0, id);
  }
  return result;
}
