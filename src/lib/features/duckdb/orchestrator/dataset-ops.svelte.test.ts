import { describe, expect, it, vi } from 'vitest';
import { FileType, type DuckDBDataset } from '../types';
import type { DuckDBClientForDataset } from './dataset-ops';

vi.mock('$lib/features/data-pipeline', () => ({
  generateTableName: vi.fn(),
  getProcessor: vi.fn(),
  registerAllProcessors: vi.fn()
}));

const { dropTable, updateDatasetJoinInfo } = await import('./dataset-ops');
const { clearState, getDatasetsVersion, getState } =
  await import('./state.svelte');

describe('dataset-ops', () => {
  it('drops tables through Duck so cache invalidation runs', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const duck = {
      query,
      dropTable: vi.fn().mockResolvedValue(undefined)
    } as unknown as DuckDBClientForDataset;

    await dropTable('imported"table', duck);

    expect(duck.dropTable).toHaveBeenCalledWith('imported"table');
    expect(query).not.toHaveBeenCalled();
  });

  it('rethrows when the Duck drop fails so callers do not assume the table is gone', async () => {
    const dropError = new Error('drop failed');
    const duck = {
      query: vi.fn().mockResolvedValue([]),
      dropTable: vi.fn().mockRejectedValue(dropError)
    } as unknown as DuckDBClientForDataset;

    await expect(dropTable('broken_table', duck)).rejects.toThrow(dropError);
  });

  it('does not bump the datasets version when join info is unchanged', () => {
    clearState();
    const dataset: DuckDBDataset = {
      id: 'dataset-1',
      tableName: 'population',
      sourceFileId: 'source-1',
      name: 'population.csv',
      columns: [],
      rowCount: 20,
      metadata: {
        processedAt: new Date('2026-05-21T00:00:00Z'),
        fileType: FileType.CSV
      },
      joinedBasemap: 'world',
      geoColumn: 'country_code',
      gpsMode: false
    };
    getState().datasets.set(dataset.id, dataset);
    const versionBefore = getDatasetsVersion();

    const didUpdate = updateDatasetJoinInfo(dataset.id, {
      joinedBasemap: 'world',
      geoColumn: 'country_code',
      gpsMode: false,
      gpsColumns: undefined
    });

    expect(didUpdate).toBe(false);
    expect(getDatasetsVersion()).toBe(versionBefore);
  });

  it('bumps the datasets version once when join info changes', () => {
    clearState();
    const dataset: DuckDBDataset = {
      id: 'dataset-1',
      tableName: 'population',
      sourceFileId: 'source-1',
      name: 'population.csv',
      columns: [],
      rowCount: 20,
      metadata: {
        processedAt: new Date('2026-05-21T00:00:00Z'),
        fileType: FileType.CSV
      },
      joinedBasemap: 'world',
      geoColumn: 'country_code',
      gpsMode: false
    };
    getState().datasets.set(dataset.id, dataset);
    const versionBefore = getDatasetsVersion();

    const didUpdate = updateDatasetJoinInfo(dataset.id, {
      geoColumn: 'country_name'
    });

    expect(didUpdate).toBe(true);
    expect(getDatasetsVersion()).toBe(versionBefore + 1);
    expect(getState().datasets.get(dataset.id)?.geoColumn).toBe('country_name');
  });
});
