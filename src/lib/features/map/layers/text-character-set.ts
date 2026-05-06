const ASCII_PRINTABLE_START = 0x20;
const ASCII_PRINTABLE_END = 0x7e;

const LATIN_1_SUPPLEMENT_START = 0xa0;
const LATIN_1_SUPPLEMENT_END = 0xff;

const LATIN_EXTENDED_A_START = 0x0100;
const LATIN_EXTENDED_A_END = 0x017f;

const LATIN_EXTENDED_B_USEFUL_START = 0x0180;
const LATIN_EXTENDED_B_USEFUL_END = 0x024f;

const COMBINING_DIACRITICS_START = 0x0300;
const COMBINING_DIACRITICS_END = 0x036f;

const TYPOGRAPHIC_PUNCTUATION = [
  '‐',
  '‑',
  '‒',
  '–',
  '—',
  '―',
  '‘',
  '’',
  '‚',
  '‛',
  '“',
  '”',
  '„',
  '‟',
  '†',
  '‡',
  '•',
  '…',
  '‰',
  '′',
  '″',
  '‹',
  '›',
  ' ',
  ' ',
  '⁠'
] as const;

const CURRENCY_AND_LETTERLIKE = [
  '€',
  '£',
  '¥',
  '¢',
  '₽',
  '№',
  '™',
  '®',
  '©',
  'Ω',
  'ℓ'
] as const;

const SUPERSCRIPTS_AND_FRACTIONS = ['²', '³', '¹', '¼', '½', '¾', '°'] as const;

const ARROWS_AND_GEOMETRIC = [
  '←',
  '↑',
  '→',
  '↓',
  '■',
  '○',
  '●',
  '▲',
  '▼',
  '◆',
  '★',
  '☆'
] as const;

export const DEFAULT_TEXT_FONT_SETTINGS_SDF = {
  sdf: true,
  fontSize: 64,
  buffer: 6,
  radius: 12
} as const;

export const DEFAULT_TEXT_FONT_SETTINGS_RASTER = {
  sdf: false,
  fontSize: 32,
  buffer: 4
} as const;

export const DEFAULT_TEXT_FONT_SETTINGS = DEFAULT_TEXT_FONT_SETTINGS_SDF;

export type TextFontSettingsHaloMode = 'halo-on' | 'halo-off';

export function resolveTextFontSettings(
  mode: TextFontSettingsHaloMode
):
  | typeof DEFAULT_TEXT_FONT_SETTINGS_SDF
  | typeof DEFAULT_TEXT_FONT_SETTINGS_RASTER {
  return mode === 'halo-on'
    ? DEFAULT_TEXT_FONT_SETTINGS_SDF
    : DEFAULT_TEXT_FONT_SETTINGS_RASTER;
}

export const DEFAULT_TEXT_LINE_HEIGHT = 1.15;

function rangeToChars(start: number, end: number): string[] {
  const chars: string[] = [];
  for (let codePoint = start; codePoint <= end; codePoint += 1) {
    chars.push(String.fromCodePoint(codePoint));
  }
  return chars;
}

function buildBaseCharacterSet(): string[] {
  const sources: readonly string[][] = [
    rangeToChars(ASCII_PRINTABLE_START, ASCII_PRINTABLE_END),
    rangeToChars(LATIN_1_SUPPLEMENT_START, LATIN_1_SUPPLEMENT_END),
    rangeToChars(LATIN_EXTENDED_A_START, LATIN_EXTENDED_A_END),
    rangeToChars(LATIN_EXTENDED_B_USEFUL_START, LATIN_EXTENDED_B_USEFUL_END),
    rangeToChars(COMBINING_DIACRITICS_START, COMBINING_DIACRITICS_END),
    [...TYPOGRAPHIC_PUNCTUATION],
    [...CURRENCY_AND_LETTERLIKE],
    [...SUPERSCRIPTS_AND_FRACTIONS],
    [...ARROWS_AND_GEOMETRIC]
  ];
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const source of sources) {
    for (const char of source) {
      if (seen.has(char)) continue;
      seen.add(char);
      merged.push(char);
    }
  }
  return merged;
}

export const EXPLICIT_TEXT_CHARACTER_SET: string[] = Object.freeze(
  buildBaseCharacterSet()
) as string[];

export function extendTextCharacterSet(
  extra: readonly string[] | string | Set<string> | undefined
): string[] {
  if (!extra) return EXPLICIT_TEXT_CHARACTER_SET;
  const extras =
    typeof extra === 'string'
      ? Array.from(extra)
      : extra instanceof Set
        ? Array.from(extra)
        : Array.from(extra);
  if (extras.length === 0) return EXPLICIT_TEXT_CHARACTER_SET;
  const seen = new Set(EXPLICIT_TEXT_CHARACTER_SET);
  const merged = [...EXPLICIT_TEXT_CHARACTER_SET];
  for (const char of extras) {
    if (!char || seen.has(char)) continue;
    seen.add(char);
    merged.push(char);
  }
  return Object.freeze(merged) as string[];
}
