import { describe, expect, it } from 'vitest';
import {
  resolveDatasetIdForOrchestrator,
  resolveSelectedDuckTableName
} from './dataset-resolution';

interface DatasetRef {
  id: string;
  sourceFileId: string;
  tableName: string;
}

interface DuckDatasetRef {
  id: string;
  sourceFileId: string;
  tableName: string;
}

describe('dataset-resolution', () => {
  it('prefers sourceFileId for orchestrator lookups', () => {
    const selectedDataset: DatasetRef = {
      id: 'dataset-b',
      sourceFileId: 'zip-source',
      tableName: 'table_b'
    };

    const datasetId = resolveDatasetIdForOrchestrator(selectedDataset);

    expect(datasetId).toBe('zip-source');
  });

  it('falls back to id when sourceFileId is empty', () => {
    const selectedDataset: DatasetRef = {
      id: 'dataset-b',
      sourceFileId: '',
      tableName: 'table_b'
    };

    const datasetId = resolveDatasetIdForOrchestrator(selectedDataset);

    expect(datasetId).toBe('dataset-b');
  });

  it('returns selected dataset table when available', () => {
    const selectedDataset: DatasetRef = {
      id: 'dataset-b',
      sourceFileId: 'zip-source',
      tableName: 'table_b'
    };

    const duckDatasets: DuckDatasetRef[] = [
      { id: 'dataset-a', sourceFileId: 'zip-source', tableName: 'table_a' },
      { id: 'dataset-b', sourceFileId: 'zip-source', tableName: 'table_b' }
    ];

    const tableName = resolveSelectedDuckTableName(
      selectedDataset,
      duckDatasets
    );

    expect(tableName).toBe('table_b');
  });

  it('falls back to dataset id before sourceFileId when selected table is stale', () => {
    const selectedDataset: DatasetRef = {
      id: 'dataset-b',
      sourceFileId: 'zip-source',
      tableName: 'stale_table_name'
    };

    const duckDatasets: DuckDatasetRef[] = [
      { id: 'dataset-a', sourceFileId: 'zip-source', tableName: 'table_a' },
      { id: 'dataset-b', sourceFileId: 'zip-source', tableName: 'table_b' }
    ];

    const tableName = resolveSelectedDuckTableName(
      selectedDataset,
      duckDatasets
    );

    expect(tableName).toBe('table_b');
  });

  it('falls back to sourceFileId when dataset id is not found', () => {
    const selectedDataset: DatasetRef = {
      id: 'unknown-id',
      sourceFileId: 'zip-source',
      tableName: 'stale_table_name'
    };

    const duckDatasets: DuckDatasetRef[] = [
      { id: 'dataset-a', sourceFileId: 'zip-source', tableName: 'table_a' }
    ];

    const tableName = resolveSelectedDuckTableName(
      selectedDataset,
      duckDatasets
    );

    expect(tableName).toBe('table_a');
  });
});
