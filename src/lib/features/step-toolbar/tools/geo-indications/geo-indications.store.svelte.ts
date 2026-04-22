import {
  DistanceUnit,
  InsetMapType,
  OrientationIndicatorStyle,
  ScaleForm
} from '$lib/features/commons/constants/ui.constants';
import {
  AVAILABLE_FONTS,
  LEGEND_FONT_SIZES
} from '$lib/features/step-toolbar/tools/legend/legend.constants';
import { hexToHsl } from '$lib/features/commons/utils/color-utils';
import {
  PRINT_STANDARD_TOKENS,
  resolveLayoutSizingTokens
} from '$lib/features/commons/utils/layout-sizing.utils';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
import {
  getFormatLayoutSizingContext,
  getFormatState
} from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import {
  clampScaleDistance,
  convertDistanceValue,
  INSET_MAP_SIZE_LIMITS,
  normalizeScaleDistanceValue
} from './utils';
import type {
  ColorState,
  DragPosition,
  GeoIndicationsState
} from './geo-indications.types';

const DEFAULT_INSET_WINDOW_COLOR = hexToHsl('#ffffff');
const DEFAULT_INSET_CONTINENT_COLOR = hexToHsl('#d9d9d9');
const DEFAULT_INSET_SEA_COLOR = hexToHsl('#d0e2ff');

const DEFAULT_STATE: GeoIndicationsState = {
  visible: true,
  scale: {
    enabled: false,
    form: ScaleForm.LINE,
    distance: 0,
    units: DistanceUnit.KILOMETERS,
    color: { hue: 0, saturation: 0, lightness: 0 },
    fontFamily: AVAILABLE_FONTS[0],
    fontSize: PRINT_STANDARD_TOKENS.geoIndications.scaleFontSize,
    expanded: true,
    dragPosition: null
  },
  orientation: {
    enabled: false,
    style: OrientationIndicatorStyle.ARROW,
    size: 10,
    color: { hue: 0, saturation: 0, lightness: 0 },
    dragPosition: null
  },
  insetMap: {
    enabled: false,
    type: InsetMapType.GLOBE,
    size: 160,
    windowColor: DEFAULT_INSET_WINDOW_COLOR,
    continentColor: DEFAULT_INSET_CONTINENT_COLOR,
    seaColor: DEFAULT_INSET_SEA_COLOR,
    useBasemapColors: true,
    zoom: 50,
    centerLongitude: 0,
    centerLatitude: 0,
    dragPosition: null
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

function normalizeDragPosition(
  input: DragPosition | null | undefined,
  current: DragPosition | null
): DragPosition | null {
  if (input === undefined) {
    return current;
  }
  if (input === null) {
    return null;
  }
  return {
    x: toFiniteNumber(input.x, 0),
    y: toFiniteNumber(input.y, 0)
  };
}

function normalizeState(
  partial: Partial<GeoIndicationsState>,
  current: GeoIndicationsState
): GeoIndicationsState {
  const nextScale = partial.scale;
  const nextOrientation = partial.orientation;
  const nextInsetMap = partial.insetMap;
  const nextScaleUnits =
    nextScale?.units === DistanceUnit.KILOMETERS ||
    nextScale?.units === DistanceUnit.MILES
      ? nextScale.units
      : current.scale.units;

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
      distance: clampScaleDistance(
        toFiniteNumber(nextScale?.distance, current.scale.distance),
        nextScaleUnits,
        current.scale.distance
      ),
      units: nextScaleUnits,
      color: normalizeColorState(nextScale?.color, current.scale.color),
      fontFamily:
        typeof nextScale?.fontFamily === 'string' &&
        AVAILABLE_FONTS.includes(
          nextScale.fontFamily as (typeof AVAILABLE_FONTS)[number]
        )
          ? nextScale.fontFamily
          : current.scale.fontFamily,
      fontSize:
        typeof nextScale?.fontSize === 'number' &&
        LEGEND_FONT_SIZES.includes(
          nextScale.fontSize as (typeof LEGEND_FONT_SIZES)[number]
        )
          ? nextScale.fontSize
          : current.scale.fontSize,
      expanded:
        typeof nextScale?.expanded === 'boolean'
          ? nextScale.expanded
          : current.scale.expanded,
      dragPosition: normalizeDragPosition(
        nextScale?.dragPosition,
        current.scale.dragPosition
      )
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
      ),
      dragPosition: normalizeDragPosition(
        nextOrientation?.dragPosition,
        current.orientation.dragPosition
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
      size: clampNumber(
        nextInsetMap?.size,
        INSET_MAP_SIZE_LIMITS[
          nextInsetMap?.type === InsetMapType.GLOBE ||
          nextInsetMap?.type === InsetMapType.PLANISPHERE
            ? nextInsetMap.type
            : current.insetMap.type
        ].min,
        INSET_MAP_SIZE_LIMITS[
          nextInsetMap?.type === InsetMapType.GLOBE ||
          nextInsetMap?.type === InsetMapType.PLANISPHERE
            ? nextInsetMap.type
            : current.insetMap.type
        ].max,
        current.insetMap.size
      ),
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
      ),
      dragPosition: normalizeDragPosition(
        nextInsetMap?.dragPosition,
        current.insetMap.dragPosition
      )
    }
  };
}

function getCurrentScaleDistanceContext() {
  const center = mapInstanceStore.getMapCenter();

  return {
    map: mapInstanceStore.map,
    zoom: mapInstanceStore.currentZoom,
    centerLatitude: center?.lat ?? null
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
  setScaleUnits: (units: DistanceUnit) => void;
  setScaleColor: (colorState: ColorState) => void;
  setScaleColorFromHex: (hex: string) => void;
  setScaleFontFamily: (fontFamily: string) => void;
  setScaleFontSize: (fontSize: number) => void;
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
  setScaleDragPosition: (pos: DragPosition | null) => void;
  setOrientationDragPosition: (pos: DragPosition | null) => void;
  setInsetMapDragPosition: (pos: DragPosition | null) => void;
};

const { state, actions } = createToolStore<
  GeoIndicationsState,
  GeoIndicationsActions
>(
  DEFAULT_STATE,
  (s) => ({
    setState: (newState: Partial<GeoIndicationsState>) => {
      Object.assign(s, normalizeState(newState, s));
    },
    setVisibility: (visible: boolean) => {
      s.visible = visible;
    },
    toggleScale: () => {
      const wasEnabled = s.scale.enabled;
      s.scale.enabled = !wasEnabled;

      if (!wasEnabled && s.scale.fontSize === DEFAULT_STATE.scale.fontSize) {
        const fmt = getFormatState();
        const tokens = resolveLayoutSizingTokens(
          getFormatLayoutSizingContext(fmt)
        );
        s.scale.fontSize = tokens.geoIndications.scaleFontSize;
      }
    },
    setScaleDistance: (distance: number) => {
      s.scale.distance = clampScaleDistance(
        distance,
        s.scale.units,
        s.scale.distance,
        getCurrentScaleDistanceContext()
      );
    },
    toggleOrientation: () => {
      const wasEnabled = s.orientation.enabled;
      s.orientation.enabled = !wasEnabled;

      if (
        !wasEnabled &&
        s.orientation.size === DEFAULT_STATE.orientation.size
      ) {
        const fmt = getFormatState();
        const tokens = resolveLayoutSizingTokens(
          getFormatLayoutSizingContext(fmt)
        );
        s.orientation.size = tokens.geoIndications.orientationSizeMm;
      }
    },
    toggleInsetMap: () => {
      const wasEnabled = s.insetMap.enabled;
      s.insetMap.enabled = !wasEnabled;

      if (!wasEnabled && s.insetMap.size === DEFAULT_STATE.insetMap.size) {
        const fmt = getFormatState();
        const tokens = resolveLayoutSizingTokens(
          getFormatLayoutSizingContext(fmt)
        );
        s.insetMap.size = tokens.geoIndications.insetSize;
      }
    },
    toggleScaleExpanded: () => {
      s.scale.expanded = !s.scale.expanded;
    },
    setScaleForm: (form: ScaleForm) => {
      s.scale.form = form;
    },
    setScaleUnits: (units: DistanceUnit) => {
      if (units === s.scale.units) {
        return;
      }

      if (s.scale.distance > 0) {
        s.scale.distance = clampScaleDistance(
          normalizeScaleDistanceValue(
            convertDistanceValue(s.scale.distance, s.scale.units, units)
          ),
          units,
          s.scale.distance,
          getCurrentScaleDistanceContext()
        );
      }

      s.scale.units = units;
    },
    setScaleColor: (colorState: ColorState) => {
      s.scale.color = colorState;
    },
    setScaleColorFromHex: (hex: string) => {
      s.scale.color = hexToHsl(hex);
    },
    setScaleFontFamily: (fontFamily: string) => {
      if (
        AVAILABLE_FONTS.includes(fontFamily as (typeof AVAILABLE_FONTS)[number])
      ) {
        s.scale.fontFamily = fontFamily;
      }
    },
    setScaleFontSize: (fontSize: number) => {
      if (
        LEGEND_FONT_SIZES.includes(
          fontSize as (typeof LEGEND_FONT_SIZES)[number]
        )
      ) {
        s.scale.fontSize = fontSize;
      }
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
      s.insetMap.size = clampNumber(
        s.insetMap.size,
        INSET_MAP_SIZE_LIMITS[type].min,
        INSET_MAP_SIZE_LIMITS[type].max,
        s.insetMap.size
      );
    },
    setInsetMapSize: (size: number) => {
      s.insetMap.size = clampNumber(
        size,
        INSET_MAP_SIZE_LIMITS[s.insetMap.type].min,
        INSET_MAP_SIZE_LIMITS[s.insetMap.type].max,
        s.insetMap.size
      );
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
    },
    setScaleDragPosition: (pos: DragPosition | null) => {
      s.scale.dragPosition = pos;
    },
    setOrientationDragPosition: (pos: DragPosition | null) => {
      s.orientation.dragPosition = pos;
    },
    setInsetMapDragPosition: (pos: DragPosition | null) => {
      s.insetMap.dragPosition = pos;
    }
  }),
  { key: 'geoIndications' }
);

export const geoIndicationsState = state;
export const geoIndicationsActions = actions;
