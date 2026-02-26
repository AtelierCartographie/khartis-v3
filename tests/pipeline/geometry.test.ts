import { beforeEach, describe, expect, it, vi } from 'vitest';

type DuckLike = {
  describe_table: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
};

async function loadGeometryModule(duck: DuckLike | undefined) {
  vi.resetModules();
  vi.doMock('$lib/features/duckdb', () => ({
    Duck: duck,
    GEO_CONSTANTS: { WGS84_CRS: 'EPSG:4326' }
  }));

  return import('$lib/features/data-pipeline/operations/geometry');
}

describe('extractGeometryInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when DuckDB client is unavailable', async () => {
    const { extractGeometryInfo } = await loadGeometryModule(undefined);

    await expect(extractGeometryInfo('tbl')).resolves.toBeUndefined();
  });

  it('returns undefined when no geometry column exists', async () => {
    const duck = {
      describe_table: vi.fn().mockResolvedValue({
        name: ['id'],
        type: ['INTEGER']
      }),
      query: vi.fn()
    };

    const { extractGeometryInfo } = await loadGeometryModule(duck);
    const result = await extractGeometryInfo('tbl');

    expect(result).toBeUndefined();
    expect(duck.query).not.toHaveBeenCalled();
  });

  it('uses provided geometry column and returns computed bounds', async () => {
    const duck = {
      describe_table: vi.fn(),
      query: vi.fn().mockResolvedValue([
        {
          geom_type: 'ST_MULTIPOLYGON',
          minX: -10,
          minY: -20,
          maxX: 30,
          maxY: 40
        }
      ])
    };

    const { extractGeometryInfo } = await loadGeometryModule(duck);

    const result = await extractGeometryInfo('my table', [
      { name: 'geom', type: 'GEOMETRY' }
    ]);

    expect(duck.describe_table).not.toHaveBeenCalled();
    expect(duck.query).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      type: 'MultiPolygon',
      columnName: 'geom',
      bounds: [-10, -20, 30, 40],
      centroid: [10, 10],
      crs: 'EPSG:4326',
      featureCount: undefined
    });
  });

  it('falls back to world bounds when extent cannot be read', async () => {
    const duck = {
      describe_table: vi.fn().mockResolvedValue({
        name: ['geom'],
        type: ['GEOMETRY']
      }),
      query: vi.fn().mockResolvedValue([
        {
          geom_type: 'ST_LINESTRING',
          minX: null,
          minY: null,
          maxX: null,
          maxY: null
        }
      ])
    };

    const { extractGeometryInfo } = await loadGeometryModule(duck);
    const result = await extractGeometryInfo('tbl');

    expect(result).toEqual({
      type: 'LineString',
      columnName: 'geom',
      bounds: [-180, -90, 180, 90],
      centroid: [0, 0]
    });
  });

  it('returns undefined on query failures', async () => {
    const duck = {
      describe_table: vi.fn().mockResolvedValue({
        name: ['geom'],
        type: ['GEOMETRY']
      }),
      query: vi.fn().mockRejectedValue(new Error('boom'))
    };

    const { extractGeometryInfo } = await loadGeometryModule(duck);
    const result = await extractGeometryInfo('tbl');

    expect(result).toBeUndefined();
  });
});
