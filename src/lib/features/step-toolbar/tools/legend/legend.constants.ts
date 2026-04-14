import {
  AVAILABLE_FONTS,
  FONT_SIZES
} from '$lib/features/step-toolbar/constants/fonts.constants';

export { AVAILABLE_FONTS };
export const LEGEND_FONT_SIZES = FONT_SIZES;

export const LEGEND_DEFAULTS = {
  FONT_FAMILY: 'Cabin' as const,
  FONT_SIZE: 12 as number,
  OPACITY: 100 as number
};

export const LEGEND_ID_PREFIXES = {
  VIZ: 'legend-viz-',
  CUSTOM: 'legend-'
} as const;

export const DOM_IDS = {
  LEGEND_TOOL: 'khartis-legend-tool',
  FONT_SELECT: 'legend-font-select',
  FONT_SIZE: 'legend-font-size'
} as const;

export const CSS_CLASSES = {
  LEGEND_TABS: 'legend-tabs'
} as const;
