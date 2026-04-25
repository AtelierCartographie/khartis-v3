import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BasemapStyle, getBasemapStyle } from './basemap-styles';

describe('basemap styles', () => {
  it('keeps every tiled style backed by a static MapLibre style file', () => {
    for (const style of Object.values(BasemapStyle)) {
      if (style === BasemapStyle.BLANK_WHITE) {
        continue;
      }

      const styleUrl = getBasemapStyle(style);

      expect(typeof styleUrl).toBe('string');
      if (typeof styleUrl !== 'string') {
        throw new Error(`Expected ${style} to resolve to a static style URL`);
      }

      expect(new URL(styleUrl, 'http://localhost').pathname).toBe(
        `/basemaps/styles/${style}.json`
      );
      expect(
        existsSync(
          join(process.cwd(), 'static', 'basemaps', 'styles', `${style}.json`)
        )
      ).toBe(true);
    }
  });
});
