import {
  DistanceUnit,
  InsetMapType,
  OrientationIndicatorStyle,
  StrokeStyle
} from '$lib/features/commons/constants/ui.constants';
import { hexToHsl } from '$lib/features/commons/utils/color-utils';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type { ColorState, GeoIndicationsState } from './geo-indications.types';

const DEFAULT_STATE: GeoIndicationsState = {
  scale: {
    enabled: false,
    style: StrokeStyle.LINE,
    distance: 2000,
    units: DistanceUnit.KILOMETERS,
    color: { hue: 180, saturation: 50, lightness: 50 },
    expanded: true
  },
  orientation: {
    enabled: false,
    style: OrientationIndicatorStyle.ARROW,
    size: 10,
    color: { hue: 180, saturation: 50, lightness: 50 }
  },
  insetMap: {
    enabled: false,
    type: InsetMapType.GLOBE,
    size: 40,
    windowColor: { hue: 180, saturation: 50, lightness: 50 },
    zoom: 50,
    contrast: 50
  }
};

type GeoIndicationsActions = {
  toggleScale: () => void;
  setScaleDistance: (distance: number) => void;
  toggleOrientation: () => void;
  toggleInsetMap: () => void;
  toggleScaleExpanded: () => void;
  setScaleStyle: (style: StrokeStyle) => void;
  incrementScaleDistance: (step?: number) => void;
  decrementScaleDistance: (step?: number) => void;
  setScaleUnits: (units: DistanceUnit) => void;
  setScaleColor: (colorState: ColorState) => void;
  setScaleColorFromHex: (hex: string) => void;
  setOrientationStyle: (style: OrientationIndicatorStyle) => void;
  setOrientationSize: (size: number) => void;
  setOrientationColor: (colorState: ColorState) => void;
  setOrientationColorFromHex: (hex: string) => void;
  setInsetMapType: (type: InsetMapType) => void;
  setInsetMapSize: (size: number) => void;
  setInsetMapWindowColor: (colorState: ColorState) => void;
  setInsetMapWindowColorFromHex: (hex: string) => void;
  setInsetMapZoom: (zoom: number) => void;
  setInsetMapContrast: (contrast: number) => void;
};

const { state, actions } = createToolStore<
  GeoIndicationsState,
  GeoIndicationsActions
>(DEFAULT_STATE, (s) => ({
  toggleScale: () => {
    s.scale.enabled = !s.scale.enabled;
  },
  setScaleDistance: (distance: number) => {
    s.scale.distance = Math.max(0, distance);
  },
  toggleOrientation: () => {
    s.orientation.enabled = !s.orientation.enabled;
  },
  toggleInsetMap: () => {
    s.insetMap.enabled = !s.insetMap.enabled;
  },
  toggleScaleExpanded: () => {
    s.scale.expanded = !s.scale.expanded;
  },
  setScaleStyle: (style: StrokeStyle) => {
    s.scale.style = style;
  },
  incrementScaleDistance: (step: number = 500) => {
    s.scale.distance += step;
  },
  decrementScaleDistance: (step: number = 500) => {
    s.scale.distance = Math.max(0, s.scale.distance - step);
  },
  setScaleUnits: (units: DistanceUnit) => {
    s.scale.units = units;
  },
  setScaleColor: (colorState: ColorState) => {
    s.scale.color = colorState;
  },
  setScaleColorFromHex: (hex: string) => {
    s.scale.color = hexToHsl(hex);
  },
  setOrientationStyle: (style: OrientationIndicatorStyle) => {
    s.orientation.style = style;
  },
  setOrientationSize: (size: number) => {
    s.orientation.size = Math.max(5, Math.min(30, size));
  },
  setOrientationColor: (colorState: ColorState) => {
    s.orientation.color = colorState;
  },
  setOrientationColorFromHex: (hex: string) => {
    s.orientation.color = hexToHsl(hex);
  },
  setInsetMapType: (type: InsetMapType) => {
    s.insetMap.type = type;
  },
  setInsetMapSize: (size: number) => {
    s.insetMap.size = Math.max(20, Math.min(210, size));
  },
  setInsetMapWindowColor: (colorState: ColorState) => {
    s.insetMap.windowColor = colorState;
  },
  setInsetMapWindowColorFromHex: (hex: string) => {
    s.insetMap.windowColor = hexToHsl(hex);
  },
  setInsetMapZoom: (zoom: number) => {
    s.insetMap.zoom = Math.max(0, Math.min(100, zoom));
  },
  setInsetMapContrast: (contrast: number) => {
    s.insetMap.contrast = Math.max(0, Math.min(100, contrast));
  }
}));

export const geoIndicationsState = state;
export const geoIndicationsActions = actions;
