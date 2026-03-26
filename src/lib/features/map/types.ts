import type { Matrix4 } from '@math.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';

export type {
  PickingInfo,
  ViewStateChangeParameters,
  OrthographicViewState
} from '@deck.gl/core';

export type {
  BasemapCatalog,
  BasemapLayer,
  BasemapMetadata,
  BasemapSuggestion,
  JoinEntity,
  JoinQuality
} from './types/basemap.types';

export type DeckDataRow = Record<string, unknown>;

export type ThematicLayer = import('@deck.gl/core').Layer<DeckDataRow>;

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

export interface FacetSyncViewState {
  type: 'orthographic' | 'maplibre';
  target?: [number, number, number];
  center?: [number, number];
  zoom: number;
}

export interface DeckMapProps {
  tables: Map<string, ArrowTable>;
  geoJSONs: Map<string, FeatureCollection>;
  dataVersion?: number;
  width: number;
  height: number;
  onReady?: () => void;
  forcedVisualizationIds?: string[];
  onMoveSync?: (state: FacetSyncViewState) => void;
  syncViewState?: FacetSyncViewState | null;
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
  strokeColor: RGBColor;
  fillOpacity: number;
  strokeWidth: number;
  strokeOpacity: number;
  statistics: { min: number; max: number };
  categoryColorMap: Map<string, RGBColor> | null;
  highlightedRowIds?: Set<number>;
  /** Scalar version counter for highlight changes (avoids Set ref in updateTriggers) */
  highlightVersion?: number;
  modelMatrix?: Matrix4 | null;
  projectionSuffix?: string;
  beforeId?: string;
  /** Pre-computed geometry info — avoids redundant extractGeometryInfo() calls */
  geometryInfo?: GeometryInfo;
  /** GPU-side year filter via DataFilterExtension — avoids data prop changes on year switch */
  yearFilter?: YearFilterInfo;
}

export type BBox = [number, number, number, number];

export interface CanvasSize {
  width: number;
  height: number;
}
