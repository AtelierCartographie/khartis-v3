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

  it('retries ST_Transform with the known PROJ definition when the source code is missing', async () => {
    const transformedTable = tableFromArrays({
      label: ['Paris'],
      geom: [new Uint8Array([1, 2, 3])]
    });

    const Duck = {
      describe_table: vi.fn().mockResolvedValue({
        name: ['geom', 'label'],
        type: ["GEOMETRY('EPSG:2154')", 'VARCHAR']
      }),
      queryStreaming: vi.fn(async (sql: string) => {
        if (sql.includes(`'EPSG:2154'`)) {
          throw new Error('crs not found');
        }
        return toIpcBuffer(transformedTable);
      }),
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT DISTINCT geom_type')) {
          return [{ geom_type: 'POINT' }];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      })
    };

    const table = await getArrowTableReprojected(
      'projected_dataset',
      Duck,
      'EPSG:4326'
    );

    expect(Duck.queryStreaming).toHaveBeenLastCalledWith(
      expect.stringContaining(`ST_Transform("geom", '+proj=lcc`)
    );
    expect(table.getChild('label')?.get(0)).toBe('Paris');
    expect(table.schema.metadata?.get('geo')).toContain(
      '"encoding":"geoarrow.wkb"'
    );
  });

  it('rethrows the DuckDB error when no PROJ definition is known for the source', async () => {
    const Duck = {
      describe_table: vi.fn().mockResolvedValue({
        name: ['geom'],
        type: ["GEOMETRY('EPSG:999999')"]
      }),
      queryStreaming: vi.fn().mockRejectedValue(new Error('crs not found')),
      query: vi.fn()
    };

    await expect(
      getArrowTableReprojected('projected_dataset', Duck, 'EPSG:4326')
    ).rejects.toThrow('crs not found');
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
