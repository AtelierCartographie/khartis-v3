export const AVAILABLE_FONTS = [
  'Open Sans',
  'Cabin',
  'IBM Plex Sans',
  'Inter',
  'Lato',
  'Noto Sans'
] as const;

export type AvailableFont = (typeof AVAILABLE_FONTS)[number];
export const DEFAULT_FONT_FAMILY: AvailableFont = 'Cabin';
export const CARTOGRAPHIC_FONT_FAMILY: AvailableFont = 'Open Sans';
export const FONT_SIZES = [
  6, 8, 10, 12, 14, 16, 18, 20, 24, 32, 48, 64
] as const;
export type FontSize = (typeof FONT_SIZES)[number];
export const FONT_SIZE_OPTIONS = FONT_SIZES.map((size) => String(size));

export const MIN_FONT_SIZE: FontSize = FONT_SIZES[0];
export const MAX_FONT_SIZE: FontSize = FONT_SIZES[FONT_SIZES.length - 1];
export const DEFAULT_FONT_SIZE: FontSize = 8;

const FONT_FAMILY_STACKS: Record<AvailableFont, string> = {
  Cabin: '"Cabin", sans-serif',
  'IBM Plex Sans': '"IBM Plex Sans", sans-serif',
  Inter: '"Inter", sans-serif',
  Lato: '"Lato", sans-serif',
  'Open Sans': '"Open Sans", sans-serif',
  'Noto Sans':
    '"Noto Sans", "Noto Sans Arabic", "Noto Sans SC", "Noto Sans JP", sans-serif'
};

const FONT_FAMILY_NAMES: Record<AvailableFont, string> = {
  Cabin: '"Cabin"',
  'IBM Plex Sans': '"IBM Plex Sans"',
  Inter: '"Inter"',
  Lato: '"Lato"',
  'Open Sans': '"Open Sans"',
  'Noto Sans': '"Noto Sans"'
};

const FONT_LOAD_VARIANTS = [
  { style: 'normal', weight: 400 },
  { style: 'italic', weight: 400 },
  { style: 'normal', weight: 700 },
  { style: 'italic', weight: 700 }
] as const;

const FONT_LOAD_SIZES_PX = [16, 96] as const;

function stripFontQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

export function isAvailableFont(value: string): value is AvailableFont {
  return AVAILABLE_FONTS.some((font) => font === value);
}

export function isAvailableFontSize(value: number): value is FontSize {
  return FONT_SIZES.some((fontSize) => fontSize === value);
}

export function normalizeFontFamily(
  fontFamily?: string | null
): AvailableFont | undefined {
  if (!fontFamily) {
    return undefined;
  }

  const firstFont = stripFontQuotes(fontFamily.split(',')[0] ?? fontFamily);
  return isAvailableFont(firstFont) ? firstFont : undefined;
}

export function resolveFontFamilyStack(fontFamily?: string | null): string {
  const normalized = normalizeFontFamily(fontFamily);
  if (normalized) {
    return FONT_FAMILY_STACKS[normalized];
  }

  if (!fontFamily?.trim()) {
    return FONT_FAMILY_STACKS[DEFAULT_FONT_FAMILY];
  }

  return fontFamily.includes(',')
    ? fontFamily
    : `"${stripFontQuotes(fontFamily)}", sans-serif`;
}

function resolveFontFaceFamily(fontFamily?: string | null): string {
  const normalized = normalizeFontFamily(fontFamily);
  return normalized
    ? FONT_FAMILY_NAMES[normalized]
    : FONT_FAMILY_NAMES[DEFAULT_FONT_FAMILY];
}

export function clampFontSize(
  value: number | string | undefined,
  fallback: number = DEFAULT_FONT_SIZE
): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : fallback;

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, numericValue));
}

export function resolveFontSizeOptions(
  value: number | string | undefined
): string[] {
  const nextSize = String(clampFontSize(value));
  if (FONT_SIZE_OPTIONS.includes(nextSize)) {
    return FONT_SIZE_OPTIONS;
  }

  return [...FONT_SIZE_OPTIONS, nextSize].sort(
    (left, right) => Number(left) - Number(right)
  );
}

export const FONT_FACE_LOAD_REQUESTS = AVAILABLE_FONTS.flatMap((fontFamily) =>
  FONT_LOAD_VARIANTS.flatMap(({ style, weight }) =>
    FONT_LOAD_SIZES_PX.map(
      (size) =>
        `${style} ${weight} ${size}px ${resolveFontFaceFamily(fontFamily)}`
    )
  )
);
