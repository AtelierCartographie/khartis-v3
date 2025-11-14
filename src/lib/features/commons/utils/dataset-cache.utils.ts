import type { DatasetResult } from '$lib/features/data';

const CACHE_COLUMN_SAMPLE_SIZE = 25;

function cloneDataset<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createDatasetCacheSnapshot(
  dataset: DatasetResult
): DatasetResult {
  const snapshot = cloneDataset(dataset);

  snapshot.data = [];
  snapshot.originalData = undefined;

  snapshot.columns = snapshot.columns.map((column) => ({
    ...column,
    values: column.values?.slice(0, CACHE_COLUMN_SAMPLE_SIZE) ?? []
  }));

  if (snapshot.analysis?.columns) {
    snapshot.analysis.columns = snapshot.analysis.columns.map((column) => ({
      ...column,
      sampleValues: column.sampleValues?.slice(0, CACHE_COLUMN_SAMPLE_SIZE)
    }));
  }

  return snapshot;
}
