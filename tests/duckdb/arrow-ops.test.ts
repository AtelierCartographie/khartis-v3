import { describe, expect, it, vi } from 'vitest';
import { tableFromArrays, tableToIPC } from 'apache-arrow';
import {
  fetchArrowRepresentativePointTable,
  fetchArrowTableWithGeometry
} from '$lib/features/duckdb/orchestrator/arrow-ops';
import { GeometryType } from '$lib/features/map/constants/map.constants';

function createArrowIpcBuffer(): Uint8Array {
  const table = tableFromArrays({
    id: [1],
    geometry: [new Uint8Array([1, 2, 3, 4])]
  });

  return tableToIPC(table);
}

describe('fetchArrowTableWithGeometry', () => {
  it('keeps native geometry export when no reprojection is requested', async () => {
    const queryMock = vi.fn().mockResolvedValue(createArrowIpcBuffer());
    const describeTableMock = vi.fn().mockResolvedValue({
      name: ['id', 'geometry'],
      type: ['INTEGER', 'GEOMETRY']
    });

    await fetchArrowTableWithGeometry('example_table', {
      describe_table: describeTableMock,
      query: queryMock
    } as never);

    expect(queryMock).toHaveBeenCalledWith('SELECT * FROM "example_table"', {
      format: 'arrow-ipc'
    });
  });

  it('uses ST_Transform without ST_AsWKB when a target CRS is requested', async () => {
    const queryMock = vi.fn().mockResolvedValue(createArrowIpcBuffer());

    await fetchArrowTableWithGeometry(
      'example_table',
      {
        describe_table: vi.fn().mockResolvedValue({
          name: ['id', 'geometry'],
          type: ['INTEGER', "GEOMETRY('EPSG:4326')"]
        }),
        query: queryMock
      } as never,
      null,
      'EPSG:3857'
    );

    const executedSql = String(queryMock.mock.calls[0]?.[0]);

    expect(executedSql).toContain(
      `ST_Transform("geometry", 'EPSG:3857') AS "geometry"`
    );
    expect(executedSql).not.toContain('ST_AsWKB(');
  });
});

describe('fetchArrowRepresentativePointTable', () => {
  it('uses the inscribed circle center for polygon representative points', async () => {
    const queryMock = vi.fn().mockResolvedValue(createArrowIpcBuffer());

    await fetchArrowRepresentativePointTable(
      'example_table',
      GeometryType.POLYGON,
      {
        describe_table: vi.fn().mockResolvedValue({
          name: ['id', 'geometry'],
          type: ['INTEGER', "GEOMETRY('EPSG:4326')"]
        }),
        query: queryMock
      } as never
    );

    const executedSql = String(queryMock.mock.calls[0]?.[0]);

    expect(executedSql).toContain(
      'ST_MaximumInscribedCircle("geometry").center'
    );
    expect(executedSql).toContain('ST_PointOnSurface("geometry")');
    expect(executedSql).not.toContain('ST_AsWKB(');
  });

  it('uses ST_PointOnSurface for line representative points', async () => {
    const queryMock = vi.fn().mockResolvedValue(createArrowIpcBuffer());

    await fetchArrowRepresentativePointTable(
      'example_table',
      GeometryType.MULTILINESTRING,
      {
        describe_table: vi.fn().mockResolvedValue({
          name: ['id', 'geometry'],
          type: ['INTEGER', 'GEOMETRY']
        }),
        query: queryMock
      } as never
    );

    const executedSql = String(queryMock.mock.calls[0]?.[0]);

    expect(executedSql).toContain('ST_PointOnSurface("geometry")');
    expect(executedSql).not.toContain('ST_MaximumInscribedCircle(');
  });

  it('uses ST_PointOnSurface for multipoint representative points', async () => {
    const queryMock = vi.fn().mockResolvedValue(createArrowIpcBuffer());

    await fetchArrowRepresentativePointTable(
      'example_table',
      GeometryType.MULTIPOINT,
      {
        describe_table: vi.fn().mockResolvedValue({
          name: ['id', 'geometry'],
          type: ['INTEGER', 'GEOMETRY']
        }),
        query: queryMock
      } as never
    );

    const executedSql = String(queryMock.mock.calls[0]?.[0]);

    expect(executedSql).toContain('ST_PointOnSurface("geometry")');
    expect(executedSql).not.toContain('ST_MaximumInscribedCircle(');
  });
});
