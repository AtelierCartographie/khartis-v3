import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const exampleThumbnailSources = [
  'world-population-thumb.svg',
  'european-cities-thumb.svg',
  'world-countries-thumb.svg',
  'gdp-evolution-thumb.svg',
  'transport-flows-thumb.svg'
].map((fileName) =>
  readFileSync(
    resolve(import.meta.dirname, '../../../../../static/examples', fileName),
    'utf8'
  )
);

describe('try-with-example project initialization', () => {
  it('keeps bundled example thumbnails on a white background', () => {
    for (const thumbnailSource of exampleThumbnailSources) {
      expect(thumbnailSource).toContain('fill="#ffffff"');
      expect(thumbnailSource).not.toContain('#f4f4f4');
    }
  });
});
