import type { Color } from '@deck.gl/core';

import { DEFAULT_COLORS } from '$lib/features/commons/constants/visualization.constants';
import { PRINT_STANDARD_TOKENS } from '$lib/features/commons/utils/layout-sizing.utils';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import {
  CARTOGRAPHIC_FONT_FAMILY,
  resolveFontFamilyStack
} from '$lib/features/step-toolbar';

export const DEFAULT_TEXT_SIZE = PRINT_STANDARD_TOKENS.annotations.noteFontSize;
export const DEFAULT_HALO_WIDTH = 2;

const DEFAULT_TEXT_FONT = resolveFontFamilyStack(CARTOGRAPHIC_FONT_FAMILY);

export const DEFAULT_TEXT_MASK_PADDING: [number, number] = [3, 1];
export const TEXT_COLLISION_SAFE_PADDING: [number, number] = [4, 4];
export const TRANSPARENT_BACKGROUND_COLOR: Color = [0, 0, 0, 0];
export const DEFAULT_LABEL_COLOR = hexToRgb(DEFAULT_COLORS.text);
export const DEFAULT_TEXT_COLOR = hexToRgb(DEFAULT_COLORS.text);

export function resolveDeckTextFontWeight(
  weight: string | number,
  italic = false
): string | number {
  return italic ? `italic ${weight}` : weight;
}

export function resolveDeckTextFontFamily(fontFamily?: string): string {
  return resolveFontFamilyStack(fontFamily) || DEFAULT_TEXT_FONT;
}
