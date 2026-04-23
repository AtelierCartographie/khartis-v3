import { DEFAULT_FONT_FAMILY } from '$lib/features/step-toolbar/constants/fonts.constants';
import { PRINT_STANDARD_TOKENS } from '$lib/features/commons/utils/layout-sizing.utils';

export const LEGEND_DEFAULTS = {
  FONT_FAMILY: DEFAULT_FONT_FAMILY,
  FONT_SIZE: PRINT_STANDARD_TOKENS.legend.fontSize,
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
