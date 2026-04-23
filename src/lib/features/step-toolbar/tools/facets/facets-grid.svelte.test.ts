import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'facets-grid.svelte'),
  'utf8'
);

describe('FacetsGrid synchronized viewport controller', () => {
  it('delegates facet rendering to the shared multi-view renderer', () => {
    expect(source).toContain(
      "import FacetsSharedRenderer from './facets-shared-renderer.svelte';"
    );
    expect(source).toContain('<FacetsSharedRenderer');
    expect(source).not.toContain('ThematicMap');
    expect(source).not.toContain('setSynchronizedViewportController');
  });
});
