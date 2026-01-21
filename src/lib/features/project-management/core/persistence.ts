import { bigIntReplacer } from '$lib/features/commons/utils/clone.utils';
import { PROJECT_CONST } from '../constants';
import type { KhartisProject, SavedProjectMetadata } from '../types';
import { ProjectStorageKey } from '../types';
import { deserialize, prepareForIndexedDB } from './serializer';
import { loadFromStorage, saveToStorage } from './storage';

let db: IDBDatabase | null = null;

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
    };
  });

  db = database;
  return database;
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
        const project = await deserialize(request.result);
        resolve(project);
      } catch (error) {
        reject(new Error(`Failed to deserialize project: ${error}`));
      }
    };

    request.onerror = () => reject(new Error('Failed to load project'));
  });
}

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
  const json = JSON.stringify(project, bigIntReplacer);
  return new Blob([json]).size;
}

export const projectRepository = {
  initialize: openDatabase,
  save: saveProject,
  load: loadProject,
  remove: removeProject,
  listMetadata
};
