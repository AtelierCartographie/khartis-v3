import {
  LegendPosition,
  LegendTab
} from '$lib/features/commons/constants/ui.constants';

export interface LegendItem {
  id: string;
  name: string;
  visible: boolean;
  title: string;
  subtitle: string;
  note: string;
  variableId?: string;
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
  dragPosition: LegendDragPosition | null;
  visible: boolean;
  style: LegendStyle;
  activeTab: LegendTab;
  hasBeenOpened: boolean;
}
