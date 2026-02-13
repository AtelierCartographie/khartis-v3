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
  visible: true,
  scale: {
    enabled: false,
    form: ScaleForm.LINE,
    distance: 0,
    units: DistanceUnit.KILOMETERS,
    color: { hue: 0, saturation: 0, lightness: 100 },
    expanded: true
  },
  orientation: {
    enabled: false,
    style: OrientationIndicatorStyle.ARROW,
    size: 10,
    color: { hue: 0, saturation: 0, lightness: 100 }
  },
  insetMap: {
    enabled: false,
    type: InsetMapType.GLOBE,
    size: 160,
    windowColor: { hue: 0, saturation: 0, lightness: 100 },
    continentColor: { hue: 120, saturation: 20, lightness: 80 },
    seaColor: { hue: 210, saturation: 50, lightness: 85 },
    useBasemapColors: false,
    zoom: 50,
    centerLongitude: 0,
    centerLatitude: 0
  }
};

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  return Math.max(min, Math.min(max, toFiniteNumber(value, fallback)));
}

function normalizeColorState(
  input: ColorState | undefined,
  fallback: ColorState
): ColorState {
  return {
    hue: clampNumber(input?.hue, 0, 360, fallback.hue),
    saturation: clampNumber(input?.saturation, 0, 100, fallback.saturation),
    lightness: clampNumber(input?.lightness, 0, 100, fallback.lightness)
  };
}

function normalizeState(
  partial: Partial<GeoIndicationsState>,
  current: GeoIndicationsState
): GeoIndicationsState {
  const nextScale = partial.scale;
  const nextOrientation = partial.orientation;
  const nextInsetMap = partial.insetMap;

  return {
    visible:
      typeof partial.visible === 'boolean' ? partial.visible : current.visible,
    scale: {
      enabled:
        typeof nextScale?.enabled === 'boolean'
          ? nextScale.enabled
          : current.scale.enabled,
      form:
        nextScale?.form === ScaleForm.LINE || nextScale?.form === ScaleForm.BOX
          ? nextScale.form
          : current.scale.form,
      distance: clampNumber(
        nextScale?.distance,
        0,
        Number.MAX_SAFE_INTEGER,
        current.scale.distance
      ),
      units:
        nextScale?.units === DistanceUnit.KILOMETERS ||
        nextScale?.units === DistanceUnit.MILES
          ? nextScale.units
          : current.scale.units,
      color: normalizeColorState(nextScale?.color, current.scale.color),
      expanded:
        typeof nextScale?.expanded === 'boolean'
          ? nextScale.expanded
          : current.scale.expanded
    },
    orientation: {
      enabled:
        typeof nextOrientation?.enabled === 'boolean'
          ? nextOrientation.enabled
          : current.orientation.enabled,
      style:
        nextOrientation?.style === OrientationIndicatorStyle.ARROW ||
        nextOrientation?.style === OrientationIndicatorStyle.COMPASS
          ? nextOrientation.style
          : current.orientation.style,
      size: clampNumber(nextOrientation?.size, 5, 30, current.orientation.size),
      color: normalizeColorState(
        nextOrientation?.color,
        current.orientation.color
      )
    },
    insetMap: {
      enabled:
        typeof nextInsetMap?.enabled === 'boolean'
          ? nextInsetMap.enabled
          : current.insetMap.enabled,
      type:
        nextInsetMap?.type === InsetMapType.GLOBE ||
        nextInsetMap?.type === InsetMapType.PLANISPHERE
          ? nextInsetMap.type
          : current.insetMap.type,
      size: clampNumber(nextInsetMap?.size, 20, 210, current.insetMap.size),
      windowColor: normalizeColorState(
        nextInsetMap?.windowColor,
        current.insetMap.windowColor
      ),
      continentColor: normalizeColorState(
        nextInsetMap?.continentColor,
        current.insetMap.continentColor
      ),
      seaColor: normalizeColorState(
        nextInsetMap?.seaColor,
        current.insetMap.seaColor
      ),
      useBasemapColors:
        typeof nextInsetMap?.useBasemapColors === 'boolean'
          ? nextInsetMap.useBasemapColors
          : current.insetMap.useBasemapColors,
      zoom: clampNumber(nextInsetMap?.zoom, 0, 100, current.insetMap.zoom),
      centerLongitude: clampNumber(
        nextInsetMap?.centerLongitude,
        -180,
        180,
        current.insetMap.centerLongitude
      ),
      centerLatitude: clampNumber(
        nextInsetMap?.centerLatitude,
        -90,
        90,
        current.insetMap.centerLatitude
      )
    }
  };
}

type GeoIndicationsActions = {
  setState: (newState: Partial<GeoIndicationsState>) => void;
  setVisibility: (visible: boolean) => void;
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
  setState: (newState: Partial<GeoIndicationsState>) => {
    Object.assign(s, normalizeState(newState, s));
  },
  setVisibility: (visible: boolean) => {
    s.visible = visible;
  },
  toggleScale: () => {
    s.scale.enabled = !s.scale.enabled;
  },
  setScaleDistance: (distance: number) => {
    s.scale.distance = clampNumber(
      distance,
      0,
      Number.MAX_SAFE_INTEGER,
      s.scale.distance
    );
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
    const increment = clampNumber(step, 1, Number.MAX_SAFE_INTEGER, 500);
    s.scale.distance = Math.max(0, s.scale.distance + increment);
  },
  decrementScaleDistance: (step: number = 500) => {
    const decrement = clampNumber(step, 1, Number.MAX_SAFE_INTEGER, 500);
    s.scale.distance = Math.max(0, s.scale.distance - decrement);
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
    s.orientation.size = clampNumber(size, 5, 30, s.orientation.size);
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
    s.insetMap.size = clampNumber(size, 20, 210, s.insetMap.size);
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
    s.insetMap.zoom = clampNumber(zoom, 0, 100, s.insetMap.zoom);
  },
  setInsetMapCenterLongitude: (longitude: number) => {
    s.insetMap.centerLongitude = clampNumber(
      longitude,
      -180,
      180,
      s.insetMap.centerLongitude
    );
  },
  setInsetMapCenterLatitude: (latitude: number) => {
    s.insetMap.centerLatitude = clampNumber(
      latitude,
      -90,
      90,
      s.insetMap.centerLatitude
    );
  }
}));

export const geoIndicationsState = state;
export const geoIndicationsActions = actions;
