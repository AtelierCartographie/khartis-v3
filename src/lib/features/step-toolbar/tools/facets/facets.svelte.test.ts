import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'facets.svelte'),
  'utf8'
);

describe('facets tool scale mode UI', () => {
  it('exposes the shared scale switch through the facets panel', () => {
    expect(source).toContain(
      "import Switch from '$lib/features/commons/components/switch.svelte';"
    );
    expect(source).toContain('m.facets_scale_shared_label()');
    expect(source).toContain('handleScaleModeChange');
    expect(source).toContain('facetsStore.toggleScaleMode()');
  });

  it('uses dedicated text background stroke slots instead of fill slots', () => {
    expect(source).toContain('FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE');
    expect(source).toContain('FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY');
    expect(source).toContain('return viz.text?.background?.strokeValueColumn;');
    expect(source).toContain(
      'return viz.text?.background?.strokeCategoryColumn;'
    );
  });
});
