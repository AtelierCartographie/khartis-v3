import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'viz-filter-panel.svelte'),
  'utf8'
);

describe('VizFilterPanel — clear filters action', () => {
  it('accepts an optional clear-all handler', () => {
    expect(source).toContain('onClearFilters?: () => void');
    expect(source).toContain('onClearFilters,');
  });

  it('renders clear-all only when filters exist and a handler is provided', () => {
    expect(source).toContain('{#if hasFilters && onClearFilters}');
    expect(source).toContain('onclick={onClearFilters}');
    expect(source).toContain('{m.filter_clear_all()}');
  });
});
