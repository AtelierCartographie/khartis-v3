import { describe, expect, it, vi } from 'vitest';
import type { DatasetsInternals, DatasetsState } from './datasets-state.svelte';
import { waitForDatasetBySourceFile } from './datasets-crud';

function createState(): DatasetsState {
  return {
    datasets: [],
    enabledDatasetIds: new Set() as DatasetsState['enabledDatasetIds'],
    hiddenColumns: new Map(),
    isProcessing: false
  };
}

function createInternals(): DatasetsInternals {
  return {
    activeOperations: 0,
    pendingDatasetResolvers: new Map()
  };
}

describe('waitForDatasetBySourceFile', () => {
  it('should resolve immediately when the dataset already exists', async () => {
    const state = createState();
    state.datasets = [
      {
        id: 'dataset-1',
        sourceFileId: 'source-1'
      } as DatasetsState['datasets'][number]
    ];

    await expect(
      waitForDatasetBySourceFile(state, createInternals(), 'source-1')
    ).resolves.toBe('dataset-1');
  });

  it('should reject and remove its resolver after the timeout', async () => {
    vi.useFakeTimers();
    const internals = createInternals();
    const pendingSelection = waitForDatasetBySourceFile(
      createState(),
      internals,
      'missing-source',
      20
    );
    const rejection = expect(pendingSelection).rejects.toThrow(
      'Dataset selection timed out'
    );

    await vi.advanceTimersByTimeAsync(20);

    await rejection;
    expect(internals.pendingDatasetResolvers.has('missing-source')).toBe(false);
    vi.useRealTimers();
  });
});
