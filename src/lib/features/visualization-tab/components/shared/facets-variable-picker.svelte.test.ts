import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'facets-variable-picker.svelte'),
  'utf8'
);

describe('FacetsVariablePicker collection filtering', () => {
  it('keeps collection choices constrained to the compatible single-select list', () => {
    expect(source).toContain('singleSelectItems = dataFields');
    expect(source).toContain('isAutoFacetDataColumn');
    expect(source).toContain('collectionDataFields');
    expect(source).toContain('singleSelectItems.filter(isAutoFacetDataColumn)');
    expect(source).toContain(
      '(isCollectionEnabled ? collectionDataFields : singleSelectItems).filter'
    );
    expect(source).toContain('displayItems');
  });

  it('renders data-step VariableBadge markers and excludes Aucun from dropdown choices', () => {
    expect(source).toContain(
      "import VariableBadge from '$lib/features/commons/components/variable-badge.svelte'"
    );
    expect(source).toContain('resolveVariableBadgeType');
    expect(source).toContain('(f) => f.id !== NONE_FIELD_ID');
    expect(source).not.toContain('field.id === NONE_FIELD_ID');
    expect(source).not.toContain('<Table');
  });
});
