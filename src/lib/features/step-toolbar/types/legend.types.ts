import {
  LegendPosition,
  LegendTab
} from '$lib/features/commons/constants/ui.constants';
import type {
  LegendComponent,
  LegendSubtitlePrimitive
} from '$lib/features/commons/utils/legend-subtitle.utils';

export type LegendClassBarOrientation = 'horizontal' | 'vertical';

/** Drawing choices of one legend; every field is optional in a saved project. */
export interface LegendItemLayout {
  /** Class bars: each class as long as its share of the value range. */
  proportionalClasses?: boolean;
  classBarOrientation?: LegendClassBarOrientation;
  /** Vertical class bars: the lowest class at the bottom, like a thermometer. */
  lowAtBottom?: boolean;
  /** Gap kept between two entries of a list legend, in percent of the default. */
  entrySpacing?: number;
}

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
  /**
   * Set when the primitive encodes several variables: each channel (color,
   * outline, size) then has a legend of its own.
   */
  component?: LegendComponent;
  /** Page position of this legend's own frame, resolved from the anchor stack. */
  dragPosition?: LegendDragPosition | null;
  layout?: LegendItemLayout;
  /** Replaces the primitive name next to the single swatch of a unique legend. */
  entryLabel?: string;
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
