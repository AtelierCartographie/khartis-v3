import {
  DistanceUnit,
  InsetMapType,
  OrientationIndicatorStyle,
  StrokeStyle
} from '$lib/features/commons/constants/ui.constants';

export interface ColorState {
  hue: number;
  saturation: number;
  lightness: number;
}

export interface GeoIndicationsState {
  scale: {
    enabled: boolean;
    style: StrokeStyle;
    distance: number;
    units: DistanceUnit;
    color: ColorState;
    expanded: boolean;
  };
  orientation: {
    enabled: boolean;
    style: OrientationIndicatorStyle;
    size: number;
    color: ColorState;
  };
  insetMap: {
    enabled: boolean;
    type: InsetMapType;
    size: number;
    windowColor: ColorState;
    zoom: number;
    contrast: number;
  };
}
