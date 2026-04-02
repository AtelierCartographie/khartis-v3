export const LEGEND_DEFAULTS = {
  FONT_FAMILY: 'Cabin' as const,
  FONT_SIZE: 12 as number,
  OPACITY: 100 as number
};

export const LEGEND_FONT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24] as const;

export const AVAILABLE_FONTS = [
  'Cabin',
  'IBM Plex Sans',
  'Inter',
  'Lato',
  'Open Sans'
] as const;

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
