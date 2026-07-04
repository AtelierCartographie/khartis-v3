import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForDatasetAvailability } from './dataset-availability.utils';

const mocks = vi.hoisted(() => ({
  getDatasetMock: vi.fn(),
  getDatasetBySourceFileMock: vi.fn()
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDataset: (...args: unknown[]) => mocks.getDatasetMock(...args),
    getDatasetBySourceFile: (...args: unknown[]) =>
      mocks.getDatasetBySourceFileMock(...args)
  }
}));

describe('waitForDatasetAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves when the dataset is already registered', async () => {
    mocks.getDatasetMock.mockReturnValueOnce({ id: 'dataset-1' });

    await expect(waitForDatasetAvailability('dataset-1')).resolves.toBe(true);

    expect(mocks.getDatasetMock).toHaveBeenCalledWith('dataset-1');
    expect(mocks.getDatasetBySourceFileMock).not.toHaveBeenCalled();
  });

  it('checks source-file registrations before retrying', async () => {
    mocks.getDatasetMock.mockReturnValueOnce(undefined);
    mocks.getDatasetBySourceFileMock.mockReturnValueOnce({ id: 'dataset-1' });

    await expect(waitForDatasetAvailability('source-1')).resolves.toBe(true);
  });

  it('returns false when cancelled before availability', async () => {
    await expect(
      waitForDatasetAvailability('dataset-1', {
        isCancelled: () => true,
        maxRetries: 1,
        retryDelayMs: 0
      })
    ).resolves.toBe(false);

    expect(mocks.getDatasetMock).not.toHaveBeenCalled();
  });

  it('retries until the dataset becomes available', async () => {
    mocks.getDatasetMock
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ id: 'dataset-1' });

    await expect(
      waitForDatasetAvailability('dataset-1', {
        maxRetries: 1,
        retryDelayMs: 0
      })
    ).resolves.toBe(true);

    expect(mocks.getDatasetMock).toHaveBeenCalledTimes(2);
  });
});
