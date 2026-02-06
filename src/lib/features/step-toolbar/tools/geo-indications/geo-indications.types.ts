import {
  DistanceUnit,
  InsetMapType,
  OrientationIndicatorStyle,
  ScaleForm
} from '$lib/features/commons/constants/ui.constants';

export interface ColorState {
  hue: number;
  saturation: number;
  lightness: number;
}

export interface GeoIndicationsState {
  scale: {
    enabled: boolean;
    form: ScaleForm;
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
    continentColor: ColorState;
    seaColor: ColorState;
    useBasemapColors: boolean;
    zoom: number;
    centerLongitude: number;
    centerLatitude: number;
  };
}
