import type { Layer } from '@deck.gl/core';
import type { Matrix4 } from '@math.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import type {
  PrimitiveFilter,
  VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import type { JoinCategoryTone } from '$lib/features/commons/types/data-tab.types';
import type { ShapeType } from '$lib/features/commons/constants/visualization.constants';

export type DeckDataRow = Record<string, unknown>;

export type ThematicLayer = Layer<DeckDataRow>;

export interface GeometryInfo {
  type: string;
  encoding: string | null;
  geoColumn: string;
  isNativeGeoArrow: boolean;
  isWkbEncoded: boolean;
}

export type RGBColor = [number, number, number];

export interface TooltipColumn {
  label: string;
  value: string;
}

export interface TooltipGlyph {
  primitive: PrimitiveFilter;
  channel: 'color' | 'size' | 'stroke' | 'label';
  /** A symbol's shape, the hovered row's own when shapes follow categories. */
  shape?: ShapeType;
  /** The color the hovered row is drawn in, when this glyph carries it. */
  color?: string;
  /** The row's outline color, for a glyph drawn as an outline. */
  outline?: string;
}

export interface TooltipEntry {
  key: string;
  value: string;
  /** The column drives one of the hovered layer's visualizations. */
  isVizColumn?: boolean;
  /** How the variable is drawn: by which primitive, through which channel. */
  glyphs?: TooltipGlyph[];
  /** A heading's value drawn as a join category count. */
  tone?: JoinCategoryTone;
  /** The fields of a `columns` entry, side by side like a join table row. */
  columns?: TooltipColumn[];
  /**
   * A title (the entity, key, with an optional lighter name as value), a
   * heading (key in the accent color, then its value), a subtitle (the key
   * alone, muted), a divider, or fields side by side, instead of a key/value
   * row.
   */
  role?: 'title' | 'heading' | 'subtitle' | 'divider' | 'columns';
  /** Shown only once the inspector is pinned. */
  pinnedOnly?: boolean;
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

  customProjection?: ProjectionLike;
  /** Visible basemap land layers, whose outline labels keep clear of. */
  labelOutlineTables?: ArrowTable[];

  primitiveOrder?: PrimitiveFilter[];
  densityTable?: ArrowTable;
  densityGeometryInfo?: GeometryInfo;

  splitDatasetTable?: ArrowTable;

  splitFeatureIdColumn?: string;

  // Every primitive keeps its geometry under a filter so the missing-data
  // styling stays available to the user; these carry the rows each primitive
  // still has data for, and a feature left out of them reads as missing.
  // One visualization can filter its primitives differently, so a context is
  // narrowed to the primitive being drawn before its accessors are built.
  scopedDatasetTableByPrimitive?: Partial<Record<PrimitiveFilter, ArrowTable>>;

  scopedRowIdsByPrimitive?: Partial<Record<PrimitiveFilter, Set<number>>>;

  scopedPrimitive?: PrimitiveFilter;
}

export type BBox = [number, number, number, number];

export interface CanvasSize {
  width: number;
  height: number;
}
