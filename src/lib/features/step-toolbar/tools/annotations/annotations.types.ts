import {
  AnnotationKind,
  DrawingType
} from '$lib/features/commons/constants/ui.constants';
import {
  ANNOTATION_ROLE,
  type AnnotationRoleValue
} from '$lib/features/commons/constants';
import { TextAlign } from '$lib/features/commons/types/enums';

export type PageElementRole = Exclude<
  AnnotationRoleValue,
  typeof ANNOTATION_ROLE.NOTE
>;

export interface Annotation {
  id: string;
  type: AnnotationKind;
  content: unknown;
  position: { x: number; y: number };
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
}

export interface AnnotationsState {
  visible: boolean;
  items: Annotation[];
  selectedId: string | null;
  activeType: AnnotationKind;
  predefinedStyle: string;
  textContent: string;
  defaultStyle: AnnotationStyle;
}
