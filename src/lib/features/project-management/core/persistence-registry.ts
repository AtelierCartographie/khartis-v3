import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export const SavePriority = {
  IMMEDIATE: 'immediate',
  DEBOUNCED: 'debounced'
} as const;

export type SavePriorityType = (typeof SavePriority)[keyof typeof SavePriority];

export interface PersistenceSavePolicy {
  enabled: boolean;
  debounceInterval: number;
}

export interface PersistenceStatus {
  isDirty: boolean;
  lastSaved?: Date;
}

export interface PersistenceSuspensionOptions {
  signal?: AbortSignal;
}

export interface PersistenceEntry<T = unknown> {
  key: string;
  serialize: () => T;
  deserialize: (data: T) => void;
  reset: () => void;
  priority: SavePriorityType;
}

export const DEFAULT_DEBOUNCE_INTERVAL = 750;

class PersistenceRegistryImpl {
  private entries = new Map<string, PersistenceEntry>();

  private saveCallback: (() => Promise<void>) | null = null;

  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  private dirty = false;

  private changeGeneration = 0;

  private persistedGeneration = 0;

  private activeSaveGeneration: number | null = null;

  private flushInFlight: Promise<void> | null = null;

  private flushQueued = false;

  private savePolicy: PersistenceSavePolicy = {
    enabled: true,
    debounceInterval: DEFAULT_DEBOUNCE_INTERVAL
  };

  private statusCallback: ((status: PersistenceStatus) => void) | null = null;

  private lastSavedAt: Date | undefined;

  private activeSuspensions = new Set<symbol>();

  get isDirty(): boolean {
    return this.dirty;
  }

  get lastSaved(): Date | undefined {
    return this.lastSavedAt;
  }

  get currentSavePolicy(): PersistenceSavePolicy {
    return { ...this.savePolicy };
  }

  captureSaveGeneration(): number {
    return this.changeGeneration;
  }

  setSaveCallback(cb: () => Promise<void>): void {
    this.saveCallback = cb;
  }

  setStatusCallback(cb: ((status: PersistenceStatus) => void) | null): void {
    this.statusCallback = cb;
    this.emitStatus();
  }

  updateSavePolicy(partial: Partial<PersistenceSavePolicy>): void {
    this.savePolicy = {
      ...this.savePolicy,
      ...partial
    };

    if (!this.savePolicy.enabled) {
      this.cancelDebounce();
    } else if (this.dirty) {
      this.scheduleDebounce();
    }

    this.emitStatus();
  }

  async withPersistenceSuspended<T>(
    operation: () => Promise<T> | T,
    options: PersistenceSuspensionOptions = {}
  ): Promise<T> {
    const suspension = Symbol('persistence-suspension');
    let released = false;
    let handleAbort = () => {};

    const release = () => {
      if (released) {
        return;
      }

      released = true;
      this.activeSuspensions.delete(suspension);
      options.signal?.removeEventListener('abort', handleAbort);
    };

    const abortPromise = options.signal
      ? new Promise<never>((_, reject) => {
          const rejectFromAbort = () => {
            release();
            reject(
              options.signal?.reason instanceof Error
                ? options.signal.reason
                : new Error('Persistence suspension aborted')
            );
          };

          handleAbort = rejectFromAbort;
        })
      : null;

    this.activeSuspensions.add(suspension);
    this.cancelDebounce();

    if (options.signal?.aborted) {
      release();
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new Error('Persistence suspension aborted');
    }

    options.signal?.addEventListener('abort', handleAbort, { once: true });

    try {
      const operationPromise = Promise.resolve(operation());
      return await (abortPromise
        ? Promise.race([operationPromise, abortPromise])
        : operationPromise);
    } finally {
      release();
    }
  }

  register<T>(entry: PersistenceEntry<T>): void {
    // HMR can re-run store modules; replacing by key keeps registration idempotent.
    this.entries.set(entry.key, entry as PersistenceEntry);
  }

  unregister(key: string): void {
    this.entries.delete(key);
  }

  notifyChange(key: string, priority?: SavePriorityType): void {
    if (this.activeSuspensions.size > 0) {
      return;
    }

    const resolvedPriority =
      priority ?? this.entries.get(key)?.priority ?? SavePriority.DEBOUNCED;

    this.changeGeneration += 1;
    this.dirty = true;
    this.emitStatus();

    if (!this.savePolicy.enabled) {
      return;
    }

    if (resolvedPriority === SavePriority.IMMEDIATE) {
      this.cancelDebounce();
      void this.flush();
    } else {
      this.scheduleDebounce();
    }
  }

  serializeAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of this.entries) {
      try {
        result[key] = entry.serialize();
      } catch (error) {
        logger.error(
          `Failed to serialize store "${key}"`,
          LogCategory.PERSISTENCE,
          error
        );
      }
    }
    return result;
  }

  deserializeAll(data: Record<string, unknown>): void {
    for (const [key, entry] of this.entries) {
      if (!(key in data)) continue;
      try {
        entry.deserialize(data[key]);
      } catch (error) {
        logger.error(
          `Failed to deserialize store "${key}"`,
          LogCategory.PERSISTENCE,
          error
        );
      }
    }
  }

  resetAll(): void {
    for (const [key, entry] of this.entries) {
      try {
        entry.reset();
      } catch (error) {
        logger.error(
          `Failed to reset store "${key}"`,
          LogCategory.PERSISTENCE,
          error
        );
      }
    }
  }

  get registeredKeys(): string[] {
    return [...this.entries.keys()];
  }

  flush(): Promise<void> {
    this.cancelDebounce();

    if (this.activeSuspensions.size > 0) {
      return Promise.resolve();
    }

    if (this.flushInFlight) {
      this.flushQueued = true;
      return this.flushInFlight;
    }

    if (!this.dirty || !this.saveCallback) {
      return Promise.resolve();
    }

    this.flushInFlight = this.drainFlushQueue().finally(() => {
      this.flushInFlight = null;
    });

    return this.flushInFlight;
  }

  private async drainFlushQueue(): Promise<void> {
    while (this.dirty && this.saveCallback) {
      this.flushQueued = false;
      const saveGeneration = this.changeGeneration;
      this.dirty = false;
      this.activeSaveGeneration = saveGeneration;
      this.emitStatus();

      try {
        await this.saveCallback();
        this.markClean(saveGeneration);
        this.lastSavedAt = new Date();
        this.emitStatus();
      } catch (error) {
        this.dirty = true;
        this.emitStatus();
        logger.error(
          'Persistence flush failed',
          LogCategory.PERSISTENCE,
          error
        );
        return;
      } finally {
        this.activeSaveGeneration = null;
      }

      if (!this.flushQueued && !this.dirty) {
        return;
      }
    }

    this.flushQueued = false;
  }

  markClean(
    savedGeneration = this.activeSaveGeneration ?? this.changeGeneration
  ): void {
    this.cancelDebounce();
    this.persistedGeneration = Math.max(
      this.persistedGeneration,
      Math.min(savedGeneration, this.changeGeneration)
    );
    this.dirty = this.changeGeneration > this.persistedGeneration;
    this.flushQueued = this.flushQueued && this.dirty;
    this.emitStatus();
  }

  private scheduleDebounce(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.flush();
    }, this.savePolicy.debounceInterval);
  }

  private cancelDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  private emitStatus(): void {
    this.statusCallback?.({
      isDirty: this.dirty,
      lastSaved: this.lastSavedAt
    });
  }
}

export const persistenceRegistry = new PersistenceRegistryImpl();
