import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXAMPLE_PROJECTS } from '$lib/features/commons/constants/examples.data';

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

  it('keeps the European population example joined to countries but framed on Europe', () => {
    expect(
      EXAMPLE_PROJECTS.find((example) => example.id === 'world-population')
    ).toMatchObject({
      baseMapId: 'monde-countries-2024-medium',
      referenceBasemapId: 'europe-nuts1-2024-medium'
    });
  });
});
