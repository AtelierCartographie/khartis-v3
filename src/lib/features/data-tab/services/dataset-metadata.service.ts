import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import {
  type DatasetTableSnapshot,
  readDatasetTableSnapshot
} from '$lib/features/data-pipeline';

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
