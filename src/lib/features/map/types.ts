import type { Matrix4 } from '@math.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';

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

export type {
  BasemapCatalog,
  BasemapLayer,
  BasemapMetadata,
  BasemapSuggestion,
  JoinEntity,
  JoinQuality
} from './types/basemap.types';

export type DeckDataRow = Record<string, unknown>;

export interface MapPosition {
  center: { lng: number; lat: number };
  zoom: number;
}

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

export interface DeckMapProps {
  tables: Map<string, ArrowTable>;
  geoJSONs: Map<string, FeatureCollection>;
  width: number;
  height: number;
  onReady?: () => void;
}

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
  highlightedRowIds?: Set<number>;
  modelMatrix?: Matrix4 | null;
  projectionSuffix?: string;
  beforeId?: string;
}

export type BBox = [number, number, number, number];

export interface CanvasSize {
  width: number;
  height: number;
}
