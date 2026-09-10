import { describe, expect, it } from 'vitest';
import { SLIDER_LIMITS } from '$lib/features/commons/constants/visualization.constants';
import {
  DEFAULT_TEXT_LINE_HEIGHT,
  EXPLICIT_TEXT_CHARACTER_SET,
  MAX_TEXT_OUTLINE_WIDTH,
  TEXT_ATLAS_BUFFER,
  TEXT_ATLAS_FONT_SIZE,
  TEXT_ATLAS_RADIUS,
  extendTextCharacterSet,
  resolveTextFontSettings,
  resolveTextHaloWidthPx,
  resolveTextOutlineWidth,
  resolveTextSmoothing
} from './text-character-set';

const SDF_EDGE_ALPHA = 0.75;
// deck.gl only reads glyph distances that fit inside the atlas padding, so the
// widest outline the shader can draw is what bounds the halo in pixels.
const maxHaloWidthPx = (textSize: number) =>
  (MAX_TEXT_OUTLINE_WIDTH * SDF_EDGE_ALPHA * textSize) / TEXT_ATLAS_FONT_SIZE;

const FRENCH_DEPARTMENT_GLYPHS = [
  'A',
  'É',
  'È',
  'Ê',
  'Ë',
  'À',
  'Â',
  'Ç',
  'Î',
  'Ï',
  'Ô',
  'Ö',
  'Ù',
  'Û',
  'Ü',
  'Ÿ',
  'Œ',
  'Æ',
  'é',
  'è',
  'ê',
  'à',
  'ç',
  'ô',
  '-',
  ' ',
  "'"
];

const TYPOGRAPHIC_GLYPHS = ['–', '—', '‘', '’', '“', '”', '•', '…', '°'];

const EUROPEAN_EXTENDED_GLYPHS = ['Ł', 'Ś', 'Ž', 'Č', 'Š', 'Ş', 'Ğ', 'Đ'];

describe('text-character-set — coverage', () => {
  it('contains all French department-name glyphs', () => {
    const set = new Set(EXPLICIT_TEXT_CHARACTER_SET);
    for (const glyph of FRENCH_DEPARTMENT_GLYPHS) {
      expect(set.has(glyph)).toBe(true);
    }
  });

  it('contains common typographic punctuation that real datasets emit', () => {
    const set = new Set(EXPLICIT_TEXT_CHARACTER_SET);
    for (const glyph of TYPOGRAPHIC_GLYPHS) {
      expect(set.has(glyph)).toBe(true);
    }
  });

  it('covers Latin Extended-A so non-French European names render', () => {
    const set = new Set(EXPLICIT_TEXT_CHARACTER_SET);
    for (const glyph of EUROPEAN_EXTENDED_GLYPHS) {
      expect(set.has(glyph)).toBe(true);
    }
  });

  it('does not include ASCII control characters that break the SDF atlas', () => {
    for (const char of EXPLICIT_TEXT_CHARACTER_SET) {
      const codePoint = char.codePointAt(0);
      expect(codePoint).toBeGreaterThanOrEqual(0x20);
      const isC1Control = codePoint! >= 0x80 && codePoint! <= 0x9f;
      expect(isC1Control).toBe(false);
    }
  });

  it('exposes a frozen reference so a shared instance is safe to pass to Deck.gl', () => {
    expect(Object.isFrozen(EXPLICIT_TEXT_CHARACTER_SET)).toBe(true);
  });

  it('contains no duplicate glyphs', () => {
    const set = new Set(EXPLICIT_TEXT_CHARACTER_SET);
    expect(set.size).toBe(EXPLICIT_TEXT_CHARACTER_SET.length);
  });
});

describe('text-character-set — SDF atlas geometry', () => {
  it('keeps the glyph padding wide enough for the widest outline it must encode', () => {
    const maxOutlineAtlasPx = MAX_TEXT_OUTLINE_WIDTH * SDF_EDGE_ALPHA;
    expect(maxOutlineAtlasPx).toBeLessThan(TEXT_ATLAS_BUFFER);
    expect(maxOutlineAtlasPx).toBeLessThanOrEqual(
      TEXT_ATLAS_RADIUS * SDF_EDGE_ALPHA
    );
  });

  it('keeps every glyph cell small enough for a 4096px atlas on any GPU', () => {
    // Deck.gl lays 1024px-wide rows out and rounds the atlas height to a power
    // of two; a 40px font with 20px padding leaves the full character set well
    // inside 4096px, where fontSize 64 / buffer 48 needed 16384px.
    expect(TEXT_ATLAS_FONT_SIZE + 2 * TEXT_ATLAS_BUFFER).toBeLessThanOrEqual(
      128
    );
  });
});

describe('resolveTextFontSettings', () => {
  it('always renders through the SDF atlas so glyphs stay sharp at any scale', () => {
    expect(resolveTextFontSettings(10).sdf).toBe(true);
    expect(resolveTextFontSettings(64).sdf).toBe(true);
  });

  it('exposes the shared atlas geometry so a single atlas serves every layer', () => {
    const settings = resolveTextFontSettings(12);
    expect(settings.fontSize).toBe(TEXT_ATLAS_FONT_SIZE);
    expect(settings.buffer).toBe(TEXT_ATLAS_BUFFER);
    expect(settings.radius).toBe(TEXT_ATLAS_RADIUS);
  });
});

describe('resolveTextSmoothing', () => {
  it('narrows the antialiasing ramp as the rendered size grows', () => {
    expect(resolveTextSmoothing(24)).toBeLessThan(resolveTextSmoothing(10));
  });

  it('keeps the ramp near a third of a pixel wide instead of a fixed slice of the glyph', () => {
    for (const size of [8, 12, 24, 48]) {
      const rampPx =
        (resolveTextSmoothing(size) * TEXT_ATLAS_RADIUS * size) /
        TEXT_ATLAS_FONT_SIZE;
      expect(rampPx).toBeLessThan(1);
    }
  });

  it('falls back to the widest ramp for an unusable size', () => {
    expect(resolveTextSmoothing(0)).toBe(resolveTextSmoothing(1));
    expect(resolveTextSmoothing(Number.NaN)).toBe(resolveTextSmoothing(1));
  });
});

describe('resolveTextOutlineWidth', () => {
  it('returns 0 when the contour is disabled or the inputs are unusable', () => {
    expect(resolveTextOutlineWidth(0, 12)).toBe(0);
    expect(resolveTextOutlineWidth(-5, 12)).toBe(0);
    expect(resolveTextOutlineWidth(Number.NaN, 12)).toBe(0);
    expect(resolveTextOutlineWidth(2, 0)).toBe(0);
  });

  it('renders the configured thickness as that many pixels of halo', () => {
    for (const haloWidth of [0.5, 1, 2, 4]) {
      expect(
        resolveTextHaloWidthPx(resolveTextOutlineWidth(haloWidth, 12), 12)
      ).toBeCloseTo(haloWidth, 5);
    }
  });

  it('separates every step of the slider instead of collapsing them', () => {
    const steps = [0.5, 1, 1.5, 2, 2.5, 3].map((halo) =>
      resolveTextHaloWidthPx(resolveTextOutlineWidth(halo, 12), 12)
    );
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i] - steps[i - 1]).toBeGreaterThan(0.4);
    }
  });

  it('asks for a wider outline on small text so the halo stays the same pixel width', () => {
    expect(resolveTextOutlineWidth(2, 8)).toBeGreaterThan(
      resolveTextOutlineWidth(2, 24)
    );
  });

  it('clamps to what the atlas can encode instead of cropping the halo', () => {
    const textSize = 8;
    const beyondAtlas = maxHaloWidthPx(textSize) * 4;
    expect(resolveTextOutlineWidth(beyondAtlas, textSize)).toBe(
      MAX_TEXT_OUTLINE_WIDTH
    );
  });

  it('reaches the top of the slider at the default label size', () => {
    expect(maxHaloWidthPx(10)).toBeGreaterThanOrEqual(
      SLIDER_LIMITS.haloWidth.max
    );
  });
});

describe('resolveTextHaloWidthPx', () => {
  it('returns 0 when the outline width or the text size is unusable', () => {
    expect(resolveTextHaloWidthPx(0, 12)).toBe(0);
    expect(resolveTextHaloWidthPx(-1, 12)).toBe(0);
    expect(resolveTextHaloWidthPx(Number.NaN, 12)).toBe(0);
    expect(resolveTextHaloWidthPx(4, 0)).toBe(0);
  });

  it('scales with the glyph so an SVG export mirrors what the GPU draws', () => {
    const outlineWidth = resolveTextOutlineWidth(2, 12);
    expect(resolveTextHaloWidthPx(outlineWidth, 24)).toBeCloseTo(4, 5);
  });
});

describe('text-character-set — DEFAULT_TEXT_LINE_HEIGHT', () => {
  it('leaves room between primary and secondary label rows', () => {
    expect(DEFAULT_TEXT_LINE_HEIGHT).toBeGreaterThan(1);
    expect(DEFAULT_TEXT_LINE_HEIGHT).toBeLessThanOrEqual(1.3);
  });
});

describe('extendTextCharacterSet', () => {
  it('returns the base set when no extras are provided', () => {
    expect(extendTextCharacterSet(undefined)).toBe(EXPLICIT_TEXT_CHARACTER_SET);
    expect(extendTextCharacterSet('')).toBe(EXPLICIT_TEXT_CHARACTER_SET);
    expect(extendTextCharacterSet([])).toBe(EXPLICIT_TEXT_CHARACTER_SET);
    expect(extendTextCharacterSet(new Set<string>())).toBe(
      EXPLICIT_TEXT_CHARACTER_SET
    );
  });

  it('appends only characters not already in the base set', () => {
    const extended = extendTextCharacterSet(['A', 'A', '猫', 'á', '猫']);
    expect(extended).not.toBe(EXPLICIT_TEXT_CHARACTER_SET);
    expect(extended).toContain('猫');
    const occurrences = extended.filter((char) => char === '猫').length;
    expect(occurrences).toBe(1);
  });

  it('accepts a string and a Set, returning a frozen array', () => {
    const fromString = extendTextCharacterSet('猫犬');
    const fromSet = extendTextCharacterSet(new Set(['猫', '犬']));
    expect(Object.isFrozen(fromString)).toBe(true);
    expect(Object.isFrozen(fromSet)).toBe(true);
    expect(fromString).toContain('猫');
    expect(fromString).toContain('犬');
    expect(fromSet).toContain('猫');
    expect(fromSet).toContain('犬');
  });

  it('keeps the pinned base reference when data only uses covered glyphs', () => {
    expect(extendTextCharacterSet(['Paris', 'Lyon', 'Marseille'])).toBe(
      EXPLICIT_TEXT_CHARACTER_SET
    );
  });

  it('ignores control characters while extending with real label glyphs', () => {
    const extended = extendTextCharacterSet('東京\n大阪\u007f');
    expect(extended).toContain('東');
    expect(extended).toContain('京');
    expect(extended).toContain('大');
    expect(extended).toContain('阪');
    expect(extended).not.toContain('\n');
    expect(extended).not.toContain('\u007f');
  });
});
