import { describe, expect, it, vi } from 'vitest';
import { tableFromArrays, tableToIPC } from 'apache-arrow';
import {
  fetchArrowTableWithGeometry,
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
