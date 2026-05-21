import { describe, expect, it, vi } from 'vitest';
import { FileType, type DuckDBDataset } from '../types';
import type { DuckDBClientForDataset } from './dataset-ops';

vi.mock('$lib/features/data-pipeline', () => ({
  generateTableName: vi.fn()
}));

vi.mock('$lib/features/data-pipeline/processors/processor-registry', () => ({
  getProcessor: vi.fn(),
  hasProcessor: vi.fn()
}));

vi.mock('$lib/features/data-pipeline/processors/register-processors', () => ({
  registerAllProcessors: vi.fn()
}));

const { dropTable, updateDatasetJoinInfo } = await import('./dataset-ops');
const { clearState, getDatasetsVersion, getState } =
  await import('./state.svelte');

describe('dataset-ops', () => {
  it('escapes table names as SQL identifiers when dropping a table', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const duck = { query } as unknown as DuckDBClientForDataset;

    await dropTable('imported"table', duck);

    expect(query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "imported""table"'
    );
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
