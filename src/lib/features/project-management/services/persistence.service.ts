import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { PipelineError } from '$lib/features/commons/pipeline.errors';
import { m } from '$lib/paraglide/messages';
import type { SerializedProject } from '$lib/types/serialization.types';
import { PROJECT_CONST } from '../constants';
import type { KhartisProject, SavedProjectMetadata } from '../types';
import { ProjectStorageKey } from '../types';
import {
  ensureUploadedFileAssets,
  removeProjectAssetRefs,
  syncProjectAssetRefs
} from './asset-store.service';
import { collectCustomBasemapAssetRefs } from './custom-basemap-source.service';
import { deserialize, prepareForIndexedDB } from './serializer.service';
import { deserializeUploadedFile } from '../core/file-serializer';
import {
  loadMetadataStoreValue,
  openDatabase as openProjectDatabase
} from './database-access.service';
import {
  assertCurrentProjectSchema,
  migrateIfNeeded
} from '../core/schema-migration';
import { estimateProjectStorageSize } from '$lib/features/commons/utils/size-estimation.utils';
import {
  safeJsonParse,
  safeJsonStringify
} from '$lib/features/commons/utils/clone.utils';

export { openProjectDatabase as openDatabase };

const PROJECT_SAVE_CONFLICT_ERROR_CODE = 'PROJECT_SAVE_CONFLICT';
const STORAGE_REVISION_PROPERTY = '__khartisStorageRevision';

interface RevisionedSerializedProject extends SerializedProject {
  [STORAGE_REVISION_PROPERTY]?: number;
}

const loadedProjectRevisions = new Map<string, number>();
const projectSaveQueues = new Map<string, Promise<void>>();

class ProjectSaveConflictError extends PipelineError {
  constructor(
    projectId: string,
    expectedRevision: number | undefined,
    actualRevision: number | null
  ) {
    super(
      m.error_project_save_conflict_message(),
      PROJECT_SAVE_CONFLICT_ERROR_CODE,
      {
        projectId,
        expectedRevision,
        actualRevision
      }
    );
    this.name = 'ProjectSaveConflictError';
  }
}

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

function readStorageRevision(
  project: RevisionedSerializedProject
): number | null {
  const revision = project[STORAGE_REVISION_PROPERTY];
  if (revision === undefined) {
    return 0;
  }

  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function stripStorageRevision(
  project: RevisionedSerializedProject
): SerializedProject {
  const {
    [STORAGE_REVISION_PROPERTY]: _storageRevision,
    ...serializedProject
  } = project;
  return serializedProject;
}

async function loadRevisionedSerializedProject(
  id: string
): Promise<RevisionedSerializedProject | null> {
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
        resolve(
          isSerializedProject(migrated)
            ? (migrated as RevisionedSerializedProject)
            : null
        );
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

async function loadProjectMetadata(): Promise<SavedProjectMetadata[]> {
  const database = await ensureDb();
  const value = await loadMetadataStoreValue(
    database,
    ProjectStorageKey.METADATA
  );

  return value ? (safeJsonParse<SavedProjectMetadata[]>(value) ?? []) : [];
}

async function mutateProjectMetadata(
  mutate: (metadata: SavedProjectMetadata[]) => SavedProjectMetadata[]
): Promise<void> {
  const database = await ensureDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [PROJECT_CONST.DB.METADATA_STORE_NAME],
      'readwrite'
    );
    const store = transaction.objectStore(PROJECT_CONST.DB.METADATA_STORE_NAME);
    const request = store.get(ProjectStorageKey.METADATA);

    request.onsuccess = () => {
      try {
        const storedValue =
          typeof request.result?.value === 'string'
            ? request.result.value
            : null;
        const metadata = storedValue
          ? (safeJsonParse<SavedProjectMetadata[]>(storedValue) ?? [])
          : [];

        store.put({
          key: ProjectStorageKey.METADATA,
          value: safeJsonStringify(mutate(metadata))
        });
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error(m.error_failed_save_project())
        );
      }
    };
    request.onerror = () =>
      reject(request.error || new Error(m.error_failed_save_project()));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error(m.error_failed_save_project()));
  });
}

async function ensureDb(): Promise<IDBDatabase> {
  return openProjectDatabase();
}

async function prepareProjectForStorage(
  project: KhartisProject
): Promise<KhartisProject> {
  assertCurrentProjectSchema(project);

  const sourceFiles = project.data.sourceFiles.length
    ? await Promise.all(
        project.data.sourceFiles.map((file) => ensureUploadedFileAssets(file))
      )
    : project.data.sourceFiles;

  return {
    ...project,
    manifest: {
      ...project.manifest,
      version: PROJECT_CONST.SCHEMA_VERSION
    },
    data: {
      ...project.data,
      sourceFiles
    }
  };
}

async function enqueueProjectSave(
  projectId: string,
  save: () => Promise<void>
): Promise<void> {
  const previousSave = projectSaveQueues.get(projectId);
  let releaseCurrentSave = () => {};
  const currentSave = new Promise<void>((resolve) => {
    releaseCurrentSave = resolve;
  });
  const queuedSave = previousSave
    ? previousSave.then(() => currentSave)
    : currentSave;
  projectSaveQueues.set(projectId, queuedSave);

  if (previousSave) {
    await previousSave;
  }

  try {
    await save();
  } finally {
    releaseCurrentSave();
    if (projectSaveQueues.get(projectId) === queuedSave) {
      projectSaveQueues.delete(projectId);
    }
  }
}

async function writeRevisionedProject(
  serialized: SerializedProject
): Promise<void> {
  const database = await ensureDb();
  const projectId = serialized.id;
  const hasExpectedRevision = loadedProjectRevisions.has(projectId);
  const expectedRevision = loadedProjectRevisions.get(projectId);

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [PROJECT_CONST.DB.STORE_NAME],
      'readwrite'
    );
    const store = transaction.objectStore(PROJECT_CONST.DB.STORE_NAME);
    const request = store.get(projectId);
    let nextRevision: number | null = null;
    let rejected = false;

    const rejectOnce = (error: Error) => {
      if (rejected) {
        return;
      }

      rejected = true;
      reject(error);
    };

    request.onsuccess = () => {
      try {
        const persistedProject = request.result as
          RevisionedSerializedProject | undefined;
        const actualRevision = persistedProject
          ? readStorageRevision(persistedProject)
          : 0;
        const canCreate = !persistedProject && !hasExpectedRevision;
        const canUpdate =
          Boolean(persistedProject) &&
          hasExpectedRevision &&
          actualRevision !== null &&
          actualRevision === expectedRevision;

        if (!canCreate && !canUpdate) {
          rejectOnce(
            new ProjectSaveConflictError(
              projectId,
              expectedRevision,
              actualRevision
            )
          );
          return;
        }

        if (actualRevision === null) {
          return;
        }

        nextRevision = actualRevision + 1;
        store.put({
          ...serialized,
          [STORAGE_REVISION_PROPERTY]: nextRevision
        });
      } catch (error) {
        nextRevision = null;
        rejectOnce(
          error instanceof Error
            ? error
            : new Error(m.error_failed_save_project())
        );
      }
    };
    request.onerror = () =>
      rejectOnce(request.error || new Error(m.error_failed_save_project()));
    transaction.oncomplete = () => {
      if (rejected || nextRevision === null) {
        return;
      }

      loadedProjectRevisions.set(projectId, nextRevision);
      resolve();
    };
    transaction.onerror = () =>
      rejectOnce(transaction.error || new Error(m.error_failed_save_project()));
  });
}

export async function saveProject(
  project: KhartisProject,
  thumbnail?: string,
  exampleId?: string,
  sizeBytes?: number
): Promise<void> {
  await enqueueProjectSave(project.id, async () => {
    const projectForStorage = await prepareProjectForStorage(project);
    const serialized = await prepareForIndexedDB(projectForStorage);
    await writeRevisionedProject(serialized);
    await syncProjectAssetRefs(
      projectForStorage.id,
      projectForStorage.data.sourceFiles,
      collectCustomBasemapAssetRefs(serialized.data)
    );
    await updateMetadata(projectForStorage, thumbnail, exampleId, sizeBytes);
  });
}

export async function saveSerializedProject(
  project: SerializedProject
): Promise<void> {
  assertCurrentProjectSchema(project);

  await enqueueProjectSave(project.id, async () => {
    await writeRevisionedProject(project);
    await syncProjectAssetRefs(
      project.id,
      (project.data?.sourceFiles ?? []).map(deserializeUploadedFile),
      collectCustomBasemapAssetRefs(project.data)
    );
    await updateMetadata(project);
  });
}

export async function loadProject(id: string): Promise<KhartisProject | null> {
  const revisionedProject = await loadRevisionedSerializedProject(id);
  if (!revisionedProject) {
    return null;
  }

  const storageRevision = readStorageRevision(revisionedProject);
  if (storageRevision === null) {
    logger.error(
      'Failed to load project with an invalid storage revision',
      LogCategory.PERSISTENCE,
      { id }
    );
    return null;
  }

  const serializedProject = stripStorageRevision(revisionedProject);
  if (!serializedProject) {
    return null;
  }

  try {
    const project = await deserialize(serializedProject);
    loadedProjectRevisions.set(project.id, storageRevision);
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
  const project = await loadRevisionedSerializedProject(id);
  return project ? stripStorageRevision(project) : null;
}

export const projectRepository = {
  initialize: openProjectDatabase,
  save: saveProject,
  load: loadProject,
  loadSerialized: loadSerializedProject,
  saveSerialized: saveSerializedProject,
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

  loadedProjectRevisions.delete(id);
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
  project: KhartisProject | SerializedProject,
  thumbnail?: string,
  exampleId?: string,
  sizeBytes?: number
): Promise<void> {
  await mutateProjectMetadata((metadata) => {
    const index = metadata.findIndex((entry) => entry.id === project.id);
    const previous = index >= 0 ? metadata[index] : undefined;

    const entry: SavedProjectMetadata = {
      id: project.id,
      name: project.manifest.name,
      description: project.manifest.description,
      createdAt: new Date(project.manifest.createdAt),
      updatedAt: new Date(project.manifest.updatedAt),
      size: sizeBytes ?? calculateProjectSize(project),
      // Keep the last thumbnail when this save cannot capture one.
      thumbnail: thumbnail ?? previous?.thumbnail,
      // Keep exampleId once set.
      exampleId: exampleId ?? previous?.exampleId
    };

    if (index >= 0) {
      metadata[index] = entry;
    } else {
      metadata.push(entry);
    }

    return metadata;
  });
}

async function removeFromMetadata(id: string): Promise<void> {
  await mutateProjectMetadata((metadata) =>
    metadata.filter((entry) => entry.id !== id)
  );
}

function calculateProjectSize(
  project: KhartisProject | SerializedProject
): number {
  return estimateProjectStorageSize(project);
}
