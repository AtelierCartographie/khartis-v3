import { hexToHsl } from '$lib/features/commons/utils/color-utils';
import type { ColorState, GeoIndicationsState } from './geo-indications.types';

const DEFAULT_STATE: GeoIndicationsState = {
  scale: {
    enabled: false,
    style: 'line',
    distance: 2000,
    units: 'kilometers',
    color: { hue: 180, saturation: 50, lightness: 50 },
    expanded: true
  },
  orientation: {
    enabled: false,
    style: 'arrow',
    size: 10,
    color: { hue: 180, saturation: 50, lightness: 50 }
  },
  insetMap: {
    enabled: false,
    type: 'globe',
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

  setScaleStyle(style: 'line' | 'dashed' | 'dotted'): void {
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

  setScaleUnits(units: 'kilometers' | 'miles'): void {
    geoIndicationsState.scale.units = units;
  },

  setScaleColor(colorState: ColorState): void {
    geoIndicationsState.scale.color = colorState;
  },

  setScaleColorFromHex(hex: string): void {
    geoIndicationsState.scale.color = hexToHsl(hex);
  },

  setOrientationStyle(style: 'arrow' | 'compass'): void {
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

  setInsetMapType(type: 'globe' | 'planisphere'): void {
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

  reset(): void {
    Object.assign(geoIndicationsState, DEFAULT_STATE);
  }
};
