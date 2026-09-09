import { webglToHex } from '$lib/features/commons/utils/color-utils';
import type {
  FrontieresLayerConfig,
  TerreLayerConfig
} from '../stores/basemap-layers.store.svelte';
import type { StylePreset, StylePresets } from '../types/basemap.types';
import { dashArrayToDottedPattern } from './layer-helpers';

interface MetadataStyleEntry {
  style: string | null;
  styleOverride?: Record<string, unknown>;
}

function isPolygonStylePreset(
  preset: StylePreset | undefined
): preset is Extract<StylePreset, { layer_type: 'solid-polygon' }> {
  return preset?.layer_type === 'solid-polygon';
}

function resolveLandFillColorHex(
  styleName: string | null,
  stylePresets: StylePresets | null | undefined,
  fallbackHex: string
): string {
  if (!styleName || !stylePresets) {
    return fallbackHex;
  }
  const preset = stylePresets[styleName];
  if (!isPolygonStylePreset(preset)) {
    return fallbackHex;
  }
  const [r, g, b] = preset.fillColor;
  return webglToHex([r, g, b, preset.fillColor[3] ?? 255]);
}

// Merges a per-layer style override on top of the style-preset default, on top
// of the shared land config. This lets each land layer of a multi-land basemap
// keep its own colour, opacity and stroke.
export function resolvePresetLandStroked(
  style: string | null | undefined,
  stylePresets: StylePresets | null | undefined
): boolean | undefined {
  if (!style || !stylePresets) return undefined;
  const preset = stylePresets[style];
  return preset?.layer_type === 'solid-polygon' ? preset.stroked : undefined;
}

export function resolveLandConfig(
  entry: MetadataStyleEntry,
  config: TerreLayerConfig,
  stylePresets: StylePresets | null | undefined
): TerreLayerConfig {
  const presetFillColor = resolveLandFillColorHex(
    entry.style,
    stylePresets,
    config.fillColor
  );
  const presetStroked = resolvePresetLandStroked(entry.style, stylePresets);
  const override = entry.styleOverride ?? {};
  const pickString = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value.length > 0 ? value : fallback;
  const pickNumber = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const pickBoolean = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

  return {
    ...config,
    fillColor: pickString(override.fillColor, presetFillColor),
    fillOpacity: pickNumber(override.fillOpacity, config.fillOpacity),
    fillShadow: pickBoolean(override.fillShadow, config.fillShadow),
    strokeVisible: pickBoolean(
      override.strokeVisible,
      presetStroked ?? config.strokeVisible
    ),
    strokeColor: pickString(override.strokeColor, config.strokeColor),
    strokeOpacity: pickNumber(override.strokeOpacity, config.strokeOpacity),
    strokeThickness: pickNumber(
      override.strokeThickness,
      config.strokeThickness
    ),
    strokeDotted: pickBoolean(override.strokeDotted, config.strokeDotted),
    strokeDottedPattern:
      (override.strokeDottedPattern as TerreLayerConfig['strokeDottedPattern']) ??
      config.strokeDottedPattern
  };
}

export type StyledMetadataLineConfig = Pick<
  FrontieresLayerConfig,
  'color' | 'dotted' | 'dottedPattern' | 'thickness' | 'opacity'
> & {
  // Exact dash authored in the style preset, used until the user picks an
  // explicit pattern in the UI.
  presetDashArray?: [number, number];
};

// Resolves one limit layer's line style: per-file override wins, then the style
// preset, then the shared Frontieres config as a last resort.
export function resolveMetadataLineStyle(
  entry: MetadataStyleEntry,
  config: StyledMetadataLineConfig,
  stylePresets: StylePresets | null | undefined
): StyledMetadataLineConfig {
  const preset =
    stylePresets &&
    entry.style &&
    stylePresets[entry.style]?.layer_type === 'path'
      ? (stylePresets[entry.style] as Extract<
          StylePreset,
          { layer_type: 'path' }
        >)
      : null;
  const override = entry.styleOverride ?? {};
  const presetColorHex = preset
    ? webglToHex([
        preset.color[0],
        preset.color[1],
        preset.color[2],
        preset.color[3] ?? 255
      ])
    : undefined;
  const pickString = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value.length > 0 ? value : fallback;
  const pickNumber = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const pickBoolean = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

  const presetDashArray = preset?.dashArray;

  return {
    color: pickString(override.color, presetColorHex ?? config.color),
    thickness: pickNumber(
      override.thickness,
      preset?.width ?? config.thickness
    ),
    opacity: pickNumber(override.opacity, config.opacity),
    dotted: pickBoolean(
      override.dotted,
      presetDashArray ? true : config.dotted
    ),
    dottedPattern:
      (override.dottedPattern as StyledMetadataLineConfig['dottedPattern']) ??
      (presetDashArray
        ? dashArrayToDottedPattern(presetDashArray)
        : config.dottedPattern),
    presetDashArray:
      override.dottedPattern === undefined ? presetDashArray : undefined
  };
}
