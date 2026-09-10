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

export const TEXT_ATLAS_FONT_SIZE = 40;
export const TEXT_ATLAS_BUFFER = 20;
export const TEXT_ATLAS_RADIUS = 24;

// deck.gl thresholds the SDF alpha channel at `1 - TinySDF cutoff`; every
// distance below is glyph, every distance above is outline then background.
const SDF_EDGE_ALPHA = 0.75;
// Widest outline the atlas can encode: kept under TEXT_ATLAS_BUFFER so the
// antialiasing ramp still fits inside the glyph bitmap instead of being clipped.
const MAX_OUTLINE_ATLAS_PX = 16;
const TEXT_EDGE_SOFTNESS_PX = 0.35;
const MIN_TEXT_SMOOTHING = 0.005;
const MAX_TEXT_SMOOTHING = 0.08;

export const MAX_TEXT_OUTLINE_WIDTH = MAX_OUTLINE_ATLAS_PX / SDF_EDGE_ALPHA;

export interface TextFontSettings {
  sdf: true;
  fontSize: number;
  buffer: number;
  radius: number;
  smoothing: number;
}

const TEXT_ATLAS_SETTINGS = {
  sdf: true,
  fontSize: TEXT_ATLAS_FONT_SIZE,
  buffer: TEXT_ATLAS_BUFFER,
  radius: TEXT_ATLAS_RADIUS
} as const;

/**
 * deck.gl feathers glyph and outline edges over a fixed slice of the distance
 * field, so a constant smoothing turns into a blur that grows with the rendered
 * size. Scaling it back keeps the ramp around TEXT_EDGE_SOFTNESS_PX on screen.
 */
export function resolveTextSmoothing(renderedTextSize: number): number {
  if (!Number.isFinite(renderedTextSize) || renderedTextSize <= 0) {
    return MAX_TEXT_SMOOTHING;
  }
  const smoothing =
    (TEXT_EDGE_SOFTNESS_PX * TEXT_ATLAS_FONT_SIZE) /
    (TEXT_ATLAS_RADIUS * renderedTextSize);
  return Math.min(MAX_TEXT_SMOOTHING, Math.max(MIN_TEXT_SMOOTHING, smoothing));
}

export function resolveTextFontSettings(
  renderedTextSize: number
): TextFontSettings {
  return {
    ...TEXT_ATLAS_SETTINGS,
    smoothing: resolveTextSmoothing(renderedTextSize)
  };
}

/**
 * deck.gl expresses `outlineWidth` in atlas pixels divided by SDF_EDGE_ALPHA,
 * so the halo a glyph ends up wearing scales with `textSize / fontSize`.
 * Inverting that relation makes the configured thickness land as real pixels.
 */
export function resolveTextOutlineWidth(
  haloWidthPx: number,
  textSize: number
): number {
  if (
    !Number.isFinite(haloWidthPx) ||
    haloWidthPx <= 0 ||
    !Number.isFinite(textSize) ||
    textSize <= 0
  ) {
    return 0;
  }
  const outlineWidth =
    (haloWidthPx * TEXT_ATLAS_FONT_SIZE) / (SDF_EDGE_ALPHA * textSize);
  return Math.min(MAX_TEXT_OUTLINE_WIDTH, outlineWidth);
}

export function resolveTextHaloWidthPx(
  outlineWidth: number,
  textSize: number
): number {
  if (
    !Number.isFinite(outlineWidth) ||
    outlineWidth <= 0 ||
    !Number.isFinite(textSize) ||
    textSize <= 0
  ) {
    return 0;
  }
  const clamped = Math.min(MAX_TEXT_OUTLINE_WIDTH, outlineWidth);
  return (clamped * SDF_EDGE_ALPHA * textSize) / TEXT_ATLAS_FONT_SIZE;
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
