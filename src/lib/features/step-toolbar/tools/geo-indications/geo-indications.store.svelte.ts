import {
  DistanceUnit,
  InsetMapType,
  OrientationIndicatorStyle,
  StrokeStyle
} from '$lib/features/commons/constants/ui.constants';
import { hexToHsl } from '$lib/features/commons/utils/color-utils';
import { createResetFunction } from '$lib/features/commons/utils/store.utils';
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

export const geoIndicationsState = $state<GeoIndicationsState>({
  ...DEFAULT_STATE
});

export const geoIndicationsActions = {
  setState(newState: Partial<GeoIndicationsState>): void {
    Object.assign(geoIndicationsState, newState);
  },

  toggleScale(): void {
    geoIndicationsState.scale.enabled = !geoIndicationsState.scale.enabled;
  },

  setScaleDistance(distance: number): void {
    geoIndicationsState.scale.distance = Math.max(0, distance);
  },

  toggleOrientation(): void {
    geoIndicationsState.orientation.enabled =
      !geoIndicationsState.orientation.enabled;
  },

  toggleInsetMap(): void {
    geoIndicationsState.insetMap.enabled =
      !geoIndicationsState.insetMap.enabled;
  },

  toggleScaleExpanded(): void {
    geoIndicationsState.scale.expanded = !geoIndicationsState.scale.expanded;
  },

  setScaleStyle(style: StrokeStyle): void {
    geoIndicationsState.scale.style = style;
  },

  incrementScaleDistance(step: number = 500): void {
    geoIndicationsState.scale.distance += step;
  },

  decrementScaleDistance(step: number = 500): void {
    geoIndicationsState.scale.distance = Math.max(
      0,
      geoIndicationsState.scale.distance - step
    );
  },

  setScaleUnits(units: DistanceUnit): void {
    geoIndicationsState.scale.units = units;
  },

  setScaleColor(colorState: ColorState): void {
    geoIndicationsState.scale.color = colorState;
  },

  setScaleColorFromHex(hex: string): void {
    geoIndicationsState.scale.color = hexToHsl(hex);
  },

  setOrientationStyle(style: OrientationIndicatorStyle): void {
    geoIndicationsState.orientation.style = style;
  },

  setOrientationSize(size: number): void {
    geoIndicationsState.orientation.size = Math.max(5, Math.min(30, size));
  },

  setOrientationColor(colorState: ColorState): void {
    geoIndicationsState.orientation.color = colorState;
  },

  setOrientationColorFromHex(hex: string): void {
    geoIndicationsState.orientation.color = hexToHsl(hex);
  },

  setInsetMapType(type: InsetMapType): void {
    geoIndicationsState.insetMap.type = type;
  },

  setInsetMapSize(size: number): void {
    geoIndicationsState.insetMap.size = Math.max(20, Math.min(210, size));
  },

  setInsetMapWindowColor(colorState: ColorState): void {
    geoIndicationsState.insetMap.windowColor = colorState;
  },

  setInsetMapWindowColorFromHex(hex: string): void {
    geoIndicationsState.insetMap.windowColor = hexToHsl(hex);
  },

  setInsetMapZoom(zoom: number): void {
    geoIndicationsState.insetMap.zoom = Math.max(0, Math.min(100, zoom));
  },

  setInsetMapContrast(contrast: number): void {
    geoIndicationsState.insetMap.contrast = Math.max(
      0,
      Math.min(100, contrast)
    );
  },

  reset: createResetFunction(geoIndicationsState, DEFAULT_STATE)
};
