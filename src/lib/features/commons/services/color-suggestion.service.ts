import { NEUTRAL_CARTOGRAPHY_COLORS } from '$lib/features/commons/constants/colors.constants';
import { GRAYSCALE_COLORS } from '$lib/features/commons/constants/qualitative-palette.constants';
import { darkenHex } from '$lib/features/commons/utils/color-utils';

export const COLOR_ROLE = {
  STROKE: 'stroke',
  MISSING_DATA: 'missing-data',
  TEXT_FILL: 'text-fill',
  TEXT_STROKE: 'text-stroke',
  BOUNDARY: 'boundary',
  TERRITORY_FILL: 'territory-fill',
  TERRITORY_STROKE: 'territory-stroke',
  SEA: 'sea'
} as const;

export type ColorRole = (typeof COLOR_ROLE)[keyof typeof COLOR_ROLE];

const { black, white, land, sea, missingData } = NEUTRAL_CARTOGRAPHY_COLORS;

const DARK_GRAY = '#525252';
const LIGHT_GRAY = '#e0e0e0';
const TERRITORY_GRAYS = ['#f4f4f4', '#e0e0e0', '#c6c6c6', '#a8a8a8'];

function shadesOf(color: string, ratios: number[]): string[] {
  return ratios.map((ratio) => darkenHex(color, ratio));
}

function withoutDuplicates(colors: string[]): string[] {
  const seen = new Set<string>();
  return colors.filter((color) => {
    const normalized = color.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/**
 * Quick picks offered before the full colour picker. They are role-aware: an
 * outline needs contrast against the fill it surrounds, a basemap layer needs
 * to stay neutral behind the data.
 */
export function getColorSuggestions(
  role: ColorRole,
  referenceColor?: string
): string[] {
  switch (role) {
    case COLOR_ROLE.STROKE:
      return withoutDuplicates([
        black,
        white,
        ...(referenceColor ? shadesOf(referenceColor, [0.35, 0.6]) : [])
      ]);
    case COLOR_ROLE.MISSING_DATA:
      return withoutDuplicates([missingData, ...GRAYSCALE_COLORS]);
    case COLOR_ROLE.TEXT_FILL:
      return [black, white, DARK_GRAY];
    case COLOR_ROLE.TEXT_STROKE:
      return [white, black, LIGHT_GRAY];
    case COLOR_ROLE.BOUNDARY:
      return withoutDuplicates([
        white,
        black,
        ...shadesOf(referenceColor ?? land, [0.3, 0.55])
      ]);
    case COLOR_ROLE.TERRITORY_FILL:
      return withoutDuplicates([land, ...TERRITORY_GRAYS]);
    case COLOR_ROLE.TERRITORY_STROKE:
      return withoutDuplicates([
        white,
        ...shadesOf(referenceColor ?? land, [0.25, 0.45, 0.65])
      ]);
    case COLOR_ROLE.SEA:
      return withoutDuplicates([sea, ...shadesOf(sea, [0.06, 0.14, 0.24])]);
  }
}
