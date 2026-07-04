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

export const TEXT_HALO_ATLAS_RADIUS = 32;
export const TEXT_HALO_ATLAS_BUFFER = 48;

export const MAX_TEXT_OUTLINE_WIDTH = 0.5;

export const DEFAULT_TEXT_FONT_SETTINGS_SDF = {
  sdf: true,
  fontSize: 64,
  buffer: TEXT_HALO_ATLAS_BUFFER,
  radius: TEXT_HALO_ATLAS_RADIUS
} as const;

export const DEFAULT_TEXT_FONT_SETTINGS_RASTER = {
  sdf: false,
  fontSize: 32,
  buffer: 4
} as const;

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

export function resolveTextOutlineWidth(
  haloWidth: number,
  maxHaloWidth: number
): number {
  if (!Number.isFinite(haloWidth) || haloWidth <= 0 || maxHaloWidth <= 0) {
    return 0;
  }
  const ratio = Math.min(haloWidth / maxHaloWidth, 1);
  return MAX_TEXT_OUTLINE_WIDTH * Math.sqrt(ratio);
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

function isSupportedTextCharacter(char: string): boolean {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return false;
  if (codePoint < ASCII_PRINTABLE_START) return false;
  return codePoint < 0x7f || codePoint > 0x9f;
}

function* iterateTextCharacters(
  extra: readonly string[] | string | Set<string>
): Iterable<string> {
  const values =
    typeof extra === 'string'
      ? [extra]
      : extra instanceof Set
        ? Array.from(extra)
        : Array.from(extra);

  for (const value of values) {
    for (const char of value) {
      yield char;
    }
  }
}

export function extendTextCharacterSet(
  extra: readonly string[] | string | Set<string> | undefined
): string[] {
  if (!extra) return EXPLICIT_TEXT_CHARACTER_SET;
  const seen = new Set(EXPLICIT_TEXT_CHARACTER_SET);
  const merged = [...EXPLICIT_TEXT_CHARACTER_SET];
  let added = false;
  for (const char of iterateTextCharacters(extra)) {
    if (!isSupportedTextCharacter(char) || seen.has(char)) continue;
    seen.add(char);
    merged.push(char);
    added = true;
  }
  if (!added) return EXPLICIT_TEXT_CHARACTER_SET;
  return Object.freeze(merged) as string[];
}
