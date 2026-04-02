/**
 * Persistence Registry — self-registration pattern for store persistence.
 *
 * Each store registers its own serialize/deserialize/reset callbacks.
 * The serializer calls the registry generically instead of importing every store.
 *
 * Change notifications support two priorities:
 * - IMMEDIATE: saves right away (file add/remove, project rename)
 * - DEBOUNCED: resets a 5s timer (palette, slider, styling changes)
 */

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

  /** Whether changes exist that haven't been persisted yet */
  get isDirty(): boolean {
    return this.dirty;
  }

  /** Wire the registry to the project store's save function */
  setSaveCallback(cb: () => Promise<void>): void {
    this.saveCallback = cb;
  }

  /** Register a store for persistence. Called at module load time (singletons). */
  register<T>(entry: PersistenceEntry<T>): void {
    if (this.entries.has(entry.key)) {
      logger.warn(
        `Persistence registry: duplicate key "${entry.key}", overwriting`,
        LogCategory.PERSISTENCE
      );
    }
    this.entries.set(entry.key, entry as PersistenceEntry);
  }

  /** Unregister a store (rarely needed — for testing). */
  unregister(key: string): void {
    this.entries.delete(key);
  }

  /** Notify that a store changed. Triggers save based on priority. */
  notifyChange(
    key: string,
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

  /** Serialize all registered stores into a plain object. */
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

  /** Deserialize all registered stores from a plain object. */
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

  /** Reset all registered stores to their defaults. */
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

  /** List of registered store keys (for debugging). */
  get registeredKeys(): string[] {
    return [...this.entries.keys()];
  }

  /** Force immediate save (bypasses debounce). */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.saveCallback?.().catch((error) => {
      logger.error('Persistence flush failed', LogCategory.PERSISTENCE, error);
    });
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
