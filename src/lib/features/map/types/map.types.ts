import type { Layer } from '@deck.gl/core';
import type { Matrix4 } from '@math.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import type {
  PrimitiveFilter,
  VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';

export type {
  PickingInfo,
  ViewStateChangeParameters,
  OrthographicViewState
} from '@deck.gl/core';

export type DeckDataRow = Record<string, unknown>;

export type ThematicLayer = Layer<DeckDataRow>;

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

export interface LayerContext {
  viz: VisualizationConfig | null;
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

  highlightVersion?: number;

  modelMatrix?: Matrix4 | null;
  pageDisplayScale?: number;
  projectionSuffix?: string;
  beforeId?: string;

  geometryInfo?: GeometryInfo;

  representativePointTable?: ArrowTable;

  representativePointGeometryInfo?: GeometryInfo;

  textRepresentativePointTable?: ArrowTable;

  textRepresentativePointGeometryInfo?: GeometryInfo;

  textPointTable?: ArrowTable;

  customProjection?: ProjectionLike;

  primitiveOrder?: PrimitiveFilter[];
  densityTable?: ArrowTable;
  densityGeometryInfo?: GeometryInfo;

  splitDatasetTable?: ArrowTable;

  splitFeatureIdColumn?: string;
}

export type BBox = [number, number, number, number];

export interface CanvasSize {
  width: number;
  height: number;
}
