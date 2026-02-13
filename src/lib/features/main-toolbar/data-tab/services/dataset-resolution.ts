import type { DatasetResult } from '$lib/features/data-pipeline';
import type { DuckDBDataset } from '$lib/features/duckdb';

type DatasetRef = Pick<DatasetResult, 'id' | 'sourceFileId' | 'tableName'>;
type DuckDatasetRef = Pick<DuckDBDataset, 'id' | 'sourceFileId' | 'tableName'>;

export function resolveDatasetIdForOrchestrator(
  selectedDataset: DatasetRef | null | undefined
): string | undefined {
  if (!selectedDataset) return undefined;

  // Prefer sourceFileId — it's the common key between the UI datasets store
  // and the DuckDB orchestrator state (which generates its own id).
  if (selectedDataset.sourceFileId) {
    return selectedDataset.sourceFileId;
  }

  return selectedDataset.id || undefined;
}

export function resolveSelectedDuckTableName(
  selectedDataset: DatasetRef | null | undefined,
  duckDatasets: DuckDatasetRef[]
): string | null {
  if (!selectedDataset) return null;

  if (selectedDataset.tableName) {
    const hasSelectedTable =
      duckDatasets.length === 0 ||
      duckDatasets.some(
        (dataset) => dataset.tableName === selectedDataset.tableName
      );
    if (hasSelectedTable) {
      return selectedDataset.tableName;
    }
  }

  if (selectedDataset.id) {
    const byId = duckDatasets.find(
      (dataset) => dataset.id === selectedDataset.id
    );
    if (byId?.tableName) {
      return byId.tableName;
    }
  }

  if (selectedDataset.sourceFileId) {
    const bySourceFile = duckDatasets.find(
      (dataset) => dataset.sourceFileId === selectedDataset.sourceFileId
    );
    if (bySourceFile?.tableName) {
      return bySourceFile.tableName;
    }
  }

  return null;
}
