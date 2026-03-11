import type { DatasetResult } from '$lib/features/data-pipeline';
import type { DuckDBDataset } from '$lib/features/duckdb';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';

type OrthographicDatasetRef =
  | Pick<DatasetResult, 'geometry'>
  | null
  | undefined;
type OrthographicDuckDatasetRef =
  | Pick<DuckDBDataset, 'joinedBasemap'>
  | null
  | undefined;

interface ResolveOrthographicReferenceTableOptions {
  dataset: OrthographicDatasetRef;
  duckDataset: OrthographicDuckDatasetRef;
  datasetTable: ArrowTable;
  basemapTable?: ArrowTable | null;
}

export function shouldUseBasemapReferenceInOrthographicView(
  dataset: OrthographicDatasetRef,
  duckDataset: OrthographicDuckDatasetRef
): boolean {
  return Boolean(duckDataset?.joinedBasemap) && !dataset?.geometry;
}

export function resolveOrthographicReferenceTable({
  dataset,
  duckDataset,
  datasetTable,
  basemapTable = null
}: ResolveOrthographicReferenceTableOptions): ArrowTable | null {
  if (shouldUseBasemapReferenceInOrthographicView(dataset, duckDataset)) {
    return basemapTable;
  }

  return datasetTable;
}
