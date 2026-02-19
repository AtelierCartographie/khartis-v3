import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatasetResult } from '$lib/features/data-pipeline';
import type { DatasetsState } from './datasets-state.svelte';
import { dataTabActions, dataTabState } from '../data-tab.store.svelte';
import { selectDataset } from './datasets-selection';
import { JoinStatus } from '../../constants/ui.constants';

function createDataset(id: string, sourceFileId: string): DatasetResult {
  return {
    id,
    name: id,
    sourceFileId,
    tableName: `table_${id}`,
    columns: [],
    rowCount: 0,
    metadata: {
      processedAt: new Date(),
      fileType: 'csv',
      parserUsed: 'test'
    }
  };
}

function createState(
  datasets: DatasetResult[],
  selectedDatasetId?: string
): DatasetsState {
  return {
    datasets,
    selectedDatasetId,
    enabledDatasetIds: new Set<string>() as DatasetsState['enabledDatasetIds'],
    isProcessing: false,
    hiddenColumns: new Map<string, Set<string>>()
  };
}

describe('datasets-selection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    dataTabActions.reset();
  });

  afterEach(() => {
    dataTabActions.reset();
  });

  it('resets data tab when switching to a dataset from another source file', () => {
    const resetSpy = vi.spyOn(dataTabActions, 'reset');
    const datasetA = createDataset('dataset-a', 'source-a');
    const datasetB = createDataset('dataset-b', 'source-b');
    const state = createState([datasetA, datasetB], datasetA.id);

    selectDataset(state, datasetB.id);

    expect(state.selectedDatasetId).toBe(datasetB.id);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('does not reset data tab when switching dataset id for the same source file', () => {
    const resetSpy = vi.spyOn(dataTabActions, 'reset');
    const datasetV1 = createDataset('dataset-v1', 'source-a');
    const datasetV2 = createDataset('dataset-v2', 'source-a');
    const state = createState([datasetV1, datasetV2], datasetV1.id);

    selectDataset(state, datasetV2.id);

    expect(state.selectedDatasetId).toBe(datasetV2.id);
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('does not reset data tab when selecting the already active dataset', () => {
    const resetSpy = vi.spyOn(dataTabActions, 'reset');
    const dataset = createDataset('dataset-a', 'source-a');
    const state = createState([dataset], dataset.id);

    selectDataset(state, dataset.id);

    expect(state.selectedDatasetId).toBe(dataset.id);
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it('resets join state when switching to a dataset from another source file', () => {
    const datasetA = createDataset('dataset-a', 'source-a');
    const datasetB = createDataset('dataset-b', 'source-b');
    const state = createState([datasetA, datasetB], datasetA.id);

    dataTabActions.selectBasemap('world-countries');
    dataTabActions.setJoinStats({
      joinedCount: 10,
      toVerifyCount: 2,
      duplicateCount: 1,
      unrecognizedCount: 1,
      totalEntities: 14,
      entities: [
        { dataValue: 'France', status: JoinStatus.JOINED, matches: [] }
      ]
    });

    expect(dataTabState.basemapJoin.joinedEntities).toBe(10);
    expect(dataTabState.basemapJoin.selectedBasemap).toBe('world-countries');

    selectDataset(state, datasetB.id);

    expect(state.selectedDatasetId).toBe(datasetB.id);
    expect(dataTabState.basemapJoin.joinedEntities).toBe(0);
    expect(dataTabState.basemapJoin.entitiesToVerify).toBe(0);
    expect(dataTabState.basemapJoin.duplicateEntities).toEqual([]);
    expect(dataTabState.basemapJoin.unrecognizedEntities).toEqual([]);
    expect(dataTabState.basemapJoin.joinMappings).toEqual([]);
    expect(dataTabState.basemapJoin.selectedBasemap).toBe('');
  });

  it('preserves join state when switching dataset id for the same source file', () => {
    const datasetV1 = createDataset('dataset-v1', 'source-a');
    const datasetV2 = createDataset('dataset-v2', 'source-a');
    const state = createState([datasetV1, datasetV2], datasetV1.id);

    dataTabActions.selectBasemap('world-countries');
    dataTabActions.setJoinStats({
      joinedCount: 10,
      toVerifyCount: 2,
      duplicateCount: 0,
      unrecognizedCount: 0,
      totalEntities: 12,
      entities: [
        { dataValue: 'France', status: JoinStatus.JOINED, matches: [] }
      ]
    });

    selectDataset(state, datasetV2.id);

    expect(state.selectedDatasetId).toBe(datasetV2.id);
    expect(dataTabState.basemapJoin.joinedEntities).toBe(10);
    expect(dataTabState.basemapJoin.selectedBasemap).toBe('world-countries');
  });
});
