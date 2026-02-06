import {
  DistanceUnit,
  InsetMapType,
  OrientationIndicatorStyle,
  ScaleForm
} from '$lib/features/commons/constants/ui.constants';
import { hexToHsl } from '$lib/features/commons/utils/color-utils';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type { ColorState, GeoIndicationsState } from './geo-indications.types';

const DEFAULT_STATE: GeoIndicationsState = {
  scale: {
    enabled: false,
    form: ScaleForm.LINE,
    distance: 2000,
    units: DistanceUnit.KILOMETERS,
    color: { hue: 0, saturation: 0, lightness: 0 },
    expanded: true
  },
  orientation: {
    enabled: false,
    style: OrientationIndicatorStyle.ARROW,
    size: 10,
    color: { hue: 0, saturation: 0, lightness: 0 }
  },
  insetMap: {
    enabled: false,
    type: InsetMapType.GLOBE,
    size: 40,
    windowColor: { hue: 210, saturation: 80, lightness: 50 },
    continentColor: { hue: 120, saturation: 20, lightness: 80 },
    seaColor: { hue: 210, saturation: 50, lightness: 85 },
    useBasemapColors: false,
    zoom: 50,
    centerLongitude: 0,
    centerLatitude: 0
  }
};

type GeoIndicationsActions = {
  toggleScale: () => void;
  setScaleDistance: (distance: number) => void;
  toggleOrientation: () => void;
  toggleInsetMap: () => void;
  toggleScaleExpanded: () => void;
  setScaleForm: (form: ScaleForm) => void;
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
  setInsetMapContinentColor: (colorState: ColorState) => void;
  setInsetMapContinentColorFromHex: (hex: string) => void;
  setInsetMapSeaColor: (colorState: ColorState) => void;
  setInsetMapSeaColorFromHex: (hex: string) => void;
  setInsetMapUseBasemapColors: (use: boolean) => void;
  setInsetMapZoom: (zoom: number) => void;
  setInsetMapCenterLongitude: (longitude: number) => void;
  setInsetMapCenterLatitude: (latitude: number) => void;
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
  setScaleForm: (form: ScaleForm) => {
    s.scale.form = form;
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
  setInsetMapContinentColor: (colorState: ColorState) => {
    s.insetMap.continentColor = colorState;
  },
  setInsetMapContinentColorFromHex: (hex: string) => {
    s.insetMap.continentColor = hexToHsl(hex);
  },
  setInsetMapSeaColor: (colorState: ColorState) => {
    s.insetMap.seaColor = colorState;
  },
  setInsetMapSeaColorFromHex: (hex: string) => {
    s.insetMap.seaColor = hexToHsl(hex);
  },
  setInsetMapUseBasemapColors: (use: boolean) => {
    s.insetMap.useBasemapColors = use;
  },
  setInsetMapZoom: (zoom: number) => {
    s.insetMap.zoom = Math.max(0, Math.min(100, zoom));
  },
  setInsetMapCenterLongitude: (longitude: number) => {
    s.insetMap.centerLongitude = Math.max(-180, Math.min(180, longitude));
  },
  setInsetMapCenterLatitude: (latitude: number) => {
    s.insetMap.centerLatitude = Math.max(-90, Math.min(90, latitude));
  }
}));

export const geoIndicationsState = state;
export const geoIndicationsActions = actions;
