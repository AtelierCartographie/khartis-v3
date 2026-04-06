import { estimateProjectStorageSize } from '$lib/features/commons/utils/size-estimation.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { SerializedProject } from '$lib/types/serialization.types';
import { PROJECT_CONST } from '../constants';
import type { KhartisProject, SavedProjectMetadata } from '../types';
import { ProjectStorageKey } from '../types';
import { deserialize, prepareForIndexedDB } from './serializer';
import { loadFromStorage, saveToStorage } from './storage';
import { migrateIfNeeded } from './schema-migration';

let db: IDBDatabase | null = null;
let localforageMigrated = false;

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

    request.onerror = () => reject(new Error('Failed to open IndexedDB'));

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

      // v2: add metadata object store (replaces localforage)
      if (!db.objectStoreNames.contains(PROJECT_CONST.DB.METADATA_STORE_NAME)) {
        db.createObjectStore(PROJECT_CONST.DB.METADATA_STORE_NAME, {
          keyPath: 'key'
        });
      }
    };
  });

  db = database;

  // One-shot migration: copy localforage keys to the new IDB metadata store
  if (!localforageMigrated) {
    localforageMigrated = true;
    migrateFromLocalforage(database).catch((error) => {
      logger.debug(
        'Localforage migration skipped or failed (may already be migrated)',
        LogCategory.PERSISTENCE,
        error
      );
    });
  }

  return database;
}

async function migrateFromLocalforage(database: IDBDatabase): Promise<void> {
  // Dynamic import to avoid bundling localforage if it's already been removed
  let lf: {
    getItem: (k: string) => Promise<string | null>;
    removeItem: (k: string) => Promise<void>;
  };
  try {
    const mod = await import('localforage');
    lf = mod.default;
  } catch {
    return; // localforage already removed from deps — nothing to migrate
  }

  const keys = [ProjectStorageKey.CURRENT, ProjectStorageKey.METADATA];
  let migrated = 0;

  for (const key of keys) {
    const value = await lf.getItem(key);
    if (value === null) continue;

    // Write to new IDB metadata store
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(
        [PROJECT_CONST.DB.METADATA_STORE_NAME],
        'readwrite'
      );
      tx.objectStore(PROJECT_CONST.DB.METADATA_STORE_NAME).put({
        key,
        value
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Remove from localforage
    await lf.removeItem(key);
    migrated++;
  }

  if (migrated > 0) {
    logger.info(
      `Migrated ${migrated} keys from localforage to IDB metadata store`,
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

  const serialized = await prepareForIndexedDB(project);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [PROJECT_CONST.DB.STORE_NAME],
      'readwrite'
    );
    const store = transaction.objectStore(PROJECT_CONST.DB.STORE_NAME);
    const request = store.put(serialized);

    request.onsuccess = async () => {
      await updateMetadata(project);
      resolve();
    };
    request.onerror = () =>
      reject(request.error || new Error('Failed to save project'));
  });
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

    request.onerror = () => reject(new Error('Failed to load project'));
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
    const request = store.delete(id);

    request.onsuccess = async () => {
      await removeFromMetadata(id);
      resolve();
    };
    request.onerror = () =>
      reject(request.error || new Error('Failed to delete project'));
  });
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

async function getMetadataList(): Promise<SavedProjectMetadata[]> {
  return (
    (await loadFromStorage<SavedProjectMetadata[]>(
      ProjectStorageKey.METADATA
    )) ?? []
  );
}

async function updateMetadata(project: KhartisProject): Promise<void> {
  const metadata = await getMetadataList();
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
  const metadata = await getMetadataList();
  const filtered = metadata.filter((entry) => entry.id !== id);
  await saveToStorage(ProjectStorageKey.METADATA, filtered);
}

function calculateProjectSize(project: KhartisProject): number {
  return estimateProjectStorageSize(project);
}
