import {
  safeJsonParse,
  safeJsonStringify
} from '$lib/features/commons/utils/clone.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { PROJECT_CONST } from '../constants';

async function getDb(): Promise<IDBDatabase> {
  const { getProjectDatabase } = await import('./database-access');
  return getProjectDatabase();
}

export async function saveToStorage<T>(key: string, data: T): Promise<void> {
  try {
    const db = await getDb();
    const storeName = PROJECT_CONST.DB.METADATA_STORE_NAME;

    if (!db.objectStoreNames.contains(storeName)) {
      // DB hasn't been upgraded yet — this shouldn't happen, but guard anyway
      logger.warn(
        'Metadata store not found, skipping save',
        LogCategory.PERSISTENCE,
        { key }
      );
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      store.put({ key, value: safeJsonStringify(data) });
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error('Failed to save metadata'));
    });
  } catch (error) {
    logger.error(
      'Failed to save project storage entry',
      LogCategory.PERSISTENCE,
      { key, error }
    );
    throw new Error('Storage quota exceeded or storage unavailable', {
      cause: error
    });
  }
}

export async function loadFromStorage<T>(key: string): Promise<T | null> {
  try {
    const db = await getDb();
    const storeName = PROJECT_CONST.DB.METADATA_STORE_NAME;

    if (!db.objectStoreNames.contains(storeName)) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        if (!request.result?.value) {
          resolve(null);
          return;
        }
        resolve(safeJsonParse<T>(request.result.value));
      };
      request.onerror = () =>
        reject(request.error || new Error('Failed to load metadata'));
    });
  } catch (error) {
    logger.warn(
      'Failed to load project storage entry',
      LogCategory.PERSISTENCE,
      { key, error }
    );
    return null;
  }
}

async function removeFromStorage(key: string): Promise<void> {
  try {
    const db = await getDb();
    const storeName = PROJECT_CONST.DB.METADATA_STORE_NAME;

    if (!db.objectStoreNames.contains(storeName)) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error('Failed to remove metadata'));
    });
  } catch (error) {
    logger.warn(
      'Failed to remove project storage entry',
      LogCategory.PERSISTENCE,
      { key, error }
    );
  }
}

export const projectStorage = {
  save: saveToStorage,
  load: loadFromStorage,
  remove: removeFromStorage
};
