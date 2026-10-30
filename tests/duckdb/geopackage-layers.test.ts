import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DuckDBContext } from '$lib/features/duckdb/types';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

const hoisted = vi.hoisted(() => ({
  connection: null as {
    runAndReadAll: (sql: string) => Promise<unknown>;
  } | null
}));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: async (_connection: unknown, sql: string) => {
    const reader = (await hoisted.connection!.runAndReadAll(sql)) as {
      getRowObjectsJson: () => unknown[];
    };
    return reader.getRowObjectsJson();
  }
}));

// The file path stands in for the id the WASM registry would give the file.
vi.mock('$lib/features/duckdb/io/file-registry', () => ({
  registerFiles: vi.fn(
    async (_db: unknown, _registered: unknown, files: File[]) => {
      for (const file of files) {
        (file as File & { id: string }).id = file.name;
      }
    }
  ),
  dropRegisteredFile: vi.fn(),
  generateUniqueTableName: vi.fn(),
  registerSqliteSidecars: vi.fn(async () => [])
}));

import {
  listGeofileSpatialLayers,
  readGeofile
} from '$lib/features/duckdb/io/geofile-reader';

const ADMIN_EXPRESS_GPKG =
  'tests-datasets/gpkg/ADMIN-EXPRESS_4-0__GPKG_RGAF09UTM20_GLP_2025-12-05/ADE_4-0_GPKG_RGAF09UTM20_GLP-ED2025-12-05.gpkg';

let db: TestDuckDB;

function createContext(): DuckDBContext {
  return {
    connection: db.connection,
    loaded_files: new Map(),
    registered_files: new Set(),
    table_files: new Map(),
    table_metadata: new Map(),
    describeCache: new Map(),
    rowCountCache: new Map(),
    extensionsLoaded: { spatial: false, httpfs: false }
  } as unknown as DuckDBContext;
}

describe('listGeofileSpatialLayers', () => {
  beforeAll(async () => {
    db = await createTestInstance();
    hoisted.connection = db.connection;
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it('should list every spatial layer of a GeoPackage, the preferred one first', async () => {
    const layers = await listGeofileSpatialLayers(
      createContext(),
      new File([], ADMIN_EXPRESS_GPKG)
    );

    expect(layers).toHaveLength(14);
    expect(layers[0]).toBe('commune');
    expect(layers).toContain('chef_lieu_de_commune');
    expect(layers).not.toContain('layer_styles');
    expect(layers).not.toContain('info_metadonnees');
  });

  it('should list a single layer for a single-layer GeoPackage', async () => {
    const layers = await listGeofileSpatialLayers(
      createContext(),
      new File([], 'tests-datasets/gpkg/compagnies-herault-l93.gpkg')
    );

    expect(layers).toHaveLength(1);
  });
});

// GDAL streams these layers from a worker thread in DuckDB WASM (the file has
// no gpkg_ogr_contents), so the reader decodes them from SQLite instead. Native
// ST_Read, which has threads, is the reference.
describe('readGeofile on a GeoPackage', () => {
  beforeAll(async () => {
    db = await createTestInstance();
    hoisted.connection = db.connection;
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it.each([
    ['commune', 'with an xy envelope'],
    ['chef_lieu_de_commune', 'without an envelope']
  ])('should decode the %s layer %s in its source CRS', async (layer) => {
    const tableName = `gpkg_${layer}`;
    await readGeofile(createContext(), new File([], ADMIN_EXPRESS_GPKG), {
      tablename: tableName,
      layer
    });

    const [read] = await query(
      db,
      `SELECT count(*) AS n, any_value(typeof(geom)) AS geometry_type,
                min(ST_XMin(geom)) AS min_x, count(nom_officiel) AS names,
                any_value(typeof(fid)) AS fid_type
         FROM "${tableName}"`
    );
    expect(Number(read.n)).toBe(32);
    expect(Number(read.names)).toBe(32);
    expect(read.geometry_type).toBe("GEOMETRY('EPSG:5490')");
    expect(Number(read.min_x)).toBeGreaterThan(100_000);
    expect(read.fid_type).toBe('BIGINT');

    const [diff] = await query(
      db,
      `SELECT count(*) AS n
         FROM "${tableName}" t
         JOIN ST_Read('${ADMIN_EXPRESS_GPKG}', layer = '${layer}') r
           ON r.fid = t.fid
         WHERE NOT ST_Equals(t.geom, r.geometrie)`
    );
    expect(Number(diff.n)).toBe(0);
  });
});
