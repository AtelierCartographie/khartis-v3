import type { JoinTerritoryStatus } from '$lib/features/duckdb';
import {
  NEUTRAL_CARTOGRAPHY_COLORS,
  NEUTRAL_CARTOGRAPHY_RGBA_COLORS
} from '$lib/features/commons/constants/colors.constants';
import type { PatternPaletteConfig } from '$lib/features/commons/constants/pattern.constants';

export const JOIN_CONTROL_STATUSES: readonly JoinTerritoryStatus[] = [
  'matched',
  'check',
  'duplicate',
  'no_data'
];

// The join panel's category colors, so the map reads like the panel. The
// territories without data, ignored values included, stay in the background.
export const JOIN_CONTROL_FILL_COLORS: Record<JoinTerritoryStatus, string> = {
  matched: '#24a148',
  check: '#f1c21b',
  duplicate: '#da1e28',
  no_data: '#ebebeb'
};

// Red and green read alike under deuteranopia: repeated territories also carry
// a motif.
export const JOIN_CONTROL_PATTERNS: Partial<
  Record<JoinTerritoryStatus, PatternPaletteConfig>
> = {
  duplicate: { shape: 'cross', scale: 0.7, color: '#ffffff' },
  no_data: {
    shape: 'line',
    angle: 45,
    scale: 0.7,
    color: NEUTRAL_CARTOGRAPHY_COLORS.missingData
  }
};

export const JOIN_CONTROL_OUTLINE_COLOR: [number, number, number, number] = [
  ...NEUTRAL_CARTOGRAPHY_RGBA_COLORS.boundaryFine
];
export const JOIN_CONTROL_OUTLINE_WIDTH_PX = 0.5;

// Below this share of the basemap extent a territory spans fewer than about
// ten pixels at the fitted view, too few to read its fill or hover it: a
// marker stands in for it.
export const JOIN_CONTROL_SMALL_TERRITORY_RATIO = 0.012;
// Only the territories to fix get a marker.
export const JOIN_CONTROL_MARKER_STATUSES: readonly JoinTerritoryStatus[] = [
  'check',
  'duplicate'
];
export const JOIN_CONTROL_MARKER_RADIUS_PX = 5;
export const JOIN_CONTROL_MARKER_STROKE_WIDTH_PX = 1.5;
export const JOIN_CONTROL_MARKER_STROKE_COLOR: [
  number,
  number,
  number,
  number
] = [22, 22, 22, 255];
