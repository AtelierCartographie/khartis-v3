import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export const SavePriority = {
  IMMEDIATE: 'immediate',
  DEBOUNCED: 'debounced'
} as const;

export type SavePriorityType = (typeof SavePriority)[keyof typeof SavePriority];

export interface PersistenceEntry<T = unknown> {
  key: string;
  serialize: () => T;
  deserialize: (data: T) => void;
  reset: () => void;
  priority: SavePriorityType;
}

const DEBOUNCE_INTERVAL = 5000;

class PersistenceRegistryImpl {
  private entries = new Map<string, PersistenceEntry>();

  private saveCallback: (() => Promise<void>) | null = null;

  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  private dirty = false;

  private flushInFlight: Promise<void> | null = null;

  private flushQueued = false;

  get isDirty(): boolean {
    return this.dirty;
  }

  setSaveCallback(cb: () => Promise<void>): void {
    this.saveCallback = cb;
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

  notifyChange(
    _key: string,
    priority: SavePriorityType = SavePriority.DEBOUNCED
  ): void {
    this.dirty = true;

    if (priority === SavePriority.IMMEDIATE) {
      this.cancelDebounce();
      this.flush();
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

  flush(): void {
    if (!this.dirty) return;
    if (this.flushInFlight) {
      this.flushQueued = true;
      return;
    }

    this.dirty = false;

    if (!this.saveCallback) {
      return;
    }

    this.flushInFlight = this.saveCallback()
      .catch((error) => {
        logger.error(
          'Persistence flush failed',
          LogCategory.PERSISTENCE,
          error
        );
      })
      .finally(() => {
        this.flushInFlight = null;

        if (this.flushQueued || this.dirty) {
          this.flushQueued = false;
          this.flush();
        }
      });
  }

  markClean(): void {
    this.cancelDebounce();
    this.dirty = false;
    this.flushQueued = false;
  }

  private scheduleDebounce(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.flush();
    }, DEBOUNCE_INTERVAL);
  }

  private cancelDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }
}

export const persistenceRegistry = new PersistenceRegistryImpl();
