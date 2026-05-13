import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEXT_FONT_SETTINGS,
  DEFAULT_TEXT_FONT_SETTINGS_RASTER,
  DEFAULT_TEXT_FONT_SETTINGS_SDF,
  DEFAULT_TEXT_LINE_HEIGHT,
  EXPLICIT_TEXT_CHARACTER_SET,
  extendTextCharacterSet,
  resolveTextFontSettings
} from './text-character-set';

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

describe('text-character-set — DEFAULT_TEXT_FONT_SETTINGS_SDF', () => {
  it('keeps SDF mode on for crisp halos and thin strokes', () => {
    expect(DEFAULT_TEXT_FONT_SETTINGS_SDF.sdf).toBe(true);
  });

  it('uses the Deck.gl default atlas resolution so the SDF canvas stays under WebGL texture limits', () => {
    expect(DEFAULT_TEXT_FONT_SETTINGS_SDF.fontSize).toBeLessThanOrEqual(64);
  });

  it('keeps buffer and radius proportionate to fontSize for clean halos and downsampling', () => {
    expect(DEFAULT_TEXT_FONT_SETTINGS_SDF.buffer).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_TEXT_FONT_SETTINGS_SDF.radius).toBeGreaterThanOrEqual(8);
    const ratio =
      DEFAULT_TEXT_FONT_SETTINGS_SDF.radius /
      DEFAULT_TEXT_FONT_SETTINGS_SDF.fontSize;
    expect(ratio).toBeGreaterThanOrEqual(0.15);
  });

  it('leaves cutoff and smoothing at the Deck.gl defaults to avoid hand-drawn looking glyphs', () => {
    expect(
      (DEFAULT_TEXT_FONT_SETTINGS_SDF as { cutoff?: number }).cutoff
    ).toBeUndefined();
    expect(
      (DEFAULT_TEXT_FONT_SETTINGS_SDF as { smoothing?: number }).smoothing
    ).toBeUndefined();
  });

  it('aliases the legacy DEFAULT_TEXT_FONT_SETTINGS export to the SDF preset', () => {
    expect(DEFAULT_TEXT_FONT_SETTINGS).toBe(DEFAULT_TEXT_FONT_SETTINGS_SDF);
  });
});

describe('text-character-set — DEFAULT_TEXT_FONT_SETTINGS_RASTER', () => {
  it('disables SDF for pixel-perfect glyph rendering when no halo is required', () => {
    expect(DEFAULT_TEXT_FONT_SETTINGS_RASTER.sdf).toBe(false);
  });

  it('uses an atlas resolution close to typical label sizes to avoid downscaling artefacts', () => {
    expect(DEFAULT_TEXT_FONT_SETTINGS_RASTER.fontSize).toBeGreaterThanOrEqual(
      24
    );
    expect(DEFAULT_TEXT_FONT_SETTINGS_RASTER.fontSize).toBeLessThanOrEqual(48);
  });

  it('omits SDF-only fields like radius, cutoff, smoothing in raster mode', () => {
    const settings = DEFAULT_TEXT_FONT_SETTINGS_RASTER as Record<
      string,
      unknown
    >;
    expect(settings.radius).toBeUndefined();
    expect(settings.cutoff).toBeUndefined();
    expect(settings.smoothing).toBeUndefined();
  });
});

describe('resolveTextFontSettings', () => {
  it('returns the SDF preset when halo is required', () => {
    expect(resolveTextFontSettings('halo-on')).toBe(
      DEFAULT_TEXT_FONT_SETTINGS_SDF
    );
  });

  it('returns the raster preset when halo is disabled', () => {
    expect(resolveTextFontSettings('halo-off')).toBe(
      DEFAULT_TEXT_FONT_SETTINGS_RASTER
    );
  });

  it('returns stable references across calls so Deck.gl prop equality short-circuits atlas rebuilds', () => {
    expect(resolveTextFontSettings('halo-on')).toBe(
      resolveTextFontSettings('halo-on')
    );
    expect(resolveTextFontSettings('halo-off')).toBe(
      resolveTextFontSettings('halo-off')
    );
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
});

describe('text-character-set — adoption', () => {
  it('layer-factory.ts wires the auto character set into both TextLayers', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, 'layer-factory.ts'),
      'utf-8'
    );
    expect(source).toMatch(
      /import\s*\{[^}]*DECK_TEXT_CHARACTER_SET[^}]*\}\s*from\s*'\.\/text-character-set'/
    );
    expect(source).toMatch(
      /import\s*\{[^}]*resolveTextFontSettings[^}]*\}\s*from\s*'\.\/text-character-set'/
    );
    const autoMatches = source.match(/characterSet: DECK_TEXT_CHARACTER_SET/g);
    expect(autoMatches?.length).toBe(2);
    expect(source).not.toMatch(/characterSet:\s*EXPLICIT_TEXT_CHARACTER_SET/);
  });

  it('layer-factory.ts picks SDF fontSettings when halo is on, raster otherwise', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, 'layer-factory.ts'),
      'utf-8'
    );
    const haloOn = source.match(/'halo-on'/g);
    const haloOff = source.match(/'halo-off'/g);
    expect(haloOn?.length).toBe(2);
    expect(haloOff?.length).toBe(2);
    const resolveCalls = source.match(/resolveTextFontSettings\(/g);
    expect(resolveCalls?.length).toBe(2);
  });

  it('basemap-layers.ts wires the auto character set into the city labels GeoJsonLayer (no halo)', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, 'basemap-layers.ts'),
      'utf-8'
    );
    expect(source).toContain('textCharacterSet: DECK_TEXT_CHARACTER_SET');
    expect(source).toContain(
      'textFontSettings: DEFAULT_TEXT_FONT_SETTINGS_RASTER'
    );
    expect(source).toContain('textLineHeight: DEFAULT_TEXT_LINE_HEIGHT');
  });

  it('layer-factory.ts applies the shared lineHeight to every TextLayer', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, 'layer-factory.ts'),
      'utf-8'
    );
    const matches = source.match(/lineHeight: DEFAULT_TEXT_LINE_HEIGHT/g);
    expect(matches?.length).toBe(2);
  });
});
