import { describe, expect, it } from 'vitest';
import {
  isAutoFacetDataColumn,
  filterVisualizableDataColumns,
  isAutoFacetNumericColumn,
  isVisualizableDataColumn
} from './visualization-columns.utils';

describe('visualization column helpers', () => {
  it('filters geometry and internal columns out of visualization selectors', () => {
    const columns = [
      { name: 'population', type: 'number' },
      { name: 'geom', type: 'string' },
      { name: 'geometry', type: 'geometry' },
      { name: 'wkb_geometry', type: 'string' },
      { name: 'the_geom', type: 'string' },
      { name: '__id', type: 'number' },
      { name: '__feature_id__', type: 'string' },
      { name: 'name', type: 'text' }
    ];

    expect(
      filterVisualizableDataColumns(columns).map((column) => column.name)
    ).toEqual(['population', 'name']);
  });

  it('keeps explicit semantic id-like fields visible while hiding system columns', () => {
    expect(isVisualizableDataColumn({ name: 'OGC_FID', type: 'number' })).toBe(
      true
    );
    expect(isVisualizableDataColumn({ name: 'id', type: 'number' })).toBe(true);
    expect(isVisualizableDataColumn({ name: '__id', type: 'number' })).toBe(
      false
    );
  });

  it('rejects technical identifiers for automatic numeric facet variables', () => {
    expect(
      isAutoFacetNumericColumn({ name: 'population', type: 'number' })
    ).toBe(true);
    expect(isAutoFacetNumericColumn({ name: 'OGC_FID', type: 'number' })).toBe(
      false
    );
    expect(isAutoFacetNumericColumn({ name: 'id', type: 'number' })).toBe(
      false
    );
    expect(isAutoFacetNumericColumn({ name: 'label', type: 'text' })).toBe(
      false
    );
  });

  it('rejects technical identifiers for every automatic facet variable list', () => {
    expect(isAutoFacetDataColumn({ name: 'category', type: 'text' })).toBe(
      true
    );
    expect(isAutoFacetDataColumn({ name: 'OGC_FID', type: 'number' })).toBe(
      false
    );
    expect(isAutoFacetDataColumn({ name: 'id', type: 'text' })).toBe(false);
  });
});
