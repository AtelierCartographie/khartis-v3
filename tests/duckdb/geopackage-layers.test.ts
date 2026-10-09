import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DuckDBContext } from '$lib/features/duckdb/types';
import {
  createTestInstance,
  destroyTestInstance,
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
  generateUniqueTableName: vi.fn()
}));

import { listGeofileSpatialLayers } from '$lib/features/duckdb/io/geofile-reader';

const ADMIN_EXPRESS_GPKG =
  'tests-datasets/gpkg/ADMIN-EXPRESS_4-0__GPKG_RGAF09UTM20_GLP_2025-12-05/ADE_4-0_GPKG_RGAF09UTM20_GLP-ED2025-12-05.gpkg';

let db: TestDuckDB;

function createContext(): DuckDBContext {
  return {
    connection: db.connection,
    registered_files: new Set(),
    extensionsLoaded: { spatial: false }
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
