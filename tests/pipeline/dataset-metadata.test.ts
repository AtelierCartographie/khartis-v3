import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshSnapshotMock: vi.fn(),
  updateDatasetMock: vi.fn(),
  updateDatasetRowCountMock: vi.fn()
}));

vi.mock('$lib/features/data-pipeline/operations/analysis', () => ({
  readDatasetTableSnapshot: mocks.refreshSnapshotMock
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    updateDataset: mocks.updateDatasetMock,
    updateDatasetRowCount: mocks.updateDatasetRowCountMock
  }
}));

import { refreshDatasetMetadata } from '$lib/features/main-toolbar/data-tab/services/dataset-metadata';

describe('refreshDatasetMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates dataset columns and row count from the DuckDB snapshot', async () => {
    mocks.refreshSnapshotMock.mockResolvedValue({
      duckColumns: [{ name: 'published', type_simple: 'boolean' }],
      enrichedColumns: [
        {
          name: 'published',
          type: 'boolean',
          values: [],
          stats: {
            name: 'published',
            type: 'boolean',
            count: 12,
            nulls: 0,
            uniques: 2
          }
        }
      ],
      rowCount: 12
    });

    const snapshot = await refreshDatasetMetadata('dataset-1', 'duck_table', {
      force: true
    });

    expect(mocks.refreshSnapshotMock).toHaveBeenCalledWith('duck_table', {
      force: true
    });
    expect(mocks.updateDatasetMock).toHaveBeenCalledWith('dataset-1', {
      columns: snapshot.enrichedColumns
    });
    expect(mocks.updateDatasetRowCountMock).toHaveBeenCalledWith(
      'dataset-1',
      12
    );
  });
});
