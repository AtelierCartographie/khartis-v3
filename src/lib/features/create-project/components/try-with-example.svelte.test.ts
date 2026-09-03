import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXAMPLE_PROJECTS } from '$lib/features/commons/constants/examples.data';

const STATIC_ROOT = resolve(import.meta.dirname, '../../../../../static');

describe('try-with-example project initialization', () => {
  it('ships a bundled thumbnail for every example', () => {
    for (const example of EXAMPLE_PROJECTS) {
      expect(example.thumbnail).toBeDefined();
      const fileName = example.thumbnail!.split('/').pop()!;
      expect(existsSync(resolve(STATIC_ROOT, 'examples', fileName))).toBe(true);
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
