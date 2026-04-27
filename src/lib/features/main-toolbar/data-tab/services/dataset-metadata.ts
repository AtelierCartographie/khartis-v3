import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import {
  readDatasetTableSnapshot,
  type DatasetTableSnapshot
} from '$lib/features/data-pipeline/operations/analysis';

export async function refreshDatasetMetadata(
  datasetId: string,
  tableName: string,
  options: { force?: boolean } = {}
): Promise<DatasetTableSnapshot> {
  const snapshot = await readDatasetTableSnapshot(tableName, options);

  datasetsStore.updateDataset(datasetId, {
    columns: [...snapshot.enrichedColumns]
  });
  datasetsStore.updateDatasetRowCount(datasetId, snapshot.rowCount);

  return snapshot;
}
