import localforage from 'localforage';
import { estimateProjectStorageSize } from '$lib/features/commons/utils/size-estimation.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { m } from '$lib/paraglide/messages.js';
import type { SerializedProject } from '$lib/types/serialization.types';
import { PROJECT_CONST } from '../constants';
import type { KhartisProject, SavedProjectMetadata } from '../types';
import { ProjectStorageKey } from '../types';
import {
  ensureUploadedFileAssets,
  registerAssetStores,
  removeProjectAssetRefs,
  syncProjectAssetRefs
} from './asset-store.service';
import { deserialize, prepareForIndexedDB } from './serializer.service';
import { loadFromStorage, saveToStorage } from './storage.service';
import { migrateIfNeeded } from '../core/schema-migration';

let db: IDBDatabase | null = null;
let localforageMigrated = false;
let localforageMigrationPromise: Promise<void> | null = null;

function isSerializedProject(value: unknown): value is SerializedProject {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const manifest = candidate.manifest;

  return (
    typeof candidate.id === 'string' &&
    Boolean(manifest) &&
    typeof manifest === 'object'
  );
}

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
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(PROJECT_CONST.DB.STORE_NAME)) {
        const store = db.createObjectStore(PROJECT_CONST.DB.STORE_NAME, {
          keyPath: 'id'
        });
        store.createIndex('updatedAt', 'manifest.updatedAt', { unique: false });
        store.createIndex('name', 'manifest.name', { unique: false });
      }

      if (!db.objectStoreNames.contains(PROJECT_CONST.DB.METADATA_STORE_NAME)) {
        db.createObjectStore(PROJECT_CONST.DB.METADATA_STORE_NAME, {
          keyPath: 'key'
        });
      }

      registerAssetStores(db);
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

async function loadMetadataStoreValue(
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

async function saveMetadataStoreValue(
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

async function ensureDb(): Promise<IDBDatabase> {
  if (!db) {
    return openDatabase();
  }
  return db;
}

export async function saveProject(project: KhartisProject): Promise<void> {
  const database = await ensureDb();
  project.manifest.version = PROJECT_CONST.APP_VERSION;

  if (project.data?.sourceFiles?.length) {
    project.data.sourceFiles = await Promise.all(
      project.data.sourceFiles.map((file) => ensureUploadedFileAssets(file))
    );
  }

  const serialized = await prepareForIndexedDB(project);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [PROJECT_CONST.DB.STORE_NAME],
      'readwrite'
    );
    const store = transaction.objectStore(PROJECT_CONST.DB.STORE_NAME);
    store.put(serialized);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error(m.error_failed_save_project()));
  });

  await syncProjectAssetRefs(project.id, project.data?.sourceFiles ?? []);
  await updateMetadata(project);
}

export async function loadProject(id: string): Promise<KhartisProject | null> {
  const serializedProject = await loadSerializedProject(id);
  if (!serializedProject) {
    return null;
  }

  try {
    const project = await deserialize(serializedProject);
    return project;
  } catch (error) {
    logger.error('Failed to deserialize project', LogCategory.PERSISTENCE, {
      id,
      error
    });
    return null;
  }
}

export async function loadSerializedProject(
  id: string
): Promise<SerializedProject | null> {
  const database = await ensureDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [PROJECT_CONST.DB.STORE_NAME],
      'readonly'
    );
    const store = transaction.objectStore(PROJECT_CONST.DB.STORE_NAME);
    const request = store.get(id);

    request.onsuccess = async () => {
      if (!request.result) {
        resolve(null);
        return;
      }

      try {
        const migrated = migrateIfNeeded(
          request.result as Record<string, unknown>
        );
        resolve(isSerializedProject(migrated) ? migrated : null);
      } catch (error) {
        logger.error(
          'Failed to prepare serialized project from persistence',
          LogCategory.PERSISTENCE,
          {
            id,
            error
          }
        );
        resolve(null);
      }
    };

    request.onerror = () =>
      reject(new Error(m.error_failed_load_project_persistence()));
  });
}

export const projectRepository = {
  initialize: openDatabase,
  save: saveProject,
  load: loadProject,
  loadSerialized: loadSerializedProject,
  remove: removeProject,
  listMetadata
};
export async function removeProject(id: string): Promise<void> {
  const database = await ensureDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [PROJECT_CONST.DB.STORE_NAME],
      'readwrite'
    );
    const store = transaction.objectStore(PROJECT_CONST.DB.STORE_NAME);
    store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ||
          new Error(m.error_failed_delete_project_persistence())
      );
  });

  await removeProjectAssetRefs(id);
  await removeFromMetadata(id);
}

export async function listMetadata(): Promise<SavedProjectMetadata[]> {
  const metadata =
    (await loadFromStorage<SavedProjectMetadata[]>(
      ProjectStorageKey.METADATA
    )) ?? [];

  const normalized = metadata.map((entry) => ({
    ...entry,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt)
  }));

  return normalized.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

async function updateMetadata(project: KhartisProject): Promise<void> {
  const metadata = await listMetadata();
  const index = metadata.findIndex((entry) => entry.id === project.id);

  const entry: SavedProjectMetadata = {
    id: project.id,
    name: project.manifest.name,
    description: project.manifest.description,
    createdAt: project.manifest.createdAt,
    updatedAt: project.manifest.updatedAt,
    size: calculateProjectSize(project)
  };

  if (index >= 0) {
    metadata[index] = entry;
  } else {
    metadata.push(entry);
  }

  await saveToStorage(ProjectStorageKey.METADATA, metadata);
}

async function removeFromMetadata(id: string): Promise<void> {
  const metadata = await listMetadata();
  const filtered = metadata.filter((entry) => entry.id !== id);
  await saveToStorage(ProjectStorageKey.METADATA, filtered);
}

function calculateProjectSize(project: KhartisProject): number {
  return estimateProjectStorageSize(project);
}
