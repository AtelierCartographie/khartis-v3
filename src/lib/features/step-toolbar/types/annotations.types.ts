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
 * Invariant — single-anchor contract: the anchor pins ONE reference point (the
 * annotation's top-left in map-area coordinates). For multi-point marks
 * (vector arrows/lines, freehand drawings) the relative geometry stays in
 * `style.points` / `content` as unzoomed map-area pixel offsets from that
 * anchor, exactly like a proportional symbol — only the anchor reprojects, the
 * offsets do not. A `'map'` annotation WITHOUT an anchor is legacy: it keeps the
 * historical pixel-page behavior (positioned relative to the map frame, ignores
 * the map viewState).
 */
export interface AnnotationDataAnchor {
  lon: number;
  lat: number;
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
