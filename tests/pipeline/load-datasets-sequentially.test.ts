import { describe, expect, it, vi } from 'vitest';

import { loadDatasetsSequentially } from '$lib/features/map/utils/load-datasets-sequentially';

describe('loadDatasetsSequentially', () => {
  it('waits for each dataset load before starting the next one', async () => {
    const callOrder: string[] = [];
    let resolveFirst: (() => void) | undefined;

    const firstDone = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const loadDataset = vi.fn(async (dataset: string) => {
      callOrder.push(`start:${dataset}`);

      if (dataset === 'first') {
        await firstDone;
      }

      callOrder.push(`end:${dataset}`);
    });

    const sequence = loadDatasetsSequentially(['first', 'second'], loadDataset);

    await Promise.resolve();
    expect(callOrder).toEqual(['start:first']);

    resolveFirst?.();
    await sequence;

    expect(callOrder).toEqual([
      'start:first',
      'end:first',
      'start:second',
      'end:second'
    ]);
  });

  it('stops at the first failing dataset load', async () => {
    const loadDataset = vi.fn(async (dataset: string) => {
      if (dataset === 'broken') {
        throw new Error('boom');
      }
    });

    await expect(
      loadDatasetsSequentially(['ok', 'broken', 'later'], loadDataset)
    ).rejects.toThrow('boom');

    expect(loadDataset).toHaveBeenCalledTimes(2);
    expect(loadDataset).toHaveBeenNthCalledWith(1, 'ok');
    expect(loadDataset).toHaveBeenNthCalledWith(2, 'broken');
  });
});
