import {
  AnnotationKind,
  DrawingType
} from '$lib/features/commons/constants/ui.constants';
import { type AnnotationRoleValue } from '$lib/features/commons/constants';
import { TextAlign } from '$lib/features/commons/types/enums';

export type PageElementRole = AnnotationRoleValue;
export type AnnotationCoordinateSpace = 'page' | 'map';
export type AnnotationCreationMode = 'idle' | 'placing' | 'drawing';

/**
 * WGS84 data anchor (lon/lat) tying a `coordinateSpace:'map'` annotation to the
 * basemap so it stays glued to the geometry when the MAP is zoomed/panned.
 *
 * Invariant — anchor + span contract: `lon`/`lat` pin the annotation's top-left
 * in map-area coordinates. `spanLon`/`spanLat` pin a SECOND geographic point
 * that sat exactly `ANNOTATION_ANCHOR_SPAN_PX × current scale factor` logical
 * px to the right of the anchor when it was written; reprojecting both points
 * and dividing the on-screen distance by the span yields the map scale factor
 * applied to the mark, so it zooms at the same rate as the basemap. The mark's
 * own geometry (`style.points` / `content`) stays in unzoomed map-area pixel
 * offsets from the anchor. An anchor WITHOUT a span (older project) keeps the
 * translate-only behavior, and a `'map'` annotation WITHOUT an anchor is
 * legacy: it keeps the historical pixel-page behavior (positioned relative to
 * the map frame, ignores the map viewState).
 */
export interface AnnotationDataAnchor {
  lon: number;
  lat: number;
  spanLon?: number;
  spanLat?: number;
}

export interface Annotation {
  id: string;
  type: AnnotationKind;
  content: unknown;
  position: { x: number; y: number };
  coordinateSpace?: AnnotationCoordinateSpace;
  anchor?: AnnotationDataAnchor;
  positionMode?: 'auto' | 'manual';
  style?: AnnotationStyle;
  visible?: boolean;
  role?: PageElementRole;
}

export interface AnnotationStyle {
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  textAlign?: TextAlign;

  opacity?: number;
  color?: string | { hue: number; saturation: number; lightness: number };

  strokeWidth?: number;
  strokeColor?: string | { hue: number; saturation: number; lightness: number };
  fillColor?: string | { hue: number; saturation: number; lightness: number };
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  cornerRadius?: number;
  curvature?: number;

  backgroundColor?:
    | string
    | { hue: number; saturation: number; lightness: number };
  backgroundOpacity?: number;

  smoothness?: number;
  drawingType?: DrawingType;

  size?: number;
  shapeWidth?: number;
  shapeHeight?: number;
  rotation?: number;

  points?: { x: number; y: number }[];
  controlOffsets?: number[];
}

export interface AnnotationPlacementPreview {
  coordinateSpace: AnnotationCoordinateSpace;
  type: AnnotationKind;
  position: { x: number; y: number };
  size: { width: number; height: number };
  content?: unknown;
  style?: Partial<AnnotationStyle>;
}

export interface AnnotationsState {
  visible: boolean;
  items: Annotation[];
  selectedId: string | null;
  activeType: AnnotationKind;
  predefinedStyle: string;
  textContent: string;
  defaultStyle: AnnotationStyle;
  creationMode: AnnotationCreationMode;
  pendingType: AnnotationKind | null;
  pendingContent: unknown;
  pendingStyle: AnnotationStyle | null;
  previewGeometry: AnnotationPlacementPreview | null;
  drawingModeType: DrawingType;
  drawingInProgress: { x: number; y: number }[];
}

export function resolveAnnotationCoordinateSpace(
  annotation: Pick<Annotation, 'coordinateSpace' | 'role'>
): AnnotationCoordinateSpace {
  if (annotation.role) {
    return 'page';
  }

  return annotation.coordinateSpace ?? 'map';
}
