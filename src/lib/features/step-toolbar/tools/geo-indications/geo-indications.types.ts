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

export interface DragPosition {
  x: number;
  y: number;
}

export interface GeoIndicationsState {
  visible: boolean;
  scale: {
    enabled: boolean;
    form: ScaleForm;
    distance: number;
    units: DistanceUnit;
    color: ColorState;
    expanded: boolean;
    dragPosition: DragPosition | null;
  };
  orientation: {
    enabled: boolean;
    style: OrientationIndicatorStyle;
    size: number;
    color: ColorState;
    dragPosition: DragPosition | null;
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
    dragPosition: DragPosition | null;
  };
}
