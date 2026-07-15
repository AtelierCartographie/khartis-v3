import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Table } from 'apache-arrow/Arrow';

const mocks = vi.hoisted(() => ({
  getJoinedArrowTable: vi.fn(),
  initDuckDB: vi.fn(),
  invalidateTableCache: vi.fn(),
  registerPersistence: vi.fn()
}));

vi.mock('../duck', () => ({
  Duck: {
    analyse: vi.fn(),
    invalidateTableCache: mocks.invalidateTableCache,
    query: vi.fn()
  },
  initDuckDB: mocks.initDuckDB
}));

vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showError: vi.fn()
}));

vi.mock('$lib/features/data-pipeline', () => ({
  extractGeoArrowMetadata: vi.fn()
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    loadGeometryIntoDuckDB: vi.fn(async () => 'basemap_geom_test')
  }
}));

vi.mock('$lib/features/project-management/core', () => ({
  SavePriority: {
    DEBOUNCED: 'debounced',
    IMMEDIATE: 'immediate'
  },
  persistenceRegistry: {
    register: mocks.registerPersistence
  }
}));

vi.mock('./join-ops', () => ({
  getBasemapAttributesId: vi.fn(),
  getJoinedArrowTable: mocks.getJoinedArrowTable,
  invalidateSimilarityCache: vi.fn()
}));

const { duckDBOrchestrator } = await import('./orchestrator.svelte');
const state = await import('./state.svelte');

function createFakeArrowTable(label: string): Table {
  return { label } as unknown as Table;
}

describe('duckDBOrchestrator joinedArrowCache bound', () => {
  beforeEach(() => {
    state.clearState();
    state.setInitialized(true);
    vi.clearAllMocks();
    mocks.getJoinedArrowTable.mockImplementation(
      async (datasetTableName: string, basemapId: string) =>
        createFakeArrowTable(`${datasetTableName}::${basemapId}`)
    );
  });

  it('should evict the oldest entry when a 5th joined table is cached', async () => {
    for (const table of ['t1', 't2', 't3', 't4']) {
      await duckDBOrchestrator.getJoinedArrowTable(table, 'basemap-a');
    }
    expect(mocks.getJoinedArrowTable).toHaveBeenCalledTimes(4);

    await duckDBOrchestrator.getJoinedArrowTable('t1', 'basemap-a');
    expect(mocks.getJoinedArrowTable).toHaveBeenCalledTimes(4);

    await duckDBOrchestrator.getJoinedArrowTable('t5', 'basemap-a');
    expect(mocks.getJoinedArrowTable).toHaveBeenCalledTimes(5);

    await duckDBOrchestrator.getJoinedArrowTable('t1', 'basemap-a');
    expect(mocks.getJoinedArrowTable).toHaveBeenCalledTimes(6);

    await duckDBOrchestrator.getJoinedArrowTable('t5', 'basemap-a');
    expect(mocks.getJoinedArrowTable).toHaveBeenCalledTimes(6);
  });

  it('should return the cached table instance on a repeated key', async () => {
    const first = await duckDBOrchestrator.getJoinedArrowTable(
      'dataset',
      'basemap-a'
    );
    const second = await duckDBOrchestrator.getJoinedArrowTable(
      'dataset',
      'basemap-a'
    );

    expect(second).toBe(first);
    expect(mocks.getJoinedArrowTable).toHaveBeenCalledTimes(1);
  });
});
