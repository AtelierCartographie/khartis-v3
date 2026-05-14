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

  it('uses dedicated stroke slots instead of fill or size slots', () => {
    expect(source).toContain('FACET_SLOT.SYMBOL_STROKE_VALUE');
    expect(source).toContain('FACET_SLOT.SYMBOL_STROKE_CATEGORY');
    expect(source).toContain('FACET_SLOT.POLYGON_STROKE_VALUE');
    expect(source).toContain('FACET_SLOT.POLYGON_STROKE_CATEGORY');
    expect(source).toContain('FACET_SLOT.LINE_THICKNESS_VALUE');
    expect(source).toContain('FACET_SLOT.TEXT_BACKGROUND_STROKE_VALUE');
    expect(source).toContain('FACET_SLOT.TEXT_BACKGROUND_STROKE_CATEGORY');
    expect(source).toContain('getFacetSlotVariable(viz, slotPath)');
  });

  it('shows the numeric variable icon only for numeric dataset columns', () => {
    expect(source).toContain('isAutoFacetNumericColumn');
    expect(source).not.toContain('col.type !== COLUMN_TYPE_GEOMETRY');
  });
});
