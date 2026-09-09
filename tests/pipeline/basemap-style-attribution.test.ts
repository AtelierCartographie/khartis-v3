import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BasemapStyle,
  getBasemapStyleAttribution
} from '$lib/features/map/constants/basemap-styles';

interface StyleSource {
  attribution?: string;
}

function declaredAttributions(style: BasemapStyle): string[] {
  const path = resolve(process.cwd(), `static/basemaps/styles/${style}.json`);
  const sources = JSON.parse(readFileSync(path, 'utf8')).sources as Record<
    string,
    StyleSource
  >;

  const seen: string[] = [];
  for (const source of Object.values(sources)) {
    const credit = source.attribution
      ?.replace(/<[^>]*>/g, '')
      .replace(/&copy;/gi, '©')
      .replace(/&amp;/gi, '&')
      .trim();
    if (credit && !seen.includes(credit)) seen.push(credit);
  }
  return seen;
}

const TILED_STYLES = Object.values(BasemapStyle).filter(
  (style) => style !== BasemapStyle.BLANK_WHITE
);

describe('getBasemapStyleAttribution', () => {
  it.each(TILED_STYLES)(
    'credits every provider the %s style declares',
    (style) => {
      const shown = getBasemapStyleAttribution(style);
      expect(shown).not.toBe('');
      for (const credit of declaredAttributions(style)) {
        expect(shown).toContain(credit);
      }
    }
  );

  it('credits nobody for the blank basemap', () => {
    expect(getBasemapStyleAttribution(BasemapStyle.BLANK_WHITE)).toBe('');
  });
});
