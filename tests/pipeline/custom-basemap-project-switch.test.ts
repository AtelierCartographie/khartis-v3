import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type {
  SerializedBasemapAttribute,
  SerializedProjectData
} from '$lib/types/serialization.types';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  type TestDuckDB
} from './duckdb-node-helper';

const testDb = vi.hoisted(() => ({
  current: null as TestDuckDB | null
}));

vi.mock('$lib/features/duckdb', async () => {
  const helper = await import('./duckdb-node-helper');
  return {
    Duck: {
      get connection() {
        return testDb.current?.connection ?? null;
      },
      query: (sql: string) => helper.query(testDb.current!, sql)
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
  dataTabState: {
    basemapJoin: { selectedBasemap: null },
    geolocation: {}
  }
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: { datasets: [], selectedDataset: null }
}));

const { deserializeProjectData, serializeProjectData } =
  await import('$lib/features/project-management/services/serializer.service');
const { basemapCatalogService } =
  await import('$lib/features/map/services/basemap-catalog.service.svelte');

function basemap(file: string, isCustom: boolean): BasemapMetadata {
  return {
    file,
    title_fr: file,
    title_en: file,
    source: 'test',
    date: '2026',
    proj_source: 'EPSG:4326',
    layers: [],
    bbox: [0, 0, 1, 1],
    isCustom
  } as unknown as BasemapMetadata;
}

function attribute(basemapId: string, raw: string): SerializedBasemapAttribute {
  return {
    raw,
    id: raw,
    variant: 'name',
    normalized: raw.toLowerCase(),
    basemap: basemapId,
    basemap_count: 1
  };
}

function projectWithCustomBasemap(basemapId: string): SerializedProjectData {
  return {
    customBasemaps: {
      metadata: [basemap(basemapId, true)],
      attributes: [attribute(basemapId, `${basemapId}-alpha`)]
    }
  } as SerializedProjectData;
}

function customCatalogIds(): string[] {
  return basemapCatalogService.basemaps
    .filter((entry) => entry.isCustom)
    .map((entry) => entry.file);
}

describe('custom basemaps across project switches', () => {
  beforeAll(async () => {
    testDb.current = await createTestInstance();
  });

  afterAll(async () => {
    if (testDb.current) {
      await destroyTestInstance(testDb.current);
    }
  });

  beforeEach(async () => {
    basemapCatalogService.replaceCustomBasemaps([]);
    await query(
      testDb.current!,
      'DROP TABLE IF EXISTS custom_basemap_attributes'
    );
  });

  it('does not persist the previous project custom basemaps into a project without any', async () => {
    await deserializeProjectData(projectWithCustomBasemap('basemap-b'));
    expect(customCatalogIds()).toEqual(['basemap-b']);

    await deserializeProjectData({} as SerializedProjectData);
    const savedA = await serializeProjectData({});

    expect(customCatalogIds()).toEqual([]);
    expect(savedA?.customBasemaps).toBeUndefined();
  });

  it('replaces rather than merges custom basemaps when switching between projects that both have some', async () => {
    await deserializeProjectData(projectWithCustomBasemap('basemap-b'));
    await deserializeProjectData(projectWithCustomBasemap('basemap-c'));
    const savedC = await serializeProjectData({});

    expect(savedC?.customBasemaps?.metadata.map((entry) => entry.file)).toEqual(
      ['basemap-c']
    );
    expect(
      savedC?.customBasemaps?.attributes.map((row) => row.basemap)
    ).toEqual(['basemap-c']);
  });

  it('keeps built-in catalog basemaps when resetting custom ones', async () => {
    basemapCatalogService.addCustomBasemap(basemap('world-countries', false));
    await deserializeProjectData(projectWithCustomBasemap('basemap-b'));

    await deserializeProjectData({} as SerializedProjectData);

    expect(
      basemapCatalogService.getBasemapById('world-countries')
    ).not.toBeNull();
    expect(customCatalogIds()).toEqual([]);
  });
});
