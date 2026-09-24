import { describe, expect, it, vi } from 'vitest';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { selectBasemapJoinKeyColumns } from '$lib/features/duckdb';
vi.mock('$lib/features/duckdb', async () => ({
  ...(await vi.importActual<object>(
    '$lib/features/duckdb/utils/basemap-join-key-columns.utils'
  )),
  ...(await vi.importActual<object>(
    '$lib/features/duckdb/utils/geometry-column.utils'
  )),
  ...(await vi.importActual<object>('$lib/features/duckdb/enums'))
}));

import { getCustomBasemapGeometryProjectColumns } from '$lib/features/map/services/custom-basemap-columns.service';

const NUTS2_COLUMNS = [
  { name: INTERNAL_COLUMN.FEATURE_ID, type_simple: 'numeric' },
  { name: 'NUTS_ID', type_simple: 'string' },
  { name: 'NAME_LATN', type_simple: 'string' },
  { name: 'POP_TOT_2023', type_simple: 'numeric' },
  { name: 'geom', type_simple: 'geometry' }
];

describe('custom basemap geometry columns for joined rendering', () => {
  it('draws every column the join can store as basemap_id', () => {
    const joinKeyColumns = selectBasemapJoinKeyColumns([
      'NUTS_ID',
      'NAME_LATN'
    ]);
    const projected = getCustomBasemapGeometryProjectColumns(NUTS2_COLUMNS);

    expect(joinKeyColumns).toContain('NAME_LATN');
    expect(projected).toEqual(expect.arrayContaining(joinKeyColumns));
    expect(projected[0]).toBe(INTERNAL_COLUMN.FEATURE_ID);
  });

  it('never projects numeric or geometry columns, nor the same column twice', () => {
    const projected = getCustomBasemapGeometryProjectColumns([
      ...NUTS2_COLUMNS,
      { name: 'name', type_simple: 'string' }
    ]);

    expect(projected).not.toContain('POP_TOT_2023');
    expect(projected).not.toContain('geom');
    expect(new Set(projected).size).toBe(projected.length);
  });

  it('falls back to the first text columns like the join does', () => {
    const textColumns = ['a', 'b', 'c', 'd', 'e', 'f'];

    expect(selectBasemapJoinKeyColumns(textColumns)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e'
    ]);
    expect(
      getCustomBasemapGeometryProjectColumns(
        textColumns.map((name) => ({ name, type_simple: 'string' }))
      )
    ).toEqual(
      expect.arrayContaining([
        INTERNAL_COLUMN.FEATURE_ID,
        'a',
        'b',
        'c',
        'd',
        'e'
      ])
    );
  });
});
