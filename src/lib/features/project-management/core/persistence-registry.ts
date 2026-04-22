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

export interface PersistenceEntry<T = unknown> {
  key: string;
  serialize: () => T;
  deserialize: (data: T) => void;
  reset: () => void;
  priority: SavePriorityType;
}

const DEFAULT_DEBOUNCE_INTERVAL = 750;

class PersistenceRegistryImpl {
  private entries = new Map<string, PersistenceEntry>();

  private saveCallback: (() => Promise<void>) | null = null;

  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  private dirty = false;

  private flushInFlight: Promise<void> | null = null;

  private flushQueued = false;

  private savePolicy: PersistenceSavePolicy = {
    enabled: true,
    debounceInterval: DEFAULT_DEBOUNCE_INTERVAL
  };

  private statusCallback: ((status: PersistenceStatus) => void) | null = null;

  private lastSavedAt: Date | undefined;

  private suppressedNotificationsDepth = 0;

  get isDirty(): boolean {
    return this.dirty;
  }

  get lastSaved(): Date | undefined {
    return this.lastSavedAt;
  }

  get currentSavePolicy(): PersistenceSavePolicy {
    return { ...this.savePolicy };
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
    operation: () => Promise<T> | T
  ): Promise<T> {
    this.suppressedNotificationsDepth += 1;
    this.cancelDebounce();

    try {
      return await operation();
    } finally {
      this.suppressedNotificationsDepth = Math.max(
        0,
        this.suppressedNotificationsDepth - 1
      );
    }
  }

  register<T>(entry: PersistenceEntry<T>): void {
    if (this.entries.has(entry.key)) {
      logger.warn(
        `Persistence registry: duplicate key "${entry.key}", overwriting`,
        LogCategory.PERSISTENCE
      );
    }
    this.entries.set(entry.key, entry as PersistenceEntry);
  }

  unregister(key: string): void {
    this.entries.delete(key);
  }

  notifyChange(_key: string, priority?: SavePriorityType): void {
    if (this.suppressedNotificationsDepth > 0) {
      return;
    }

    const resolvedPriority =
      priority ?? this.entries.get(_key)?.priority ?? SavePriority.DEBOUNCED;

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
        logger.warn(
          `Failed to restore store "${key}", skipping`,
          LogCategory.PERSISTENCE,
          error
        );
      }
    }
  }

  resetAll(): void {
    for (const [, entry] of this.entries) {
      try {
        entry.reset();
      } catch (error) {
        logger.warn(
          `Failed to reset store "${entry.key}"`,
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

    if (this.suppressedNotificationsDepth > 0) {
      return Promise.resolve();
    }

    if (this.flushInFlight) {
      this.flushQueued = true;
      return this.flushInFlight;
    }

    if (!this.dirty) {
      return Promise.resolve();
    }

    if (!this.saveCallback) {
      return Promise.resolve();
    }

    this.dirty = false;
    this.emitStatus();

    let flushFailed = false;

    this.flushInFlight = this.saveCallback()
      .then(() => {
        this.lastSavedAt = new Date();
        this.emitStatus();
      })
      .catch((error) => {
        flushFailed = true;
        this.dirty = true;
        this.emitStatus();
        logger.error(
          'Persistence flush failed',
          LogCategory.PERSISTENCE,
          error
        );
      })
      .finally(() => {
        this.flushInFlight = null;

        if (!flushFailed && (this.flushQueued || this.dirty)) {
          this.flushQueued = false;
          void this.flush();
        }
      });

    return this.flushInFlight;
  }

  markClean(): void {
    this.cancelDebounce();
    this.dirty = false;
    this.flushQueued = false;
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
