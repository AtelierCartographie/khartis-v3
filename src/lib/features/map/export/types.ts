import type { Deck, View } from '@deck.gl/core';

export interface ExportOptions {
  width: number;
  height: number;
}
/**
 * Where the single map lands in the exported image: an export pixel is
 * `offset + scale × map viewport pixel` (the logical pixels of
 * `projectDataToViewportPx` and `map.project`). Absent for a collection of
 * maps.
 */
export interface MapExportPlacement {
  scale: number;
  offsetX: number;
  offsetY: number;
  viewportWidth: number;
  viewportHeight: number;
}
export interface MapExportRequest extends Partial<ExportOptions> {
  onMapPlacement?: (placement: MapExportPlacement) => void;
  /** SVG: add the map frame as an empty rectangle layer, to line up exports. */
  georeferenceFrame?: boolean;
}
export interface RelativeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PageExportGeometry {
  width: number;
  height: number;
  mapFrame: RelativeRect | null;
}
export type DeckInstance = Deck<View | View[] | null>;
export type RestoreExportRender = () => Promise<void>;
export interface FrozenCanvas {
  image: HTMLImageElement;
  restore: RestoreExportRender;
}
export interface SvgViewportLike {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  project(position: number[]): number[] | { x: number; y: number };
}
export interface SvgDeckLike {
  props?: Record<string, unknown>;
  setProps?: (props: Record<string, unknown>) => void;
  redraw?: (reason?: string) => void;
  getViewports?: () => SvgViewportLike[];
  layerManager?: {
    getLayers?: () => unknown[];
  };
  viewManager?: {
    getViewports?: () => SvgViewportLike[];
  };
}
export interface SvgDeckLayerLike {
  id?: string;
  props?: Record<string, unknown>;
  constructor?: {
    layerName?: string;
    name?: string;
  };
}
export interface BinaryAttributeLike {
  value?: ArrayLike<number>;
  size?: number;
  stride?: number;
  offset?: number;
  normalized?: boolean;
}
interface SvgArrowVectorLike {
  get(row: number): unknown;
}
export interface SvgArrowTableLike {
  numRows: number;
  schema: { fields: { name: string }[] };
  getChild(name: string): SvgArrowVectorLike | null | undefined;
}
export interface BinaryLayerDataLike {
  length?: number;
  startIndices?: ArrayLike<number>;
  attributes?: Record<string, BinaryAttributeLike | undefined>;
  featureIds?: ArrayLike<number>;
  khartisSourceTable?: SvgArrowTableLike;
  khartisSplitDatasetRowByGeomRow?: ArrayLike<number>;
}
export interface SvgProjectionContext {
  canvasRect: RelativeRect;
  viewport: SvgViewportLike;
}
export interface SvgColor {
  red: number;
  green: number;
  blue: number;
  opacity: number;
}
export interface GeoJsonGeometryLike {
  type?: string;
  coordinates?: unknown;
}
export interface GeoJsonFeatureLike {
  type?: string;
  geometry?: GeoJsonGeometryLike | null;
  properties?: Record<string, unknown> | null;
}
export interface StructuredSvgOptions {
  mapLibreBackgroundDataUrl?: string | null;
}
