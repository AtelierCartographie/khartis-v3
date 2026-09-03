import {
  LegendPosition,
  LegendTab
} from '$lib/features/commons/constants/ui.constants';
import type { LegendSubtitlePrimitive } from '$lib/features/commons/utils/legend-subtitle.utils';

export interface LegendItem {
  id: string;
  name: string;
  visible: boolean;
  title: string;
  titleMode?: 'auto' | 'custom';
  subtitle: string;
  subtitleMode?: 'auto' | 'custom';
  note: string;
  variableId?: string;
  /**
   * Each graphic primitive brings its own legend, so an item is scoped to one
   * of them. Items saved before that are primitive-less and get adopted by the
   * first primitive of their visualization.
   */
  primitive?: LegendSubtitlePrimitive;
  /** Page position of this legend's own frame, resolved from the anchor stack. */
  dragPosition?: LegendDragPosition | null;
}

export interface LegendStyle {
  fontFamily: string;
  fontSize: number;
  textColor: {
    hue: number;
    saturation: number;
    lightness: number;
  };
  background: {
    enabled: boolean;
    color: {
      hue: number;
      saturation: number;
      lightness: number;
    };
    opacity: number;
  };
}

export interface LegendDragPosition {
  x: number;
  y: number;
}

export interface LegendState {
  items: LegendItem[];
  position: LegendPosition;
  /** Legacy whole-legend position; now only anchors the frame stack of projects saved before the split. */
  dragPosition: LegendDragPosition | null;
  visible: boolean;
  style: LegendStyle;
  activeTab: LegendTab;
  hasBeenOpened: boolean;
}
