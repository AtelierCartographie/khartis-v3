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

export interface LegendState {
  items: LegendItem[];
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  visible: boolean;
  style: LegendStyle;
  activeTab: 'content' | 'style';
}
