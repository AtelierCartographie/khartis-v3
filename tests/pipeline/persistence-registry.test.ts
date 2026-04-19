import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  persistenceRegistry,
  SavePriority
} from '$lib/features/project-management/core/persistence-registry';

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
  LogCategory: { PERSISTENCE: 'PERSISTENCE' }
}));

async function flushMicrotasks(iterations = 3): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  persistenceRegistry.markClean();
  persistenceRegistry.setSaveCallback(async () => {});
});

describe('persistenceRegistry.flush', () => {
  it('coalesces immediate notifications while a save is already in flight', async () => {
    let resolveFirstFlush: (() => void) | undefined;
    const firstFlush = new Promise<void>((resolve) => {
      resolveFirstFlush = resolve;
    });

    const saveCallback = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => firstFlush)
      .mockResolvedValueOnce(undefined);

    persistenceRegistry.setSaveCallback(saveCallback);

    persistenceRegistry.notifyChange('basemapStyle', SavePriority.IMMEDIATE);
    persistenceRegistry.notifyChange('mapViewState', SavePriority.IMMEDIATE);
    persistenceRegistry.notifyChange('globalUi', SavePriority.IMMEDIATE);

    expect(saveCallback).toHaveBeenCalledTimes(1);

    resolveFirstFlush?.();
    await firstFlush;
    await flushMicrotasks();

    expect(saveCallback).toHaveBeenCalledTimes(2);
  });
});
