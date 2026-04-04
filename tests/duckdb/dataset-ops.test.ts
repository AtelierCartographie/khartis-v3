import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerSuccessMock: vi.fn(),
  loggerErrorMock: vi.fn()
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DUCKDB: 'DUCKDB'
  },
  logger: {
    info: mocks.loggerInfoMock,
    warn: mocks.loggerWarnMock,
    success: mocks.loggerSuccessMock,
    error: mocks.loggerErrorMock,
    debug: vi.fn()
  }
}));

vi.mock('$lib/features/data-pipeline', () => ({
  generateTableName: vi.fn((fileName: string) => fileName.replace(/\W+/g, '_'))
}));

vi.mock('$lib/features/data-pipeline/processors/processor-registry', () => ({
  getProcessor: vi.fn(),
  hasProcessor: vi.fn(() => false)
}));

vi.mock('$lib/features/data-pipeline/processors/register-processors', () => ({
  registerAllProcessors: vi.fn()
}));

import { FileType } from '$lib/features/commons/store/create-project.types';
import type { DuckDBDataset } from '$lib/features/duckdb/types';
import { registerExistingTable } from '$lib/features/duckdb/orchestrator/dataset-ops';
import {
  clearState,
  getAllDatasets,
  getDatasetBySourceFile,
  updateDatasets
} from '$lib/features/duckdb/orchestrator/state.svelte';

describe('duckdb dataset registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearState();
  });

  it('returns the latest dataset when several entries share the same source file id', () => {
    updateDatasets((datasets) => {
      datasets.set('old', {
        id: 'old',
        sourceFileId: 'sf1',
        tableName: 'table_old'
      } as DuckDBDataset);
      datasets.set('new', {
        id: 'new',
        sourceFileId: 'sf1',
        tableName: 'table_new'
      } as DuckDBDataset);
    });

    expect(getDatasetBySourceFile('sf1')?.tableName).toBe('table_new');
  });

  it('deduplicates stale registrations for the same source file', async () => {
    updateDatasets((datasets) => {
      datasets.set('old', {
        id: 'old',
        sourceFileId: 'sf1',
        tableName: 'table_old'
      } as DuckDBDataset);
      datasets.set('current', {
        id: 'current',
        sourceFileId: 'sf1',
        tableName: 'table_current'
      } as DuckDBDataset);
    });

    const duck = {
      query: vi.fn().mockResolvedValue([{ table_name: 'table_registered' }]),
      analyse: vi.fn().mockResolvedValue([{ name: 'value' }])
    };
    const callbacks = {
      getRowCount: vi.fn().mockResolvedValue(42),
      createArrowTableWithMetadata: vi.fn(),
      prefetchArrowMetadata: vi.fn().mockResolvedValue(undefined)
    };

    const dataset = await registerExistingTable(
      'table_registered',
      'sf1',
      'example.csv',
      duck,
      callbacks
    );

    expect(dataset?.id).toBe('current');
    expect(getDatasetBySourceFile('sf1')?.tableName).toBe('table_registered');
    expect(
      getAllDatasets().filter((item) => item.sourceFileId === 'sf1')
    ).toEqual([
      expect.objectContaining({
        id: 'current',
        name: 'example.csv',
        sourceFileId: 'sf1',
        tableName: 'table_registered',
        rowCount: 42,
        metadata: expect.objectContaining({
          fileType: FileType.CSV
        })
      })
    ]);
    expect(callbacks.prefetchArrowMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'current',
        sourceFileId: 'sf1',
        tableName: 'table_registered'
      })
    );
  });

  it('preserves persisted join metadata when re-registering a source file', async () => {
    updateDatasets((datasets) => {
      datasets.set('current', {
        id: 'current',
        sourceFileId: 'sf1',
        tableName: 'table_old',
        joinedBasemap: 'monde-countries-2024-medium',
        geoColumn: 'code'
      } as DuckDBDataset);
    });

    const duck = {
      query: vi.fn().mockResolvedValue([{ table_name: 'table_registered' }]),
      analyse: vi.fn().mockResolvedValue([{ name: 'value' }])
    };
    const callbacks = {
      getRowCount: vi.fn().mockResolvedValue(42),
      createArrowTableWithMetadata: vi.fn(),
      prefetchArrowMetadata: vi.fn().mockResolvedValue(undefined)
    };

    const dataset = await registerExistingTable(
      'table_registered',
      'sf1',
      'example.csv',
      duck,
      callbacks
    );

    expect(dataset).toEqual(
      expect.objectContaining({
        id: 'current',
        tableName: 'table_registered',
        joinedBasemap: 'monde-countries-2024-medium',
        geoColumn: 'code'
      })
    );
  });

  it('reuses the preferred stable dataset id when no DuckDB entry exists yet', async () => {
    const duck = {
      query: vi.fn().mockResolvedValue([{ table_name: 'table_registered' }]),
      analyse: vi.fn().mockResolvedValue([{ name: 'value' }])
    };
    const callbacks = {
      getRowCount: vi.fn().mockResolvedValue(42),
      createArrowTableWithMetadata: vi.fn(),
      prefetchArrowMetadata: vi.fn().mockResolvedValue(undefined)
    };

    const dataset = await registerExistingTable(
      'table_registered',
      'sf1',
      'example.csv',
      duck,
      callbacks,
      {
        preferredDatasetId: 'stable-dataset-id'
      }
    );

    expect(dataset?.id).toBe('stable-dataset-id');
    expect(getDatasetBySourceFile('sf1')).toEqual(
      expect.objectContaining({
        id: 'stable-dataset-id',
        sourceFileId: 'sf1',
        tableName: 'table_registered'
      })
    );
  });
});
