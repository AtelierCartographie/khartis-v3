import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  persistenceRegistry.markClean();
  persistenceRegistry.setSaveCallback(async () => {});
  persistenceRegistry.setStatusCallback(null);
  persistenceRegistry.updateSavePolicy({
    enabled: true,
    debounceInterval: 750
  });
});

describe('persistenceRegistry.flush', () => {
  it('debounces changes with the configured save interval', async () => {
    const saveCallback = vi.fn<() => Promise<void>>().mockResolvedValue();

    persistenceRegistry.setSaveCallback(saveCallback);
    persistenceRegistry.notifyChange('globalUi');

    vi.advanceTimersByTime(749);
    await flushMicrotasks();
    expect(saveCallback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(saveCallback).toHaveBeenCalledOnce();
  });

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

  it('does not resolve a flush barrier until queued saves are durable', async () => {
    let resolveFirstSave: (() => void) | undefined;
    let resolveSecondSave: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirstSave = resolve;
    });
    const secondSave = new Promise<void>((resolve) => {
      resolveSecondSave = resolve;
    });
    const saveCallback = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => firstSave)
      .mockImplementationOnce(() => secondSave);

    persistenceRegistry.setSaveCallback(saveCallback);
    persistenceRegistry.notifyChange('first', SavePriority.IMMEDIATE);
    persistenceRegistry.notifyChange('second', SavePriority.IMMEDIATE);

    let barrierResolved = false;
    const flushBarrier = persistenceRegistry.flush().then(() => {
      barrierResolved = true;
    });

    resolveFirstSave?.();
    await firstSave;
    await flushMicrotasks();

    expect(saveCallback).toHaveBeenCalledTimes(2);
    expect(barrierResolved).toBe(false);

    resolveSecondSave?.();
    await secondSave;
    await flushBarrier;

    expect(barrierResolved).toBe(true);
    expect(persistenceRegistry.isDirty).toBe(false);
  });

  it('preserves an edit reported while the active save marks its generation clean', async () => {
    let resolveFirstSave: (() => void) | undefined;
    let resolveSecondSave: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirstSave = resolve;
    });
    const secondSave = new Promise<void>((resolve) => {
      resolveSecondSave = resolve;
    });
    const saveCallback = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => {
        await firstSave;
        persistenceRegistry.markClean();
      })
      .mockImplementationOnce(async () => {
        await secondSave;
        persistenceRegistry.markClean();
      });

    persistenceRegistry.setSaveCallback(saveCallback);
    persistenceRegistry.notifyChange('first', SavePriority.IMMEDIATE);
    persistenceRegistry.notifyChange('second', SavePriority.IMMEDIATE);

    let barrierResolved = false;
    const flushBarrier = persistenceRegistry.flush().then(() => {
      barrierResolved = true;
    });

    resolveFirstSave?.();
    await firstSave;
    await flushMicrotasks();

    expect(saveCallback).toHaveBeenCalledTimes(2);
    expect(persistenceRegistry.isDirty).toBe(false);
    expect(barrierResolved).toBe(false);

    resolveSecondSave?.();
    await secondSave;
    await flushBarrier;

    expect(barrierResolved).toBe(true);
    expect(persistenceRegistry.isDirty).toBe(false);
  });

  it('keeps manual-save edits dirty when they occur after the captured generation', () => {
    persistenceRegistry.notifyChange('before-save');
    const saveGeneration = persistenceRegistry.captureSaveGeneration();

    persistenceRegistry.notifyChange('during-save');
    persistenceRegistry.markClean(saveGeneration);

    expect(persistenceRegistry.isDirty).toBe(true);
  });

  it('does not auto-save while the save policy is disabled, but still flushes manually', async () => {
    const saveCallback = vi.fn<() => Promise<void>>().mockResolvedValue();

    persistenceRegistry.setSaveCallback(saveCallback);
    persistenceRegistry.updateSavePolicy({ enabled: false });
    persistenceRegistry.notifyChange('visualization');

    vi.runAllTimers();
    await flushMicrotasks();
    expect(saveCallback).not.toHaveBeenCalled();
    expect(persistenceRegistry.isDirty).toBe(true);

    await persistenceRegistry.flush();
    expect(saveCallback).toHaveBeenCalledOnce();
    expect(persistenceRegistry.isDirty).toBe(false);
  });

  it('ignores notifications while persistence is suspended', async () => {
    const saveCallback = vi.fn<() => Promise<void>>().mockResolvedValue();

    persistenceRegistry.setSaveCallback(saveCallback);

    await persistenceRegistry.withPersistenceSuspended(async () => {
      persistenceRegistry.notifyChange('dataTab', SavePriority.IMMEDIATE);
      persistenceRegistry.notifyChange('visualization');
    });

    vi.runAllTimers();
    await flushMicrotasks();
    expect(saveCallback).not.toHaveBeenCalled();
    expect(persistenceRegistry.isDirty).toBe(false);
  });

  it('releases only the aborted suspension and allows future saves', async () => {
    let finishInnerOperation: (() => void) | undefined;
    const innerOperation = new Promise<void>((resolve) => {
      finishInnerOperation = resolve;
    });
    const controller = new AbortController();
    const saveCallback = vi.fn<() => Promise<void>>().mockResolvedValue();

    persistenceRegistry.setSaveCallback(saveCallback);

    await persistenceRegistry.withPersistenceSuspended(async () => {
      const abortedSuspension = persistenceRegistry
        .withPersistenceSuspended(() => innerOperation, {
          signal: controller.signal
        })
        .catch(() => {});

      controller.abort(new Error('Restore timed out'));
      await abortedSuspension;

      persistenceRegistry.notifyChange(
        'still-inside-outer-suspension',
        SavePriority.IMMEDIATE
      );
      expect(saveCallback).not.toHaveBeenCalled();

      finishInnerOperation?.();
      await innerOperation;
    });

    persistenceRegistry.notifyChange(
      'after-aborted-suspension',
      SavePriority.IMMEDIATE
    );
    await flushMicrotasks();

    expect(saveCallback).toHaveBeenCalledOnce();
  });

  it('publishes dirty and last-saved status through the status callback', async () => {
    const saveCallback = vi.fn<() => Promise<void>>().mockResolvedValue();
    const statusCallback = vi.fn();

    persistenceRegistry.setSaveCallback(saveCallback);
    persistenceRegistry.setStatusCallback(statusCallback);

    persistenceRegistry.notifyChange('globalUi');

    expect(statusCallback).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isDirty: true
      })
    );

    vi.advanceTimersByTime(750);
    await flushMicrotasks();

    const lastStatus = statusCallback.mock.calls.at(-1)?.[0] as
      { isDirty: boolean; lastSaved?: Date } | undefined;

    expect(lastStatus?.isDirty).toBe(false);
    expect(lastStatus?.lastSaved).toBeInstanceOf(Date);
  });
});
