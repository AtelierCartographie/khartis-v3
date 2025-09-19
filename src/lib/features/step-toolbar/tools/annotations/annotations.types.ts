import { TextAlign } from '$lib/features/commons/types/enums';

export interface AnnotationType {
  id: string;
  type: 'text' | 'shape' | 'drawing' | 'image';
  content: unknown;
  position: { x: number; y: number };
  style?: AnnotationStyle;
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
  drawingType?: 'line' | 'zone';

  size?: number;
}
export interface AnnotationsState {
  items: AnnotationType[];
  selectedId: string | null;
  activeType: 'text' | 'shape' | 'drawing' | 'image';
  predefinedStyle: string;
  textContent: string;
  defaultStyle: AnnotationStyle;
}
