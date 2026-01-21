import type { Matrix4 } from '@math.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';

// Re-export Deck.gl types for proper typing
export type {
  PickingInfo,
  ViewStateChangeParameters,
  OrthographicViewState
} from '@deck.gl/core';

// TooltipContent type (matches @deck.gl/core internal type, not publicly exported)
export type TooltipContent =
  | null
  | string
  | {
      text?: string;
      html?: string;
      className?: string;
      style?: Partial<CSSStyleDeclaration>;
    };

// Re-export basemap types for backwards compatibility
export type {
  BasemapCatalog,
  BasemapLayer,
  BasemapMetadata,
  BasemapSuggestion,
  JoinEntity,
  JoinQuality
} from './types/basemap.types';

// =============================================================================
// Core Map Types
// =============================================================================

export type DeckDataRow = Record<string, unknown>;

export interface MapPosition {
  center: { lng: number; lat: number };
  zoom: number;
}

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

// =============================================================================
// Styling Types
// =============================================================================

export type RGBColor = [number, number, number];

// =============================================================================
// Tooltip Types
// =============================================================================

export interface TooltipEntry {
  key: string;
  value: string;
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
// Deck.gl Orthographic View State Types
// =============================================================================

export interface OrthographicMainViewState {
  target: [number, number, number];
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
}

export interface DeckOrthographicViewStateMap {
  main: OrthographicMainViewState;
}

// =============================================================================
// Map Component Props
// =============================================================================

export interface DeckMapProps {
  tables: Map<string, ArrowTable>;
  geoJSONs: Map<string, FeatureCollection>;
  width: number;
  height: number;
  onReady?: () => void;
}

// =============================================================================
// Factory Types
// =============================================================================

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
  projectionSuffix?: string;
  beforeId?: string;
}

// =============================================================================
// Projection Types
// =============================================================================

export type BBox = [number, number, number, number];

export interface CanvasSize {
  width: number;
  height: number;
}
