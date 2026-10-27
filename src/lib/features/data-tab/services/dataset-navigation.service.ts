import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { globalActions } from '$lib/features/commons/stores/global.svelte';
import { dataTabStore } from '../stores/data-tab.store.svelte';
import { dataToolsStore } from '../stores/data-tools.store.svelte';

/** Opens the data tab of a dataset, as a click on its file tab would. */
export function openDatasetTab(datasetId: string): void {
  const dataset = datasetsStore.datasets.find(
    (candidate) => candidate.id === datasetId
  );
  if (!dataset || datasetsStore.selectedDatasetId === datasetId) return;

  dataTabStore.reset();
  dataToolsStore.reset();
  globalActions.selectDataButton(dataset.sourceFileId, {
    notifyDataTabReset: true
  });
  datasetsStore.selectDataset(datasetId);
}
