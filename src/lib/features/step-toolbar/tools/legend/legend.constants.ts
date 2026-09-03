import {
  CARTOGRAPHIC_FONT_FAMILY,
  DEFAULT_FONT_SIZE
} from '$lib/features/step-toolbar/fonts.constants';

export const LEGEND_DEFAULTS = {
  FONT_FAMILY: CARTOGRAPHIC_FONT_FAMILY,
  FONT_SIZE: DEFAULT_FONT_SIZE as number,
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
