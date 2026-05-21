import localforage from 'localforage';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { m } from '$lib/paraglide/messages.js';
import { PROJECT_CONST } from '../constants';
import { ProjectStorageKey } from '../types';

export function getProjectDatabase(): Promise<IDBDatabase> {
  return openDatabase();
}

let db: IDBDatabase | null = null;
let localforageMigrated = false;
let localforageMigrationPromise: Promise<void> | null = null;

export async function openDatabase(): Promise<IDBDatabase> {
  if (db) return db;

  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(
      PROJECT_CONST.DB.NAME,
      PROJECT_CONST.DB.VERSION
    );

    request.onerror = () => reject(new Error(m.error_failed_open_indexeddb()));

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      registerProjectStores(database);
    };
  });

  db = database;

  if (!localforageMigrated) {
    localforageMigrated = true;
    localforageMigrationPromise = migrateFromLocalforage(database)
      .catch((error) => {
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
      reject(request.error || new Error('Failed to read metadata'));
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
  let migrated = 0;
  let skipped = 0;

  for (const key of keys) {
    const value = await localforage.getItem<string>(key);
    if (value === null) continue;

    const existingValue = await loadMetadataStoreValue(database, key);
    if (existingValue === null) {
      await saveMetadataStoreValue(database, key, value);
      migrated++;
    } else {
      skipped++;
    }

    await localforage.removeItem(key);
  }

  if (migrated > 0 || skipped > 0) {
    logger.info(
      `Migrated ${migrated} keys from localforage to IDB metadata store${skipped > 0 ? ` (${skipped} already present in IDB)` : ''}`,
      LogCategory.PERSISTENCE
    );
  }
}
