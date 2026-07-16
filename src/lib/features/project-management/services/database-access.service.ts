import localforage from 'localforage';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { m } from '$lib/paraglide/messages';
import { PROJECT_CONST } from '../constants';
import { ProjectStorageKey } from '../types';

const OPEN_DATABASE_TIMEOUT_MS = 10_000;
const LOCALFORAGE_MIGRATION_TIMEOUT_MS = 10_000;

export function getProjectDatabase(): Promise<IDBDatabase> {
  return openDatabase();
}

let db: IDBDatabase | null = null;
let localforageMigrated = false;
let localforageMigrationPromise: Promise<void> | null = null;

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  errorFactory: () => Error
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(errorFactory()), timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export async function openDatabase(): Promise<IDBDatabase> {
  if (db) return db;

  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(
      PROJECT_CONST.DB.NAME,
      PROJECT_CONST.DB.VERSION
    );
    let settled = false;

    const clearOpenTimeout = (timeoutId: ReturnType<typeof setTimeout>) => {
      clearTimeout(timeoutId);
    };

    const rejectOpen = (
      error: Error,
      timeoutId: ReturnType<typeof setTimeout>
    ) => {
      if (settled) return;
      settled = true;
      clearOpenTimeout(timeoutId);
      reject(error);
    };

    const timeoutId = setTimeout(() => {
      rejectOpen(new Error(m.error_failed_open_indexeddb()), timeoutId);
    }, OPEN_DATABASE_TIMEOUT_MS);

    request.onerror = () =>
      rejectOpen(new Error(m.error_failed_open_indexeddb()), timeoutId);

    request.onblocked = () =>
      rejectOpen(new Error(m.error_failed_open_indexeddb()), timeoutId);

    request.onsuccess = () => {
      const openedDatabase = request.result;
      if (settled) {
        openedDatabase.close();
        return;
      }

      settled = true;
      clearOpenTimeout(timeoutId);
      resolve(openedDatabase);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      registerProjectStores(database);
    };
  });

  database.onversionchange = () => {
    database.close();
    if (db === database) {
      db = null;
    }
  };
  db = database;

  if (!localforageMigrated) {
    localforageMigrated = true;
    localforageMigrationPromise = withTimeout(
      migrateFromLocalforage(database),
      LOCALFORAGE_MIGRATION_TIMEOUT_MS,
      () => new Error('Legacy project metadata migration timed out')
    )
      .catch((error) => {
        localforageMigrated = false;
        logger.error(
          'Failed to migrate localforage project metadata',
          LogCategory.PERSISTENCE,
          error
        );
      })
      .finally(() => {
        localforageMigrationPromise = null;
      });
  }

  if (localforageMigrationPromise) {
    await localforageMigrationPromise;
  }

  return database;
}

function registerProjectStores(database: IDBDatabase): void {
  const {
    STORE_NAME,
    METADATA_STORE_NAME,
    ASSET_STORE_NAME,
    ASSET_CHUNK_STORE_NAME,
    ASSET_REF_STORE_NAME
  } = PROJECT_CONST.DB;

  if (!database.objectStoreNames.contains(STORE_NAME)) {
    const store = database.createObjectStore(STORE_NAME, {
      keyPath: 'id'
    });
    store.createIndex('updatedAt', 'manifest.updatedAt', { unique: false });
    store.createIndex('name', 'manifest.name', { unique: false });
  }

  if (!database.objectStoreNames.contains(METADATA_STORE_NAME)) {
    database.createObjectStore(METADATA_STORE_NAME, {
      keyPath: 'key'
    });
  }

  if (!database.objectStoreNames.contains(ASSET_STORE_NAME)) {
    database.createObjectStore(ASSET_STORE_NAME, { keyPath: 'assetId' });
  }

  if (!database.objectStoreNames.contains(ASSET_CHUNK_STORE_NAME)) {
    const chunkStore = database.createObjectStore(ASSET_CHUNK_STORE_NAME, {
      keyPath: ['assetId', 'chunkIndex']
    });
    chunkStore.createIndex('assetId', 'assetId', { unique: false });
  }

  if (!database.objectStoreNames.contains(ASSET_REF_STORE_NAME)) {
    const refStore = database.createObjectStore(ASSET_REF_STORE_NAME, {
      keyPath: 'id'
    });
    refStore.createIndex('projectId', 'projectId', { unique: false });
    refStore.createIndex('assetId', 'assetId', { unique: false });
  }
}

export async function loadMetadataStoreValue(
  database: IDBDatabase,
  key: string
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(
      [PROJECT_CONST.DB.METADATA_STORE_NAME],
      'readonly'
    );
    const request = tx
      .objectStore(PROJECT_CONST.DB.METADATA_STORE_NAME)
      .get(key);

    request.onsuccess = () => {
      resolve(
        typeof request.result?.value === 'string' ? request.result.value : null
      );
    };
    request.onerror = () =>
      reject(request.error || new Error(m.error_storage_load_failed()));
  });
}

export async function saveMetadataStoreValue(
  database: IDBDatabase,
  key: string,
  value: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(
      [PROJECT_CONST.DB.METADATA_STORE_NAME],
      'readwrite'
    );
    tx.objectStore(PROJECT_CONST.DB.METADATA_STORE_NAME).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function migrateFromLocalforage(database: IDBDatabase): Promise<void> {
  const keys = [ProjectStorageKey.CURRENT, ProjectStorageKey.METADATA];

  for (const key of keys) {
    const value = await localforage.getItem<string>(key);
    if (value === null) continue;

    const existingValue = await loadMetadataStoreValue(database, key);
    if (existingValue === null) {
      await saveMetadataStoreValue(database, key, value);
    }

    await localforage.removeItem(key);
  }
}
