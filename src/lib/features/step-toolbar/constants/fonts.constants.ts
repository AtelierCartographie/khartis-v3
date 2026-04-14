export const AVAILABLE_FONTS = [
  'Cabin',
  'IBM Plex Sans',
  'Inter',
  'Lato',
  'Open Sans'
] as const;

export const FONT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24] as const;

export type AvailableFont = (typeof AVAILABLE_FONTS)[number];
export type FontSize = (typeof FONT_SIZES)[number];
