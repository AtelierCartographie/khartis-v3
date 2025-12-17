import type { Color, Layer } from '@deck.gl/core';
import type { Matrix4 } from '@math.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import type { MapboxOverlay } from '@deck.gl/mapbox';

// Re-export basemap types for backwards compatibility
export type {
  BasemapAttribute,
  BasemapCatalog,
  BasemapLayer,
  BasemapMetadata,
  BasemapSuggestion,
  JoinEntity,
  JoinMapping,
  JoinQuality
} from './types/basemap.types';

// =============================================================================
// Core Map Types
// =============================================================================

export type DeckDataRow = Record<string, unknown>;

export interface MapState {
  isReady: boolean;
  isMapLoaded: boolean;
  center: [number, number];
  zoom: number;
  baseZoomLevel: number;
}

export interface MapPosition {
  center: { lng: number; lat: number };
  zoom: number;
}

// =============================================================================
// Layer Types
// =============================================================================

export type LayerType =
  | 'choropleth'
  | 'proportional'
  | 'categorical'
  | 'line'
  | 'point'
  | 'base';

export interface LayerConfig {
  id: string;
  type: LayerType;
  datasetId?: string;
  visible: boolean;
  opacity: number;
}

export interface ChoroplethLayerConfig extends LayerConfig {
  type: 'choropleth';
  valueColumn: string;
  breaks: number[];
  colors: string[];
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
}

export interface ProportionalLayerConfig extends LayerConfig {
  type: 'proportional';
  sizeColumn: string;
  minSize: number;
  maxSize: number;
  sizeScale: 'linear' | 'sqrt' | 'log';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

export interface CategoricalLayerConfig extends LayerConfig {
  type: 'categorical';
  categoryColumn: string;
  colors: string[];
}

export interface LineLayerConfig extends LayerConfig {
  type: 'line';
  lineColor: string;
  lineWidth: number;
  lineOpacity: number;
}

export interface PointLayerConfig extends LayerConfig {
  type: 'point';
  radius: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

export type SpecificLayerConfig =
  | ChoroplethLayerConfig
  | ProportionalLayerConfig
  | CategoricalLayerConfig
  | LineLayerConfig
  | PointLayerConfig;

// =============================================================================
// Geometry Types
// =============================================================================

export interface GeometryInfo {
  type: string;
  encoding: string | null;
  geoColumn: string;
  isNativeGeoArrow: boolean;
  isWkbEncoded: boolean;
  isGeoJsonEncoded: boolean;
}

export interface BoundsInfo {
  bounds: LngLatBoundsLike | null;
  source: 'geoarrow' | 'geojson' | 'manual';
}

export interface ParsedGeometry {
  type: GeoJSON.Geometry['type'];
  coordinates: unknown;
}

// =============================================================================
// Styling Types
// =============================================================================

export type RGBColor = [number, number, number];
export type RGBAColor = [number, number, number, number];

export interface ColorScale {
  domain: [number, number];
  range: string[];
  breaks: number[];
}

export interface SizeScale {
  domain: [number, number];
  range: [number, number];
  scale: 'linear' | 'sqrt' | 'log';
}

export interface StyleConfig {
  fillColor: RGBColor;
  strokeColor: RGBColor;
  fillOpacity: number;
  strokeOpacity: number;
  strokeWidth: number;
}

export interface MemoizedColors {
  fill: RGBColor;
  stroke: RGBColor;
}

export interface MemoizedStatistics {
  min: number;
  max: number;
}

// =============================================================================
// Tooltip Types
// =============================================================================

export interface TooltipEntry {
  key: string;
  value: string;
}

export interface TooltipData {
  entries: TooltipEntry[];
  x: number;
  y: number;
}

export interface TooltipStyle {
  backgroundColor: string;
  color: string;
  padding: string;
  borderRadius: string;
  fontSize: string;
  fontFamily: string;
  boxShadow: string;
  border: string;
  maxWidth: string;
}

export interface TooltipResult {
  html: string;
  style: TooltipStyle;
}

export interface DeckTooltipInfo {
  object?: unknown;
  index?: number;
  layer?: {
    id?: string;
    props?: {
      data?: ArrowTable | FeatureCollection;
    };
  } | null;
  picked?: boolean;
  x?: number;
  y?: number;
}

// =============================================================================
// Map Component Props
// =============================================================================

export interface DeckMapProps {
  jsTable: ArrowTable | null;
  userGeoJSON: FeatureCollection | null;
  datasetId?: string;
  onReady?: () => void;
}

// =============================================================================
// Map Instance Types
// =============================================================================

export interface MapInstances {
  map: MapLibreMap | null;
  deckOverlay: MapboxOverlay | null;
}

export interface MapLayerUpdate {
  layers: Layer<DeckDataRow>[];
  timestamp: number;
}

// =============================================================================
// Accessor Function Types
// =============================================================================

export type ColorAccessor = (object: DeckDataRow) => RGBColor;
export type SizeAccessor = (object: DeckDataRow) => number;
export type GeoJsonColorAccessor = (feature: {
  properties?: Record<string, unknown>;
}) => RGBColor | Color;
export type GeoJsonSizeAccessor = (feature: {
  properties?: Record<string, unknown>;
}) => number;

// =============================================================================
// Update Trigger Types
// =============================================================================

export interface LayerUpdateTriggers {
  getFillColor?: unknown[];
  getLineColor?: unknown[];
  getPointRadius?: unknown[];
  getRadius?: unknown[];
  getLineWidth?: unknown[];
}

// =============================================================================
// OSM Types
// =============================================================================

export interface OSMTileConfig {
  urlTemplate: string;
  attribution: string;
  minZoom: number;
  maxZoom: number;
  tileSize: number;
}

export interface OSMRasterSource {
  type: 'raster';
  tiles: string[];
  tileSize: number;
  attribution: string;
  minzoom: number;
  maxzoom: number;
}

export interface OSMRasterLayer {
  id: string;
  type: 'raster';
  source: string;
  paint: {
    'raster-opacity': number;
  };
}

// =============================================================================
// Factory Types
// =============================================================================

export interface CreateLayerOptions {
  table: ArrowTable;
  geoColumn: string;
  geometryInfo: GeometryInfo;
  style: StyleConfig;
  datasetId?: string;
}

export interface CreateChoroplethOptions extends CreateLayerOptions {
  valueColumn: string;
  breaks: number[];
  colors: string[];
}

export interface CreateProportionalOptions extends CreateLayerOptions {
  sizeColumn: string;
  minValue: number;
  maxValue: number;
  minSize: number;
  maxSize: number;
  sizeScale: 'linear' | 'sqrt' | 'log';
}

export interface CreateCategoricalOptions extends CreateLayerOptions {
  categoryColumn: string;
  colorMap: Map<string, RGBColor>;
}

// =============================================================================
// Layer Context (for layer creation)
// =============================================================================

export interface LayerContext {
  viz:
    | import('$lib/features/commons/store/visualization.store.svelte').VisualizationConfig
    | null;
  datasetId: string | undefined;
  fillColor: RGBColor;
  strokeColor: RGBColor;
  fillOpacity: number;
  strokeWidth: number;
  strokeOpacity: number;
  statistics: { min: number; max: number };
  categoryColorMap: Map<string, RGBColor> | null;
  modelMatrix?: Matrix4 | null;
}

// =============================================================================
// Projection Types
// =============================================================================

export type BBox = [number, number, number, number];

export interface ProjectionContext {
  modelMatrix: Matrix4 | null;
  isLocalCRS: boolean;
  bbox: BBox | null;
}

export interface CanvasSize {
  width: number;
  height: number;
}
