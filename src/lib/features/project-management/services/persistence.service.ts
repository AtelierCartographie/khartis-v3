import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { m } from '$lib/paraglide/messages.js';
import type { SerializedProject } from '$lib/types/serialization.types';
import { PROJECT_CONST } from '../constants';
import type { KhartisProject, SavedProjectMetadata } from '../types';
import { ProjectStorageKey } from '../types';
import {
  ensureUploadedFileAssets,
  removeProjectAssetRefs,
  syncProjectAssetRefs
} from './asset-store.service';
import { deserialize, prepareForIndexedDB } from './serializer.service';
import {
  loadMetadataStoreValue,
  openDatabase as openProjectDatabase,
  saveMetadataStoreValue
} from './database-access.service';
import { migrateIfNeeded } from '../core/schema-migration';
import { estimateProjectStorageSize } from '$lib/features/commons/utils/size-estimation.utils';
import {
  safeJsonParse,
  safeJsonStringify
} from '$lib/features/commons/utils/clone.utils';

export { openProjectDatabase as openDatabase };

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

async function loadProjectMetadata(): Promise<SavedProjectMetadata[]> {
  const database = await ensureDb();
  const value = await loadMetadataStoreValue(
    database,
    ProjectStorageKey.METADATA
  );

  return value ? (safeJsonParse<SavedProjectMetadata[]>(value) ?? []) : [];
}

async function saveProjectMetadata(
  metadata: SavedProjectMetadata[]
): Promise<void> {
  const database = await ensureDb();
  await saveMetadataStoreValue(
    database,
    ProjectStorageKey.METADATA,
    safeJsonStringify(metadata)
  );
}

async function ensureDb(): Promise<IDBDatabase> {
  return openProjectDatabase();
}

export async function saveProject(
  project: KhartisProject,
  thumbnail?: string,
  exampleId?: string
): Promise<void> {
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
  await updateMetadata(project, thumbnail, exampleId);
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
    logger.error(
      'Failed to deserialize project',
      LogCategory.PERSISTENCE,
      { id, error },
      { feature: 'project', flow: 'deserialize_project' }
    );
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
  initialize: openProjectDatabase,
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
  const metadata = await loadProjectMetadata();

  const normalized = metadata.map((entry) => ({
    ...entry,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt)
  }));

  return normalized.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

async function updateMetadata(
  project: KhartisProject,
  thumbnail?: string,
  exampleId?: string
): Promise<void> {
  const metadata = await loadProjectMetadata();
  const index = metadata.findIndex((entry) => entry.id === project.id);
  const previous = index >= 0 ? metadata[index] : undefined;

  const entry: SavedProjectMetadata = {
    id: project.id,
    name: project.manifest.name,
    description: project.manifest.description,
    createdAt: project.manifest.createdAt,
    updatedAt: project.manifest.updatedAt,
    size: calculateProjectSize(project),
    // Preserve the previous thumbnail when this save could not capture one.
    thumbnail: thumbnail ?? previous?.thumbnail,
    // Preserve exampleId once set; never overwrite with undefined.
    exampleId: exampleId ?? previous?.exampleId
  };

  if (index >= 0) {
    metadata[index] = entry;
  } else {
    metadata.push(entry);
  }

  await saveProjectMetadata(metadata);
}

async function removeFromMetadata(id: string): Promise<void> {
  const metadata = await loadProjectMetadata();
  const filtered = metadata.filter((entry) => entry.id !== id);
  await saveProjectMetadata(filtered);
}

function calculateProjectSize(project: KhartisProject): number {
  return estimateProjectStorageSize(project);
}
