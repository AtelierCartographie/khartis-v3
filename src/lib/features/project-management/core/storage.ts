import {
  safeJsonParse,
  safeJsonStringify
} from '$lib/features/commons/utils/clone.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import localforage from 'localforage';

export async function saveToStorage<T>(key: string, data: T): Promise<void> {
  try {
    await localforage.setItem(key, safeJsonStringify(data));
  } catch (error) {
    logger.error(
      'Failed to save project storage entry',
      LogCategory.PERSISTENCE,
      {
        key,
        error
      }
    );
    throw new Error('Storage quota exceeded or storage unavailable', {
      cause: error
    });
  }
}

export async function loadFromStorage<T>(key: string): Promise<T | null> {
  try {
    const value = await localforage.getItem<string>(key);
    if (!value) return null;
    return safeJsonParse<T>(value);
  } catch (error) {
    logger.warn(
      'Failed to load project storage entry',
      LogCategory.PERSISTENCE,
      {
        key,
        error
      }
    );
    return null;
  }
}

async function removeFromStorage(key: string): Promise<void> {
  await localforage.removeItem(key);
}

export const projectStorage = {
  save: saveToStorage,
  load: loadFromStorage,
  remove: removeFromStorage
};
