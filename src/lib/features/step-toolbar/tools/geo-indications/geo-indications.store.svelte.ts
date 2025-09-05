import { hexToHsl, hslToHex } from '$lib/features/commons/utils/color-utils';
import type { ColorState, GeoIndicationsState } from './geo-indications.types';

const DEFAULT_STATE: GeoIndicationsState = {
  scale: {
    enabled: false,
    style: 'line',
    distance: 2000,
    units: 'kilometers',
    color: { hue: 360, saturation: 50, lightness: 50 },
    expanded: true
  },
  orientation: {
    enabled: false,
    style: 'arrow',
    size: 10,
    color: { hue: 360, saturation: 50, lightness: 50 }
  },
  insetMap: {
    enabled: false,
    type: 'globe',
    size: 40,
    windowColor: { hue: 360, saturation: 50, lightness: 50 },
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
    console.log('[GeoIndications] 🔄 State updated:', newState);
  },

  toggleScale(): void {
    geoIndicationsState.scale.enabled = !geoIndicationsState.scale.enabled;
    console.log(
      '[GeoIndications] 📏 Scale',
      geoIndicationsState.scale.enabled ? 'enabled' : 'disabled'
    );
  },

  setScaleDistance(distance: number): void {
    geoIndicationsState.scale.distance = Math.max(0, distance);
    console.log(
      '[GeoIndications] 📏 Scale distance set to:',
      geoIndicationsState.scale.distance,
      geoIndicationsState.scale.units
    );
  },

  toggleOrientation(): void {
    geoIndicationsState.orientation.enabled =
      !geoIndicationsState.orientation.enabled;
    console.log(
      '[GeoIndications] 🧭 Orientation',
      geoIndicationsState.orientation.enabled ? 'enabled' : 'disabled'
    );
  },

  toggleInsetMap(): void {
    geoIndicationsState.insetMap.enabled =
      !geoIndicationsState.insetMap.enabled;
    console.log(
      '[GeoIndications] 🗺️ Inset map',
      geoIndicationsState.insetMap.enabled ? 'enabled' : 'disabled'
    );
  },

  toggleScaleExpanded(): void {
    geoIndicationsState.scale.expanded = !geoIndicationsState.scale.expanded;
    console.log(
      '[GeoIndications] 📏 Scale section',
      geoIndicationsState.scale.expanded ? 'expanded' : 'collapsed'
    );
  },

  setScaleStyle(style: 'line' | 'dashed' | 'dotted'): void {
    geoIndicationsState.scale.style = style;
    console.log('[GeoIndications] 🎨 Scale style set to:', style);
  },

  incrementScaleDistance(step: number = 500): void {
    geoIndicationsState.scale.distance += step;
    console.log(
      '[GeoIndications] ➕ Scale distance incremented to:',
      geoIndicationsState.scale.distance,
      geoIndicationsState.scale.units
    );
  },

  decrementScaleDistance(step: number = 500): void {
    geoIndicationsState.scale.distance = Math.max(
      0,
      geoIndicationsState.scale.distance - step
    );
    console.log(
      '[GeoIndications] ➖ Scale distance decremented to:',
      geoIndicationsState.scale.distance,
      geoIndicationsState.scale.units
    );
  },

  setScaleUnits(units: 'kilometers' | 'miles'): void {
    geoIndicationsState.scale.units = units;
    console.log('[GeoIndications] 📏 Scale units changed to:', units);
  },

  setScaleColor(colorState: ColorState): void {
    geoIndicationsState.scale.color = colorState;
    const hex = hslToHex(
      colorState.hue,
      colorState.saturation,
      colorState.lightness
    );
    console.log('[GeoIndications] 🎨 Scale color set to:', hex, colorState);
  },

  setScaleColorFromHex(hex: string): void {
    geoIndicationsState.scale.color = hexToHsl(hex);
    console.log('[GeoIndications] 🎨 Scale color set to:', hex);
  },

  setOrientationStyle(style: 'arrow' | 'compass'): void {
    geoIndicationsState.orientation.style = style;
    console.log('[GeoIndications] 🧭 Orientation style set to:', style);
  },

  setOrientationSize(size: number): void {
    geoIndicationsState.orientation.size = Math.max(5, Math.min(30, size));
    console.log(
      '[GeoIndications] 🧭 Orientation size set to:',
      geoIndicationsState.orientation.size
    );
  },

  setOrientationColor(colorState: ColorState): void {
    geoIndicationsState.orientation.color = colorState;
    const hex = hslToHex(
      colorState.hue,
      colorState.saturation,
      colorState.lightness
    );
    console.log(
      '[GeoIndications] 🧭 Orientation color set to:',
      hex,
      colorState
    );
  },

  setOrientationColorFromHex(hex: string): void {
    geoIndicationsState.orientation.color = hexToHsl(hex);
    console.log('[GeoIndications] 🧭 Orientation color set to:', hex);
  },

  setInsetMapType(type: 'globe' | 'planisphere'): void {
    geoIndicationsState.insetMap.type = type;
    console.log('[GeoIndications] 🗺️ Inset map type set to:', type);
  },

  setInsetMapSize(size: number): void {
    geoIndicationsState.insetMap.size = Math.max(20, Math.min(210, size));
    console.log(
      '[GeoIndications] 🗺️ Inset map size set to:',
      geoIndicationsState.insetMap.size
    );
  },

  setInsetMapWindowColor(colorState: ColorState): void {
    geoIndicationsState.insetMap.windowColor = colorState;
    const hex = hslToHex(
      colorState.hue,
      colorState.saturation,
      colorState.lightness
    );
    console.log(
      '[GeoIndications] 🗺️ Inset map window color set to:',
      hex,
      colorState
    );
  },

  setInsetMapWindowColorFromHex(hex: string): void {
    geoIndicationsState.insetMap.windowColor = hexToHsl(hex);
    console.log('[GeoIndications] 🗺️ Inset map window color set to:', hex);
  },

  setInsetMapZoom(zoom: number): void {
    geoIndicationsState.insetMap.zoom = Math.max(0, Math.min(100, zoom));
    console.log(
      '[GeoIndications] 🗺️ Inset map zoom set to:',
      geoIndicationsState.insetMap.zoom
    );
  },

  setInsetMapContrast(contrast: number): void {
    geoIndicationsState.insetMap.contrast = Math.max(
      0,
      Math.min(100, contrast)
    );
    console.log(
      '[GeoIndications] 🗺️ Inset map contrast set to:',
      geoIndicationsState.insetMap.contrast
    );
  },

  reset(): void {
    console.log('[GeoIndications] 🔄 Reset to default state');
    Object.assign(geoIndicationsState, DEFAULT_STATE);
  }
};
