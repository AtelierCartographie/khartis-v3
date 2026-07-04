import { tableFromArrays, tableToIPC } from 'apache-arrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dropFile: vi.fn(),
  query: vi.fn(),
  registerFileBuffer: vi.fn(),
  registeredFiles: new Set<string>(),
  registerFiles: vi.fn()
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: { MAP: 'MAP' },
  logger: {
    error: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    get db() {
      return {
        dropFile: mocks.dropFile,
        registerFileBuffer: mocks.registerFileBuffer
      };
    },
    get registered_files() {
      return mocks.registeredFiles;
    },
    query: mocks.query,
    register_files: mocks.registerFiles
  },
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326'
  }
}));

vi.mock('$lib/features/duckdb/io/reprojection', () => ({
  isProjectionSupported: vi.fn(() => true),
  reprojectPoint: vi.fn((x: number, y: number) => ({
    coordinates: [x + 1, y + 1],
    success: true
  }))
}));

import { readGeoParquetViaDuckDB } from './read-geojson-arrow.service';

function toIpcBuffer(table: ReturnType<typeof tableFromArrays>): Uint8Array {
  const ipc = tableToIPC(table);
  return ipc instanceof Uint8Array ? ipc : new Uint8Array(ipc);
}

describe('readGeoParquetViaDuckDB', () => {
  beforeEach(() => {
    mocks.dropFile.mockReset().mockResolvedValue(undefined);
    mocks.query.mockReset();
    mocks.registerFileBuffer.mockReset().mockResolvedValue(undefined);
    mocks.registeredFiles.clear();
    mocks.registerFiles.mockReset().mockResolvedValue(undefined);
  });

  it('reinjects proj4 fallback geometries through a registered buffer', async () => {
    const rawTable = tableFromArrays({
      label: ['Paris'],
      geom: ['{"type":"Point","coordinates":[1,2]}']
    });
    const finalTable = tableFromArrays({
      label: ['Paris'],
      geom: ['{"type":"Point","coordinates":[2,3]}']
    });
    const queries: string[] = [];
    const metadata = {
      primary_column: 'geom',
      columns: {
        geom: {
          encoding: 'point',
          crs: {
            type: 'ProjectedCRS',
            id: { authority: 'EPSG', code: 2154 }
          }
        }
      }
    };

    mocks.query.mockImplementation(async (sql: string) => {
      queries.push(sql);

      if (sql.includes('parquet_kv_metadata')) {
        return [{ value: JSON.stringify(metadata) }];
      }

      if (sql.includes('ST_Transform')) {
        throw new Error('Projection unavailable in DuckDB');
      }

      if (sql.includes('ST_AsGeoJSON')) {
        return toIpcBuffer(rawTable);
      }

      if (sql.includes('CREATE TEMP TABLE') || sql.includes('DROP TABLE')) {
        return new Uint8Array();
      }

      if (sql.includes('LEFT JOIN')) {
        return toIpcBuffer(finalTable);
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const table = await readGeoParquetViaDuckDB(
      new ArrayBuffer(8),
      'dataset_projected.parquet'
    );

    expect(mocks.registerFileBuffer).toHaveBeenCalledOnce();
    const [bufferName, buffer] = mocks.registerFileBuffer.mock.calls[0];
    expect(bufferName).toContain('__khartis_reprojected_geometry_projected_');
    const rows = JSON.parse(new TextDecoder().decode(buffer as Uint8Array));
    expect(rows).toHaveLength(1);
    expect(Object.values(rows[0])).toContain(
      '{"type":"Point","coordinates":[2,3]}'
    );
    expect(queries.some((sql) => sql.includes('read_json_auto'))).toBe(true);
    expect(queries.every((sql) => !sql.includes('UPDATE'))).toBe(true);
    expect(mocks.dropFile).toHaveBeenCalledWith(bufferName);
    expect(mocks.registeredFiles.has(bufferName)).toBe(false);
    expect(table.getChild('label')?.get(0)).toBe('Paris');
    expect(table.schema.metadata?.get('geo')).toContain('"encoding":"geojson"');
  });
});
