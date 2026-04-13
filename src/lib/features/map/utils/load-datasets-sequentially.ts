export async function loadDatasetsSequentially<T>(
  datasets: readonly T[],
  loadDataset: (dataset: T) => Promise<void>
): Promise<void> {
  for (const dataset of datasets) {
    await loadDataset(dataset);
  }
}
