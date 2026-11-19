export const FONT_CATEGORIES = [
  'sans',
  'condensed',
  'serif',
  'slab',
  'handwritten'
] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];

const GENERIC_FAMILY: Record<FontCategory, string> = {
  sans: 'sans-serif',
  condensed: 'sans-serif',
  serif: 'serif',
  slab: 'serif',
  handwritten: 'cursive'
};

/** Grouped and sorted as the font selects list them. */
const FONTS_BY_CATEGORY = {
  sans: [
    'Atkinson Hyperlegible',
    'Cabin',
    'IBM Plex Sans',
    'Inter',
    'Josefin Sans',
    'Lato',
    'Noto Sans',
    'Open Sans'
  ],
  condensed: ['Fira Sans Condensed', 'Roboto Condensed'],
  serif: [
    'EB Garamond',
    'IM Fell English',
    'Merriweather',
    'Noto Serif',
    'Source Serif 4'
  ],
  slab: ['Special Elite', 'Zilla Slab'],
  handwritten: ['Amatic SC', 'Caveat', 'Kalam', 'Patrick Hand']
} as const satisfies Record<FontCategory, readonly string[]>;

export type AvailableFont = (typeof FONTS_BY_CATEGORY)[FontCategory][number];

export const FONT_GROUPS: ReadonlyArray<{
  category: FontCategory;
  fonts: readonly AvailableFont[];
}> = FONT_CATEGORIES.map((category) => ({
  category,
  fonts: FONTS_BY_CATEGORY[category]
}));

export const AVAILABLE_FONTS: readonly AvailableFont[] = FONT_GROUPS.flatMap(
  (group) => group.fonts
);

/**
 * Loaded with the map before any label is drawn. The other fonts load the
 * first time a label layer asks for them, which keeps them off the start of
 * every project.
 */
export const PRELOADED_FONTS: readonly AvailableFont[] = [
  'Cabin',
  'IBM Plex Sans',
  'Inter',
  'Lato',
  'Noto Sans',
  'Open Sans'
];

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

const FONT_CATEGORY_BY_FONT = new Map<AvailableFont, FontCategory>(
  FONT_GROUPS.flatMap(({ category, fonts }) =>
    fonts.map((font) => [font, category] as const)
  )
);

function buildFontFamilyStack(font: AvailableFont): string {
  if (font === 'Noto Sans') {
    return '"Noto Sans", "Noto Sans Arabic", "Noto Sans SC", "Noto Sans JP", sans-serif';
  }
  const category = FONT_CATEGORY_BY_FONT.get(font) ?? 'sans';
  return `"${font}", ${GENERIC_FAMILY[category]}`;
}

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
    return buildFontFamilyStack(normalized);
  }

  if (!fontFamily?.trim()) {
    return buildFontFamilyStack(DEFAULT_FONT_FAMILY);
  }

  return fontFamily.includes(',')
    ? fontFamily
    : `"${stripFontQuotes(fontFamily)}", sans-serif`;
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

/** The `document.fonts.load` descriptors that bring one font's faces in. */
export function getFontFaceLoadRequests(font: AvailableFont): string[] {
  return FONT_LOAD_VARIANTS.flatMap(({ style, weight }) =>
    FONT_LOAD_SIZES_PX.map((size) => `${style} ${weight} ${size}px "${font}"`)
  );
}

export const FONT_FACE_LOAD_REQUESTS = PRELOADED_FONTS.flatMap(
  getFontFaceLoadRequests
);
