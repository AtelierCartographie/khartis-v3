import type { Matrix4 } from '@math.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import type { ProjectionLike } from 'geoarrow-deck-stream';

export type {
  PickingInfo,
  ViewStateChangeParameters,
  OrthographicViewState
} from '@deck.gl/core';

export type {
  BasemapLayer,
  BasemapMetadata,
  BasemapSuggestion,
  JoinEntity,
  JoinQuality
} from './types/basemap.types';

export type DeckDataRow = Record<string, unknown>;

export type ThematicLayer = import('@deck.gl/core').Layer<DeckDataRow>;

export interface GeometryInfo {
  type: string;
  encoding: string | null;
  geoColumn: string;
  isNativeGeoArrow: boolean;
  isWkbEncoded: boolean;
  isGeoJsonEncoded: boolean;
}

export type RGBColor = [number, number, number];

export interface TooltipEntry {
  key: string;
  value: string;
}

export interface OrthographicMainViewState {
  target: [number, number, number];
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
}

export interface DeckOrthographicViewStateMap {
  main: OrthographicMainViewState;
}

export interface FacetSyncViewState {
  type: 'orthographic' | 'maplibre';
  target?: [number, number, number];
  center?: [number, number];
  zoom: number;
}

/**
 * Split rendering payload — pairs the basemap geometry Arrow (ref-stable across
 * datasets joined to the same basemap, fed to Deck via parseSolidPolygons) with
 * the dataset attributes Arrow that supplies values for the lookup accessors.
 *
 * `featureIdColumn` indicates the column in the geometry Arrow that resolves to
 * the dataset's `basemap_id` (`__feature_id__` for custom basemaps, `id` for
 * catalog ones). See issue #87.
 */
export interface SplitRenderingTable {
  geometry: ArrowTable;
  dataset: ArrowTable;
  featureIdColumn: string;
}

export interface DeckMapProps {
  tables: Map<string, ArrowTable>;
  densityTables?: Map<string, ArrowTable>;
  splitData?: Map<string, SplitRenderingTable>;
  geoJSONs: Map<string, FeatureCollection>;
  dataVersion?: number;
  width: number;
  height: number;
  logicalWidth?: number;
  logicalHeight?: number;
  displayScale?: number;
  onReady?: () => void;
  forcedVisualizationIds?: string[];
  onMoveSync?: (state: FacetSyncViewState) => void;
  syncViewState?: FacetSyncViewState | null;
  showLegendOverlay?: boolean;
  showGeoIndicationsOverlay?: boolean;
  showAnnotationOverlay?: boolean;
  isFacetCell?: boolean;
}

export interface YearFilterInfo {
  column: string;
  value: number;
}

export interface LayerContext {
  viz:
    | import('$lib/features/commons/store/visualization.store.svelte').VisualizationConfig
    | null;
  datasetId: string | undefined;
  fillColor: RGBColor;
  symbolFillColor: RGBColor;
  strokeColor: RGBColor;
  fillOpacity: number;
  strokeWidth: number;
  strokeOpacity: number;
  statistics: { min: number; max: number };
  secondaryStatistics?: { min: number; max: number };
  categoryColorMap: Map<string, RGBColor> | null;
  pointStatistics?: { min: number; max: number };
  pointSecondaryStatistics?: { min: number; max: number };
  pointCategoryColorMap?: Map<string, RGBColor> | null;
  lineStatistics?: { min: number; max: number };
  lineCategoryColorMap?: Map<string, RGBColor> | null;
  polygonCategoryColorMap?: Map<string, RGBColor> | null;
  textStatistics?: { min: number; max: number };
  textCategoryColorMap?: Map<string, RGBColor> | null;
  highlightedRowIds?: Set<number>;
  /** Scalar version counter for highlight changes (avoids Set ref in updateTriggers) */
  highlightVersion?: number;
  /** Shared screen transform for Deck.gl OrthographicView layers */
  modelMatrix?: Matrix4 | null;
  projectionSuffix?: string;
  beforeId?: string;
  /** Pre-computed geometry info — avoids redundant extractGeometryInfo() calls */
  geometryInfo?: GeometryInfo;
  /** DuckDB-derived point geometry used for symbols/text on non-point features */
  representativePointTable?: ArrowTable;
  /** Geometry info for the representative point table */
  representativePointGeometryInfo?: GeometryInfo;
  /** GPU-side year filter via DataFilterExtension — avoids data prop changes on year switch */
  yearFilter?: YearFilterInfo;
  /** Cartographic projection applied before Deck.gl renders the geometry */
  customProjection?: ProjectionLike;
  /** Primitive sublayer render order (from viz store) */
  primitiveOrder?: import('$lib/features/commons/store/visualization.store.svelte').PrimitiveFilter[];
  densityTable?: ArrowTable;
  densityGeometryInfo?: GeometryInfo;
  /** Split rendering: dataset attributes Arrow paired with the basemap geometry. */
  splitDatasetTable?: ArrowTable;
  /** Split rendering: column in the geometry Arrow holding the stable feature id. */
  splitFeatureIdColumn?: string;
}

export type BBox = [number, number, number, number];

export interface CanvasSize {
  width: number;
  height: number;
}
