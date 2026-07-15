import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import { computeCentroid } from '$lib/features/data-pipeline/types';

const { duckQueryMock, describeTableMock } = vi.hoisted(() => ({
  duckQueryMock: vi.fn(),
  describeTableMock: vi.fn()
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: { query: duckQueryMock, describe_table: describeTableMock },
  GEO_CONSTANTS: { WGS84_CRS: 'EPSG:4326' },
  isGeometryColumnType: (columnType: string) =>
    columnType === 'GEOMETRY' || columnType.startsWith('GEOMETRY(')
}));

import { extractGeometryInfo } from '$lib/features/data-pipeline/operations/geometry';

describe('computeCentroid', () => {
  it('returns the geometric center of a square bounding box', () => {
    const centroid = computeCentroid([0, 0, 10, 10]);
    expect(centroid[0]).toBe(5);
    expect(centroid[1]).toBe(5);
  });

  it('handles negative coordinates correctly', () => {
    const centroid = computeCentroid([-180, -90, 180, 90]);
    expect(centroid[0]).toBe(0);
    expect(centroid[1]).toBe(0);
  });

  it('handles non-square bounding boxes', () => {
    const centroid = computeCentroid([2, 48, 6, 52]);
    expect(centroid[0]).toBe(4);
    expect(centroid[1]).toBe(50);
  });

  it('handles single-point bounds (collapsed box)', () => {
    const centroid = computeCentroid([5, 45, 5, 45]);
    expect(centroid[0]).toBe(5);
    expect(centroid[1]).toBe(45);
  });
});

describe('extractGeometryInfo (F10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    describeTableMock.mockResolvedValue({
      name: ['geom', 'label'],
      type: ['GEOMETRY', 'VARCHAR']
    });
  });

  it('returns bounds and centroid when the extent is available', async () => {
    duckQueryMock.mockResolvedValue([
      { geom_type: 'POLYGON', minX: 0, minY: 10, maxX: 4, maxY: 20 }
    ]);

    const inspection = await extractGeometryInfo('geo_table');

    expect(inspection.warnings).toEqual([]);
    expect(inspection.geometry?.bounds).toEqual([0, 10, 4, 20]);
    expect(inspection.geometry?.centroid).toEqual([2, 15]);
  });

  it('omits bounds and warns instead of fabricating a world extent when geometries are all NULL', async () => {
    duckQueryMock.mockResolvedValue([
      { geom_type: null, minX: null, minY: null, maxX: null, maxY: null }
    ]);

    const inspection = await extractGeometryInfo('empty_geo_table');

    expect(inspection.geometry).toBeDefined();
    expect(inspection.geometry?.bounds).toBeUndefined();
    expect(inspection.geometry?.centroid).toBeUndefined();
    expect(inspection.warnings).toEqual([
      m.pipeline_warning_geometry_bounds_unavailable()
    ]);
  });

  it('warns when the geometry inspection fails entirely', async () => {
    describeTableMock.mockRejectedValue(new Error('describe failed'));

    const inspection = await extractGeometryInfo('broken_table');

    expect(inspection.geometry).toBeUndefined();
    expect(inspection.warnings).toEqual([
      m.pipeline_warning_geometry_inspection_failed()
    ]);
  });

  it('returns no geometry and no warning for tabular tables', async () => {
    describeTableMock.mockResolvedValue({
      name: ['a', 'b'],
      type: ['VARCHAR', 'BIGINT']
    });

    const inspection = await extractGeometryInfo('tabular_table');

    expect(inspection.geometry).toBeUndefined();
    expect(inspection.warnings).toEqual([]);
  });
});
