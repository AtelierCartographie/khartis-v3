import type { DatasetAttachment } from '$lib/features/commons/types/create-project.types';

interface SourceFileRef {
  id: string;
  attachedTo?: DatasetAttachment;
}

interface DatasetRef {
  id: string;
  name: string;
  sourceFileId: string;
}

/** The geo file a dataset's table was joined into, if any. */
export function findDatasetAttachment(
  sourceFiles: readonly SourceFileRef[] | undefined,
  dataset: Pick<DatasetRef, 'sourceFileId'> | null | undefined
): DatasetAttachment | undefined {
  if (!dataset) return undefined;
  return sourceFiles?.find((file) => file.id === dataset.sourceFileId)
    ?.attachedTo;
}

/** The dataset an attachment points to; a renamed layer falls back to its file. */
export function findAttachedDataset<T extends DatasetRef>(
  datasets: readonly T[],
  attachment: DatasetAttachment | undefined
): T | undefined {
  if (!attachment) return undefined;
  const sameFile = datasets.filter(
    (dataset) => dataset.sourceFileId === attachment.sourceFileId
  );
  return (
    sameFile.find((dataset) => dataset.name === attachment.datasetName) ??
    sameFile[0]
  );
}

/**
 * The datasets offered for visualization: an attached table is part of its geo
 * file, so it is left out unless visualizations were already made from it.
 */
export function listVisualizableDatasets<T extends DatasetRef>(
  datasets: readonly T[],
  sourceFiles: readonly SourceFileRef[] | undefined,
  hasVisualizations: (datasetId: string) => boolean
): T[] {
  return datasets.filter((dataset) => {
    const attachment = findDatasetAttachment(sourceFiles, dataset);
    return (
      !attachment ||
      !findAttachedDataset(datasets, attachment) ||
      hasVisualizations(dataset.id)
    );
  });
}

/**
 * Source files once the geo file is reset or removed: the tables joined into
 * it become datasets of their own again.
 */
export function detachTablesFrom<T extends SourceFileRef>(
  sourceFiles: readonly T[],
  geoSourceFileId: string
): T[] {
  return sourceFiles.map((file) =>
    file.attachedTo?.sourceFileId === geoSourceFileId
      ? { ...file, attachedTo: undefined }
      : file
  );
}
