import {
  AnnotationKind,
  DrawingType
} from '$lib/features/commons/constants/ui.constants';
import { TextAlign } from '$lib/features/commons/types/enums';

export interface Annotation {
  id: string;
  type: AnnotationKind;
  content: unknown;
  position: { x: number; y: number };
  style?: AnnotationStyle;
  visible?: boolean;
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

  smoothness?: number;
  drawingType?: DrawingType;

  size?: number;
}

export interface AnnotationsState {
  items: Annotation[];
  selectedId: string | null;
  activeType: AnnotationKind;
  predefinedStyle: string;
  textContent: string;
  defaultStyle: AnnotationStyle;
}
