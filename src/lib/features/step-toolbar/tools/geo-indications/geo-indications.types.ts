export interface ColorState {
  hue: number;
  saturation: number;
  lightness: number;
}

export interface GeoIndicationsState {
  scale: {
    enabled: boolean;
    style: 'line' | 'dashed' | 'dotted';
    distance: number;
    units: 'kilometers' | 'miles';
    color: ColorState;
    expanded: boolean;
  };
  orientation: {
    enabled: boolean;
    style: 'arrow' | 'compass';
    size: number;
    color: ColorState;
  };
  insetMap: {
    enabled: boolean;
    type: 'globe' | 'planisphere';
    size: number;
    windowColor: ColorState;
    zoom: number;
    contrast: number;
  };
}
