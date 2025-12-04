import localforage from 'localforage';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { safeJsonStringify, safeJsonParse } from '../utils/json-helpers';

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
    throw new Error('Storage quota exceeded or storage unavailable');
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

export async function removeFromStorage(key: string): Promise<void> {
  await localforage.removeItem(key);
}

export const projectStorage = {
  save: saveToStorage,
  load: loadFromStorage,
  remove: removeFromStorage
};
