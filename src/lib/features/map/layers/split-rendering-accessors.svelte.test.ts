import { describe, expect, it } from 'vitest';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  CANONICAL_ID_COLUMN,
  INTERNAL_COLUMN,
  JOINED_BASEMAP_COLUMN
} from '$lib/features/commons/constants/data.constants';
import type { LayerContext } from '../types';
import {
  buildSplitDatasetRowMapping,
  createSplitAwareNullableRowAccessor,
  createSplitAwareRowAccessor,
  createSplitGeoJsonFeatureAccessor,
  createSplitGeoJsonNullableFeatureAccessor,
  getSplitMatchedGeometryRowIndices,
  resolveBestSplitFeatureIdColumn,
  resolveSplitMappingFeatureIdColumn
} from './split-rendering-accessors';

function createTableWithRows(
  rows: Record<string, unknown>[],
  fieldNames: string[]
): ArrowTable {
  return {
    schema: {
      fields: fieldNames.map((name) => ({ name }))
    },
    numRows: rows.length,
    get: (index: number) => rows[index],
    getChild: (name: string) =>
      fieldNames.includes(name)
        ? { get: (index: number) => rows[index]?.[name] }
        : null
  } as unknown as ArrowTable;
}

function createSplitContext(dataset: ArrowTable): LayerContext {
  return {
    splitDatasetTable: dataset,
    splitFeatureIdColumn: CANONICAL_ID_COLUMN
  } as LayerContext;
}

describe('split rendering accessors', () => {
  it('resolves the geometry feature id column with the canonical fallback order', () => {
    expect(
      resolveSplitMappingFeatureIdColumn(
        createTableWithRows([], [INTERNAL_COLUMN.FEATURE_ID]),
        CANONICAL_ID_COLUMN
      )
    ).toBe(INTERNAL_COLUMN.FEATURE_ID);

    expect(
      resolveSplitMappingFeatureIdColumn(
        createTableWithRows([], [JOINED_BASEMAP_COLUMN.ID]),
        CANONICAL_ID_COLUMN
      )
    ).toBe(JOINED_BASEMAP_COLUMN.ID);

    expect(
      resolveSplitMappingFeatureIdColumn(
        createTableWithRows([], [CANONICAL_ID_COLUMN]),
        CANONICAL_ID_COLUMN
      )
    ).toBe(CANONICAL_ID_COLUMN);
  });

  it('maps binary feature ids through geometry ids to joined dataset rows', () => {
    const geometry = createTableWithRows(
      [
        { [CANONICAL_ID_COLUMN]: 'DEU' },
        { [CANONICAL_ID_COLUMN]: 'FRA' },
        { [CANONICAL_ID_COLUMN]: 'ESP' }
      ],
      [CANONICAL_ID_COLUMN]
    );
    const dataset = createTableWithRows(
      [
        { [JOINED_BASEMAP_COLUMN.ID]: 'FRA', value: 20 },
        { [JOINED_BASEMAP_COLUMN.ID]: 'DEU', value: 10 }
      ],
      [JOINED_BASEMAP_COLUMN.ID, 'value']
    );
    const accessor = createSplitAwareRowAccessor(
      createSplitContext(dataset),
      geometry,
      (row) => Number(row.value ?? -1),
      geometry
    );

    expect([accessor(0), accessor(1), accessor(2)]).toEqual([10, 20, -1]);
  });

  it('preserves null for unmatched binary split rows when requested', () => {
    const geometry = createTableWithRows(
      [{ [CANONICAL_ID_COLUMN]: 'DEU' }, { [CANONICAL_ID_COLUMN]: 'ESP' }],
      [CANONICAL_ID_COLUMN]
    );
    const dataset = createTableWithRows(
      [{ [JOINED_BASEMAP_COLUMN.ID]: 'DEU', value: 10 }],
      [JOINED_BASEMAP_COLUMN.ID, 'value']
    );
    const accessor = createSplitAwareNullableRowAccessor(
      createSplitContext(dataset),
      geometry,
      (row) => (row ? Number(row.value) : null),
      geometry
    );

    expect([accessor(0), accessor(1)]).toEqual([10, null]);
  });

  it('maps projected GeoJSON features through geometry ids to joined dataset rows', () => {
    const geometry = createTableWithRows(
      [{ [CANONICAL_ID_COLUMN]: 'DEU' }, { [CANONICAL_ID_COLUMN]: 'FRA' }],
      [CANONICAL_ID_COLUMN]
    );
    const dataset = createTableWithRows(
      [
        { [JOINED_BASEMAP_COLUMN.ID]: 'FRA', label: 'France' },
        { [JOINED_BASEMAP_COLUMN.ID]: 'DEU', label: 'Germany' }
      ],
      [JOINED_BASEMAP_COLUMN.ID, 'label']
    );
    const accessor = createSplitGeoJsonFeatureAccessor(
      createSplitContext(dataset),
      geometry,
      (row) => String(row.label ?? 'missing')
    );

    expect(accessor?.({ properties: { [CANONICAL_ID_COLUMN]: 'DEU' } })).toBe(
      'Germany'
    );
    expect(accessor?.({ properties: { [CANONICAL_ID_COLUMN]: 'FRA' } })).toBe(
      'France'
    );
    expect(accessor?.({ properties: { [CANONICAL_ID_COLUMN]: 'ESP' } })).toBe(
      'missing'
    );
  });

  it('preserves null for unmatched projected GeoJSON split features when requested', () => {
    const geometry = createTableWithRows(
      [{ [CANONICAL_ID_COLUMN]: 'DEU' }, { [CANONICAL_ID_COLUMN]: 'ESP' }],
      [CANONICAL_ID_COLUMN]
    );
    const dataset = createTableWithRows(
      [{ [JOINED_BASEMAP_COLUMN.ID]: 'DEU', label: 'Germany' }],
      [JOINED_BASEMAP_COLUMN.ID, 'label']
    );
    const accessor = createSplitGeoJsonNullableFeatureAccessor(
      createSplitContext(dataset),
      geometry,
      (row) => row?.label ?? null
    );

    expect(accessor?.({ properties: { [CANONICAL_ID_COLUMN]: 'DEU' } })).toBe(
      'Germany'
    );
    expect(accessor?.({ properties: { [CANONICAL_ID_COLUMN]: 'ESP' } })).toBe(
      null
    );
  });

  it('builds tooltip row mappings from geometry rows to joined dataset rows', () => {
    const geometry = createTableWithRows(
      [
        { [CANONICAL_ID_COLUMN]: 'DEU' },
        { [CANONICAL_ID_COLUMN]: 'FRA' },
        { [CANONICAL_ID_COLUMN]: 'ESP' }
      ],
      [CANONICAL_ID_COLUMN]
    );
    const dataset = createTableWithRows(
      [
        { [JOINED_BASEMAP_COLUMN.ID]: 'FRA' },
        { [JOINED_BASEMAP_COLUMN.ID]: 'DEU' }
      ],
      [JOINED_BASEMAP_COLUMN.ID]
    );

    expect(
      Array.from(
        buildSplitDatasetRowMapping(geometry, dataset, CANONICAL_ID_COLUMN)
      )
    ).toEqual([1, 0, -1]);
  });

  it('lists only geometry rows that have a joined dataset row', () => {
    const geometry = createTableWithRows(
      [
        { [CANONICAL_ID_COLUMN]: 'DEU' },
        { [CANONICAL_ID_COLUMN]: 'FRA' },
        { [CANONICAL_ID_COLUMN]: 'ESP' },
        { [CANONICAL_ID_COLUMN]: 'ITA' }
      ],
      [CANONICAL_ID_COLUMN]
    );
    const dataset = createTableWithRows(
      [
        { [JOINED_BASEMAP_COLUMN.ID]: 'FRA' },
        { [JOINED_BASEMAP_COLUMN.ID]: 'ITA' }
      ],
      [JOINED_BASEMAP_COLUMN.ID]
    );

    expect(
      getSplitMatchedGeometryRowIndices(geometry, dataset, CANONICAL_ID_COLUMN)
    ).toEqual([1, 3]);
  });

  it('prefers the geometry id column that matches joined basemap ids', () => {
    const geometry = createTableWithRows(
      [
        { [INTERNAL_COLUMN.FEATURE_ID]: 1, [CANONICAL_ID_COLUMN]: 'A' },
        { [INTERNAL_COLUMN.FEATURE_ID]: 2, [CANONICAL_ID_COLUMN]: 'B' },
        { [INTERNAL_COLUMN.FEATURE_ID]: 3, [CANONICAL_ID_COLUMN]: 'C' }
      ],
      [INTERNAL_COLUMN.FEATURE_ID, CANONICAL_ID_COLUMN]
    );
    const dataset = createTableWithRows(
      [
        { [JOINED_BASEMAP_COLUMN.ID]: 'A', value: 120 },
        { [JOINED_BASEMAP_COLUMN.ID]: 'B', value: 80 },
        { [JOINED_BASEMAP_COLUMN.ID]: 'C', value: 160 }
      ],
      [JOINED_BASEMAP_COLUMN.ID, 'value']
    );

    expect(
      resolveBestSplitFeatureIdColumn(
        geometry,
        dataset,
        INTERNAL_COLUMN.FEATURE_ID
      )
    ).toBe(CANONICAL_ID_COLUMN);
  });

  it('tests custom basemap join candidate columns before falling back to feature ids', () => {
    const geometry = createTableWithRows(
      [
        { [INTERNAL_COLUMN.FEATURE_ID]: 1, admin_code: 'A' },
        { [INTERNAL_COLUMN.FEATURE_ID]: 2, admin_code: 'B' },
        { [INTERNAL_COLUMN.FEATURE_ID]: 3, admin_code: 'C' }
      ],
      [INTERNAL_COLUMN.FEATURE_ID, 'admin_code']
    );
    const dataset = createTableWithRows(
      [
        { [JOINED_BASEMAP_COLUMN.ID]: 'A', value: 120 },
        { [JOINED_BASEMAP_COLUMN.ID]: 'B', value: 80 },
        { [JOINED_BASEMAP_COLUMN.ID]: 'C', value: 160 }
      ],
      [JOINED_BASEMAP_COLUMN.ID, 'value']
    );

    expect(
      resolveBestSplitFeatureIdColumn(
        geometry,
        dataset,
        INTERNAL_COLUMN.FEATURE_ID
      )
    ).toBe('admin_code');
  });

  it('does not resolve a split feature id column without joined basemap ids', () => {
    const geometry = createTableWithRows(
      [
        { [INTERNAL_COLUMN.FEATURE_ID]: 1, [CANONICAL_ID_COLUMN]: 'A' },
        { [INTERNAL_COLUMN.FEATURE_ID]: 2, [CANONICAL_ID_COLUMN]: 'B' }
      ],
      [INTERNAL_COLUMN.FEATURE_ID, CANONICAL_ID_COLUMN]
    );
    const dataset = createTableWithRows(
      [
        { [CANONICAL_ID_COLUMN]: 'A', value: 120 },
        { [CANONICAL_ID_COLUMN]: 'B', value: 80 }
      ],
      [CANONICAL_ID_COLUMN, 'value']
    );

    expect(
      resolveBestSplitFeatureIdColumn(
        geometry,
        dataset,
        INTERNAL_COLUMN.FEATURE_ID
      )
    ).toBeUndefined();
  });

  it('does not resolve a split feature id column when no geometry ids match joined basemap ids', () => {
    const geometry = createTableWithRows(
      [
        { [INTERNAL_COLUMN.FEATURE_ID]: 1, [CANONICAL_ID_COLUMN]: 'A' },
        { [INTERNAL_COLUMN.FEATURE_ID]: 2, [CANONICAL_ID_COLUMN]: 'B' }
      ],
      [INTERNAL_COLUMN.FEATURE_ID, CANONICAL_ID_COLUMN]
    );
    const dataset = createTableWithRows(
      [
        { [JOINED_BASEMAP_COLUMN.ID]: 'X', value: 120 },
        { [JOINED_BASEMAP_COLUMN.ID]: 'Y', value: 80 }
      ],
      [JOINED_BASEMAP_COLUMN.ID, 'value']
    );

    expect(
      resolveBestSplitFeatureIdColumn(
        geometry,
        dataset,
        INTERNAL_COLUMN.FEATURE_ID
      )
    ).toBeUndefined();
  });
});
