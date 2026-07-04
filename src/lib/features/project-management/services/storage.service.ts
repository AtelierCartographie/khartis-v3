import {
  safeJsonParse,
  safeJsonStringify
} from '$lib/features/commons/utils/clone.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { PipelineError } from '$lib/features/commons/pipeline.errors';
import { m } from '$lib/paraglide/messages';
import { PROJECT_CONST } from '../constants';
import { getProjectDatabase } from './database-access.service';

const PROJECT_STORAGE_ERROR_CODE = 'PROJECT_STORAGE_ERROR';
const PROJECT_STORAGE_QUOTA_ERROR_CODE = 'PROJECT_STORAGE_QUOTA_EXCEEDED';

async function getDb(): Promise<IDBDatabase> {
  return getProjectDatabase();
}

function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    cause?: unknown;
    code?: unknown;
    name?: unknown;
  };

  return (
    candidate.name === 'QuotaExceededError' ||
    candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    candidate.code === 22 ||
    candidate.code === 1014 ||
    isQuotaExceededError(candidate.cause)
  );
}

function createProjectStorageError(
  message: string,
  operation: string,
  details?: Record<string, unknown>
): PipelineError {
  return new PipelineError(message, PROJECT_STORAGE_ERROR_CODE, {
    operation,
    ...details
  });
}

export async function saveToStorage<T>(key: string, data: T): Promise<void> {
  try {
    const db = await getDb();
    const storeName = PROJECT_CONST.DB.METADATA_STORE_NAME;

    if (!db.objectStoreNames.contains(storeName)) {
      throw createProjectStorageError(
        m.error_storage_save_failed(),
        'save_metadata',
        { key, storeName }
      );
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      store.put({ key, value: safeJsonStringify(data) });
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          tx.error ||
            createProjectStorageError(m.error_storage_save_failed(), 'save', {
              key,
              storeName
            })
        );
    });
  } catch (error) {
    logger.error(
      'Failed to save project storage entry',
      LogCategory.PERSISTENCE,
      { key, error }
    );
    const isQuotaExceeded = isQuotaExceededError(error);
    const message = isQuotaExceeded
      ? m.error_storage_quota_exceeded()
      : m.error_storage_save_failed();
    throw new PipelineError(
      message,
      isQuotaExceeded
        ? PROJECT_STORAGE_QUOTA_ERROR_CODE
        : PROJECT_STORAGE_ERROR_CODE,
      {
        key,
        cause: error
      }
    );
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
        reject(
          request.error ||
            createProjectStorageError(m.error_storage_load_failed(), 'load', {
              key,
              storeName
            })
        );
    });
  } catch (error) {
    logger.error(
      'Failed to load project metadata from storage',
      LogCategory.PERSISTENCE,
      error
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
        reject(
          tx.error ||
            createProjectStorageError(
              m.error_storage_remove_failed(),
              'remove',
              {
                key,
                storeName
              }
            )
        );
    });
  } catch (error) {
    logger.error(
      'Failed to remove project metadata from storage',
      LogCategory.PERSISTENCE,
      error
    );
  }
}

export const projectStorage = {
  save: saveToStorage,
  load: loadFromStorage,
  remove: removeFromStorage
};
