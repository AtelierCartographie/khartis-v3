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
    expect(source).toContain(
      'dataFields.filter((f) => f.id !== NONE_FIELD_ID)'
    );
    expect(source).toContain('displayItems');
  });
});
