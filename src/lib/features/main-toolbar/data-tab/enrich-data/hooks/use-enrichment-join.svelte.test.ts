import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEnrichmentJoin } from './use-enrichment-join.svelte';

const mocks = vi.hoisted(() => {
  const selectedDataset = {
    id: 'dataset-1',
    tableName: 'geo_table',
    columns: [{ name: 'id', type: 'TEXT' }],
    geometry: { columnName: 'geom' as const }
  };

  return {
    selectedDataset,
    computeDatasetJoinStatsMock: vi.fn(),
    dropTableMock: vi.fn(),
    queryMock: vi.fn(),
    refreshDatasetMetadataMock: vi.fn(),
    setEnrichDataStateMock: vi.fn(),
    updateDatasetMock: vi.fn(
      (datasetId: string, patch: Record<string, unknown>) => {
        if (datasetId === selectedDataset.id) {
          Object.assign(selectedDataset, patch);
        }
      }
    ),
    updateDatasetTableNameMock: vi.fn()
  };
});

vi.mock('$lib/features/commons/store/data-tab.store.svelte', () => ({
  dataTabActions: {
    setEnrichDataState: (...args: unknown[]) =>
      mocks.setEnrichDataStateMock(...args)
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    get selectedDataset() {
      return mocks.selectedDataset;
    },
    updateDataset: (id: string, patch: Record<string, unknown>) =>
      mocks.updateDatasetMock(id, patch)
  }
}));

vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: {
    currentProject: null,
    saveCurrentProject: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/sanitize.utils', () => ({
  escapeIdentifier: (value: string) => value,
  escapeSqlString: (value: string) => value
}));

vi.mock('$lib/features/commons/utils/persisted-geojson.utils', () => ({
  sanitizePreparedGeoJSON: (value: string) => value
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DATA: 'DATA'
  },
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    analyse: vi.fn(),
    dropTable: (...args: unknown[]) => mocks.dropTableMock(...args),
    query: (...args: unknown[]) => mocks.queryMock(...args)
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    updateDatasetTableName: (...args: unknown[]) =>
      mocks.updateDatasetTableNameMock(...args)
  }
}));

vi.mock('../../services/dataset-metadata', () => ({
  refreshDatasetMetadata: (...args: unknown[]) =>
    mocks.refreshDatasetMetadataMock(...args)
}));

vi.mock('../../services/join-stats.service', () => ({
  computeDatasetJoinStats: (...args: unknown[]) =>
    mocks.computeDatasetJoinStatsMock(...args)
}));

describe('useEnrichmentJoin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectedDataset.id = 'dataset-1';
    mocks.selectedDataset.tableName = 'geo_table';
    mocks.selectedDataset.columns = [{ name: 'id', type: 'TEXT' }];

    vi.spyOn(Date, 'now').mockReturnValue(1_777_777_777_777);

    mocks.computeDatasetJoinStatsMock.mockResolvedValue({
      joinedCount: 3,
      toVerifyCount: 0,
      duplicateCount: 0,
      unrecognizedCount: 0,
      totalEntities: 3,
      entities: [
        {
          dataValue: 'A',
          geoValue: 'A',
          status: JoinStatus.JOINED
        }
      ]
    });
    mocks.queryMock.mockResolvedValue([]);
    mocks.refreshDatasetMetadataMock.mockResolvedValue({
      duckColumns: [],
      enrichedColumns: [],
      rowCount: 3
    });
    mocks.dropTableMock.mockResolvedValue(undefined);
    mocks.updateDatasetTableNameMock.mockResolvedValue(undefined);
  });

  it('refreshes dataset metadata from DuckDB after finalizing enrichment', async () => {
    const onJoinFinalized = vi.fn();
    const enrichmentDataset = {
      tableName: 'enrichment_table',
      columns: [
        { name: '__id' },
        { name: 'id' },
        { name: 'population_2024' },
        { name: 'category' }
      ]
    };

    const hook = useEnrichmentJoin({
      getEnrichmentDataset: () => enrichmentDataset as never,
      getEnrichLinkedVariableId: () => 1,
      getGeoFileColumnId: () => 2,
      getEnrichDataFieldItems: () => [{ id: 1, columnName: 'id' }],
      getGeoFileColumns: () => [{ id: 2, columnName: 'id' }],
      onJoinFinalized
    });

    await hook.computeEnrichmentJoinStats();
    await hook.handleFinalizeEnrichment();

    const enrichedTableName = 'geo_table_enriched_1777777777777';

    expect(mocks.updateDatasetMock).toHaveBeenCalledWith('dataset-1', {
      tableName: enrichedTableName
    });
    expect(mocks.refreshDatasetMetadataMock).toHaveBeenCalledWith(
      'dataset-1',
      enrichedTableName,
      { force: true }
    );
    expect(mocks.updateDatasetTableNameMock).toHaveBeenCalledWith(
      'dataset-1',
      enrichedTableName
    );
    expect(mocks.dropTableMock).toHaveBeenCalledWith('geo_table');
    expect(mocks.setEnrichDataStateMock).toHaveBeenCalledWith({
      enrichmentDatasetId: undefined,
      enrichmentColumn: undefined,
      targetColumn: undefined,
      isEnrichmentActive: false
    });
    expect(onJoinFinalized).toHaveBeenCalledTimes(1);
  });

  it('keeps a fresh dataset columns reference after finalizing enrichment', async () => {
    const previousColumns = mocks.selectedDataset.columns;
    const enrichedColumns = [
      { name: 'id', type: 'TEXT' },
      { name: '2020', type: 'number' }
    ];
    mocks.refreshDatasetMetadataMock.mockImplementationOnce(
      async (datasetId: string) => {
        mocks.updateDatasetMock(datasetId, {
          columns: [...enrichedColumns]
        });
        return {
          duckColumns: [],
          enrichedColumns,
          rowCount: 3
        };
      }
    );

    const hook = useEnrichmentJoin({
      getEnrichmentDataset: () =>
        ({
          tableName: 'enrichment_table',
          columns: [{ name: 'id' }, { name: '2020' }]
        }) as never,
      getEnrichLinkedVariableId: () => 1,
      getGeoFileColumnId: () => 2,
      getEnrichDataFieldItems: () => [{ id: 1, columnName: 'id' }],
      getGeoFileColumns: () => [{ id: 2, columnName: 'id' }],
      onJoinFinalized: vi.fn()
    });

    await hook.computeEnrichmentJoinStats();
    await hook.handleFinalizeEnrichment();

    expect(mocks.selectedDataset.columns).not.toBe(previousColumns);
    expect(mocks.selectedDataset.columns).not.toBe(enrichedColumns);
    expect(mocks.selectedDataset.columns).toEqual(enrichedColumns);
  });

  it('does not compute join stats when enrichment is blocked', async () => {
    const hook = useEnrichmentJoin({
      getEnrichmentDataset: () =>
        ({
          tableName: 'enrichment_table',
          columns: [{ name: 'id' }]
        }) as never,
      getEnrichLinkedVariableId: () => 1,
      getGeoFileColumnId: () => 2,
      getEnrichDataFieldItems: () => [{ id: 1, columnName: 'id' }],
      getGeoFileColumns: () => [{ id: 2, columnName: 'id' }],
      isJoinBlocked: () => true,
      onJoinFinalized: vi.fn()
    });

    await hook.computeEnrichmentJoinStats();

    expect(mocks.computeDatasetJoinStatsMock).not.toHaveBeenCalled();
    expect(hook.joinStats).toBeNull();
  });
});
