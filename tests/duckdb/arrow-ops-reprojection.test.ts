import { describe, expect, it, vi } from 'vitest';
import { tableFromArrays, tableToIPC } from 'apache-arrow';
import {
  fetchArrowTableWithGeometry,
  getArrowTableDirect,
  getArrowTableReprojected
} from '$lib/features/duckdb/orchestrator/arrow-ops';

function toIpcBuffer(table: ReturnType<typeof tableFromArrays>): Uint8Array {
  const ipc = tableToIPC(table);
  return ipc instanceof Uint8Array ? ipc : new Uint8Array(ipc);
}

describe('getArrowTableReprojected', () => {
  it('uses the explicit DuckDB source and target CRS signature when geometry metadata has a CRS', async () => {
    const transformedTable = tableFromArrays({
      label: ['Paris'],
      geom: [new Uint8Array([1, 2, 3])]
    });

    const Duck = {
      describe_table: vi.fn().mockResolvedValue({
        name: ['geom', 'label'],
        type: ["GEOMETRY('EPSG:2154')", 'VARCHAR']
      }),
      queryStreaming: vi.fn().mockResolvedValue(toIpcBuffer(transformedTable)),
      query: vi.fn()
    };

    const { geomColumn } = await fetchArrowTableWithGeometry(
      'projected_dataset',
      Duck,
      null,
      'EPSG:4326'
    );

    expect(Duck.queryStreaming).toHaveBeenCalledWith(
      expect.stringContaining(
        `ST_Transform("geom", 'EPSG:2154', 'EPSG:4326', true)`
      )
    );
    expect(geomColumn?.column_type).toBe("GEOMETRY('EPSG:4326')");
  });

  it('escapes quoted table, projected column, and geometry identifiers', async () => {
    const transformedTable = tableFromArrays({
      ['label"col']: ['Paris'],
      ['geom"col']: [new Uint8Array([1, 2, 3])]
    });

    const Duck = {
      describe_table: vi.fn().mockResolvedValue({
        name: ['geom"col', 'label"col'],
        type: ["GEOMETRY('EPSG:2154')", 'VARCHAR']
      }),
      queryStreaming: vi.fn().mockResolvedValue(toIpcBuffer(transformedTable)),
      query: vi.fn()
    };

    await fetchArrowTableWithGeometry('table"one', Duck, null, 'EPSG:4326', [
      'label"col'
    ]);

    expect(Duck.queryStreaming).toHaveBeenCalledWith(
      expect.stringContaining(`FROM "table""one"`)
    );
    expect(Duck.queryStreaming).toHaveBeenCalledWith(
      expect.stringContaining(`"label""col"`)
    );
    expect(Duck.queryStreaming).toHaveBeenCalledWith(
      expect.stringContaining(
        `ST_Transform("geom""col", 'EPSG:2154', 'EPSG:4326', true) AS "geom""col"`
      )
    );
  });

  it('falls back to client-side proj4 when DuckDB ST_Transform fails', async () => {
    const rawTable = tableFromArrays({
      label: ['Paris'],
      geom: ['{"type":"Point","coordinates":[652000,6861000]}']
    });

    const Duck = {
      describe_table: vi.fn().mockResolvedValue({
        name: ['geom', 'label'],
        type: ["GEOMETRY('EPSG:2154')", 'VARCHAR']
      }),
      query: vi.fn(async (sql: string) => {
        if (sql.includes('ST_Transform')) {
          throw new Error('Unsupported projection');
        }

        if (sql.includes('SELECT DISTINCT geom_type')) {
          return [{ geom_type: 'ST_POINT' }];
        }

        if (sql.includes('ST_AsGeoJSON("geom") AS "geom"')) {
          return toIpcBuffer(rawTable);
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      })
    };

    const table = await getArrowTableReprojected(
      'projected_dataset',
      Duck,
      'EPSG:4326'
    );

    const geometry = table.getChild('geom')?.get(0);
    expect(typeof geometry).toBe('string');

    const parsedGeometry = JSON.parse(String(geometry));
    expect(parsedGeometry.coordinates[0]).toBeCloseTo(2.34, 1);
    expect(parsedGeometry.coordinates[1]).toBeCloseTo(48.85, 1);
    expect(table.getChild('label')?.get(0)).toBe('Paris');
    expect(table.schema.metadata?.get('geo')).toContain('"encoding":"geojson"');
  });
});

describe('getArrowTableDirect', () => {
  it('skips streaming reads for mutable dataset tables', async () => {
    const table = tableFromArrays({
      basemap_id: ['FRA'],
      population_2023: [67935660]
    });

    const Duck = {
      describe_table: vi.fn().mockResolvedValue({
        name: ['basemap_id', 'population_2023'],
        type: ['VARCHAR', 'BIGINT']
      }),
      queryStreaming: vi
        .fn()
        .mockResolvedValue(toIpcBuffer(tableFromArrays({ stale: [] }))),
      query: vi.fn().mockResolvedValue(toIpcBuffer(table))
    };
    const setCache = vi.fn();

    const result = await getArrowTableDirect(
      'joined_population_dataset',
      Duck,
      () => undefined,
      setCache
    );

    expect(Duck.queryStreaming).not.toHaveBeenCalled();
    expect(Duck.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM "joined_population_dataset"'),
      { format: 'arrow-ipc' }
    );
    expect(result.getChild('basemap_id')?.get(0)).toBe('FRA');
    expect(setCache).toHaveBeenCalledWith(result);
  });
});
