import { describe, expect, it } from 'vitest';
import { FileType, type DuckDBDataset } from '../types';

const { updateDatasetJoinInfo } = await import('./dataset-ops');
const { clearState, getDatasetsVersion, getState } =
  await import('./state.svelte');

describe('dataset-ops', () => {
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
  it('keeps the join key across a basemap variant and drops it with the join', () => {
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
      joinedBasemap: 'world-high',
      hasJoinKey: true,
      geoColumn: 'country_code',
      gpsMode: false
    };
    getState().datasets.set(dataset.id, dataset);

    updateDatasetJoinInfo(dataset.id, { joinedBasemap: 'world-low' });
    expect(getState().datasets.get(dataset.id)?.hasJoinKey).toBe(true);

    updateDatasetJoinInfo(dataset.id, {
      joinedBasemap: undefined,
      geoColumn: undefined
    });
    expect(getState().datasets.get(dataset.id)?.hasJoinKey).toBeUndefined();
  });
});
