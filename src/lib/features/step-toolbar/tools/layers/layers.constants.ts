import {
  DEFAULT_VISUALIZATION_COLOR,
  DEFAULT_VISUALIZATION_NEUTRAL_COLOR
} from '$lib/features/commons/constants/colors.constants';
import {
  SEPIA_MIXTE_COLORS,
  VIF_MIXTE_COLORS
} from '$lib/features/commons/constants/qualitative-palette.constants';

export const VIZ_SUBLAYER_COLOR = DEFAULT_VISUALIZATION_COLOR;
export const BASEMAP_SUBLAYER_COLOR = DEFAULT_VISUALIZATION_NEUTRAL_COLOR;

/**
 * Layer-panel accent colors (#182, Figma 1419-89514).
 *
 * Primitive rows take a per-visualization hue from the Ok-Palette "Categorical /
 * Vivid" preset, so every visualization is visually distinct while all of its
 * primitives share one accent. Basemap layers all share a single, deliberately
 * muted hue from the "Sepia" preset so they recede behind the thematic primitives.
 */
export const VIZ_PRIMITIVE_ACCENT_COLORS: readonly string[] = VIF_MIXTE_COLORS;
export const BASEMAP_LAYER_ACCENT_COLOR: string = SEPIA_MIXTE_COLORS[0];

/** Stable accent color for the visualization at `visualizationIndex` (cycles the palette). */
export function getVisualizationAccentColor(
  visualizationIndex: number
): string {
  const palette = VIZ_PRIMITIVE_ACCENT_COLORS;
  const length = palette.length;
  return palette[((visualizationIndex % length) + length) % length];
}
