import type { DatasetResult } from '$lib/features/data-pipeline';

export type DatasetIdentity = string | null;

export function getDatasetIdentity(
  dataset: Pick<DatasetResult, 'id' | 'sourceFileId'> | null | undefined
): DatasetIdentity {
  const sourceFileId = dataset?.sourceFileId?.trim();
  if (sourceFileId) {
    return sourceFileId;
  }

  const datasetId = dataset?.id?.trim();
  return datasetId || null;
}

interface ShouldResetJoinStateInput {
  previousIdentity: DatasetIdentity;
  currentIdentity: DatasetIdentity;
  hasDatasets: boolean;
}

export function shouldResetJoinState({
  previousIdentity,
  currentIdentity,
  hasDatasets
}: ShouldResetJoinStateInput): boolean {
  if (previousIdentity === null) {
    return false;
  }

  if (currentIdentity === null) {
    return !hasDatasets;
  }

  return previousIdentity !== currentIdentity;
}
