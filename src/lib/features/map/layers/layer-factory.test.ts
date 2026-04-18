import { describe, expect, it } from 'vitest';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { resolveSplitMappingFeatureIdColumn } from './layer-factory';

function createTableWithFields(fieldNames: string[]): ArrowTable {
  return {
    schema: {
      fields: fieldNames.map((name) => ({ name }))
    }
  } as unknown as ArrowTable;
}

describe('resolveSplitMappingFeatureIdColumn', () => {
  it('prefers the split geometry feature id column when the table still exposes it', () => {
    const table = createTableWithFields(['__feature_id__', 'label']);

    expect(resolveSplitMappingFeatureIdColumn(table, '__feature_id__')).toBe(
      '__feature_id__'
    );
  });

  it('falls back to basemap_id for representative point tables built from joined datasets', () => {
    const table = createTableWithFields(['basemap_id', 'label']);

    expect(resolveSplitMappingFeatureIdColumn(table, '__feature_id__')).toBe(
      'basemap_id'
    );
  });
});
