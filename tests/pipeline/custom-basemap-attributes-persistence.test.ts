import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { KhartisProject } from '$lib/features/project-management/types';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from './duckdb-node-helper';

const testDb = vi.hoisted(() => ({ current: null as TestDuckDB | null }));

vi.mock('$lib/features/duckdb', async () => {
  const { executeQuery } = await import('$lib/features/duckdb/core/query');
  const { tableFromArrays, tableToIPC } = await import('@uwdata/flechette');

  async function runQueryAsIpc(sql: string): Promise<Uint8Array> {
    const reader = await testDb.current!.connection.runAndReadAll(sql);
    const columns = reader.getColumnsObjectJson() as Record<string, unknown[]>;
    return tableToIPC(tableFromArrays(columns), {})!;
  }

  const connection = {
    useUnsafe: (
      callback: (
        bindings: { runQuery: (conn: unknown, sql: string) => unknown },
        conn: unknown
      ) => unknown
    ) => callback({ runQuery: (_conn, sql) => runQueryAsIpc(sql) }, null)
  };

  return {
    Duck: {
      query: (sql: string, options?: Record<string, unknown>) =>
        executeQuery(connection as never, sql, options)
    },
    duckDBOrchestrator: {
      waitForInitialization: async () => undefined,
      getDatasetBySourceFile: () => undefined
    }
  };
});

vi.mock('$lib/features/map/services', async () => ({
  basemapCatalogService: (
    await import('$lib/features/map/services/basemap-catalog.service.svelte')
  ).basemapCatalogService
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
  LogCategory: { PERSISTENCE: 'PERSISTENCE', PROJECT: 'PROJECT', MAP: 'MAP' }
}));

vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showWarning: vi.fn()
}));

vi.mock('$lib/features/commons/stores/data-tab.store.svelte', () => ({
  dataTabState: { basemapJoin: { selectedBasemap: null }, geolocation: {} }
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: { datasets: [], selectedDataset: null }
}));

const { deserialize, prepareForIndexedDB } =
  await import('$lib/features/project-management/services/serializer.service');
const { basemapCatalogService } =
  await import('$lib/features/map/services/basemap-catalog.service.svelte');

const CUSTOM_BASEMAP_ID = 'custom-tiny-geo';

const ATTRIBUTE_ROWS = [
  ['Alpha', 'A', 'name', 'alpha', CUSTOM_BASEMAP_ID, 1],
  ["Bêta d'or", 'B', 'name', 'beta d or', CUSTOM_BASEMAP_ID, 1],
  ['G', 'G', 'code', 'g', CUSTOM_BASEMAP_ID, 2]
] as const;

const customBasemap = {
  file: CUSTOM_BASEMAP_ID,
  title_fr: 'Fond importé',
  title_en: 'Imported basemap',
  source: 'test',
  date: '2026',
  proj_source: 'EPSG:4326',
  layers: [],
  bbox: [0, 0, 1, 1],
  isCustom: true
} as unknown as BasemapMetadata;

const project = {
  manifest: {
    id: 'project-1',
    name: 'Custom basemap',
    createdAt: new Date('2026-09-24T00:00:00Z'),
    updatedAt: new Date('2026-09-24T00:00:00Z')
  },
  data: {}
} as unknown as KhartisProject;

function readAttributes() {
  return query(
    testDb.current!,
    'SELECT raw, id, variant, normalized, basemap, basemap_count FROM custom_basemap_attributes ORDER BY raw'
  );
}

describe('custom basemap attributes persistence', () => {
  beforeAll(async () => {
    testDb.current = await createTestInstance();
  });

  afterAll(async () => {
    if (testDb.current) {
      await destroyTestInstance(testDb.current);
    }
  });

  it('restores every attribute row after an IndexedDB save and reopen', async () => {
    await run(
      testDb.current!,
      `CREATE TABLE custom_basemap_attributes (
        raw VARCHAR, id VARCHAR, variant VARCHAR, normalized VARCHAR,
        basemap VARCHAR, basemap_count INTEGER
      )`
    );
    const values = ATTRIBUTE_ROWS.map(
      (row) =>
        `(${row.map((v) => (typeof v === 'number' ? v : `'${v.replaceAll("'", "''")}'`)).join(', ')})`
    ).join(', ');
    await run(
      testDb.current!,
      `INSERT INTO custom_basemap_attributes VALUES ${values}`
    );
    basemapCatalogService.addCustomBasemap(customBasemap);
    const savedRows = await readAttributes();

    const stored = structuredClone(await prepareForIndexedDB(project));
    await run(testDb.current!, 'DROP TABLE custom_basemap_attributes');
    await deserialize(stored);

    expect(stored.data?.customBasemaps?.attributes).toHaveLength(
      ATTRIBUTE_ROWS.length
    );
    expect(await readAttributes()).toEqual(savedRows);
  });
});
