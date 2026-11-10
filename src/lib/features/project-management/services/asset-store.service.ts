import type {
  AssetRef,
  UploadedFile
} from '$lib/features/commons/types/create-project.types';
import {
  DataValidationError,
  PipelineError
} from '$lib/features/commons/pipeline.errors';
import { FILE_EXTENSION_GROUPS, MIME } from '$lib/features/commons/constants';
import { combineUint8Arrays } from '$lib/features/commons/utils/array.utils';
import { m } from '$lib/paraglide/messages';

import { PROJECT_CONST } from '../constants';
import { collectFileAssetRefs } from '../core/file-asset-refs';
import { getProjectDatabase } from './database-access.service';

// Legacy archive layers were persisted as GeoJSON snapshots and stay readable.
const ARCHIVE_SNAPSHOT_EXTENSIONS = [
  FILE_EXTENSION_GROUPS.PARQUET[0],
  FILE_EXTENSION_GROUPS.GEO[0]
];

interface StoredAssetMetadata {
  assetId: string;
  mimeType: string;
  size: number;
  chunkCount: number;
  chunkSize: number;
  createdAt: string;
}

interface StoredAssetChunk {
  assetId: string;
  chunkIndex: number;
  data: ArrayBuffer;
}

interface StoredProjectAssetRef {
  id: string;
  projectId: string;
  assetId: string;
  createdAt: string;
}

const { ASSET_STORE_NAME, ASSET_CHUNK_STORE_NAME, ASSET_REF_STORE_NAME } =
  PROJECT_CONST.DB;

const { CHUNK_SIZE } = PROJECT_CONST.ASSETS;

const PROJECT_ASSET_STORAGE_INSUFFICIENT_CODE =
  'PROJECT_ASSET_STORAGE_INSUFFICIENT';

function createProjectAssetRefId(projectId: string, assetId: string): string {
  return `${projectId}:${assetId}`;
}

async function getDb(): Promise<IDBDatabase> {
  return getProjectDatabase();
}

function getChunkCount(size: number, chunkSize = CHUNK_SIZE): number {
  if (size === 0) {
    return 1;
  }

  return Math.ceil(size / chunkSize);
}

function cloneArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

export async function assetExists(assetId: string): Promise<boolean> {
  const db = await getDb();

  return new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction([ASSET_STORE_NAME], 'readonly');
    const request = tx.objectStore(ASSET_STORE_NAME).getKey(assetId);

    request.onsuccess = () => resolve(request.result !== undefined);
    request.onerror = () =>
      reject(request.error || new Error(m.error_failed_check_asset()));
  });
}

async function putAssetChunk(
  db: IDBDatabase,
  assetId: string,
  chunkIndex: number,
  data: ArrayBuffer
): Promise<void> {
  // put() clones `data` synchronously, so the caller may reuse it afterwards.
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ASSET_CHUNK_STORE_NAME], 'readwrite');
    tx.objectStore(ASSET_CHUNK_STORE_NAME).put({
      assetId,
      chunkIndex,
      data
    } satisfies StoredAssetChunk);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error || new Error(m.error_failed_write_asset_chunk()));
  });
}

async function writeAssetChunks(
  db: IDBDatabase,
  assetId: string,
  blob: Blob
): Promise<void> {
  const chunkCount = getChunkCount(blob.size);

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, blob.size);
    const chunk = await blob.slice(start, end).arrayBuffer();

    await putAssetChunk(db, assetId, chunkIndex, cloneArrayBuffer(chunk));
  }
}

async function writeAssetChunkStream(
  db: IDBDatabase,
  assetId: string,
  source: ReadableStream<Uint8Array>
): Promise<number> {
  const reader = source.getReader();
  const chunk = new Uint8Array(CHUNK_SIZE);
  let filled = 0;
  let chunkIndex = 0;
  let size = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      let offset = 0;
      while (offset < value.length) {
        const count = Math.min(CHUNK_SIZE - filled, value.length - offset);
        chunk.set(value.subarray(offset, offset + count), filled);
        filled += count;
        offset += count;
        size += count;

        if (filled === CHUNK_SIZE) {
          await putAssetChunk(db, assetId, chunkIndex, chunk.buffer);
          chunkIndex += 1;
          filled = 0;
        }
      }
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  }

  if (filled > 0 || chunkIndex === 0) {
    await putAssetChunk(db, assetId, chunkIndex, chunk.buffer.slice(0, filled));
  }

  return size;
}

async function putAssetMetadata(
  db: IDBDatabase,
  ref: AssetRef,
  size: number
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ASSET_STORE_NAME], 'readwrite');
    tx.objectStore(ASSET_STORE_NAME).put({
      assetId: ref.assetId,
      mimeType: ref.mimeType,
      size: ref.size,
      chunkCount: getChunkCount(size),
      chunkSize: CHUNK_SIZE,
      createdAt: new Date().toISOString()
    } satisfies StoredAssetMetadata);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error || new Error(m.error_failed_create_asset_metadata()));
  });
}

async function assertStorageHeadroom(
  ref: AssetRef,
  requiredBytes: number
): Promise<void> {
  const hasHeadroom = await estimateStorageHeadroom(requiredBytes);
  if (!hasHeadroom) {
    throw new PipelineError(
      m.error_insufficient_storage(),
      PROJECT_ASSET_STORAGE_INSUFFICIENT_CODE,
      {
        assetId: ref.assetId,
        requiredBytes
      }
    );
  }
}

export async function persistAssetBlob(
  blob: Blob,
  ref: AssetRef
): Promise<AssetRef> {
  const db = await getDb();
  const alreadyExists = await assetExists(ref.assetId);

  if (!alreadyExists) {
    await assertStorageHeadroom(ref, blob.size);
    await writeAssetChunks(db, ref.assetId, blob);
    await putAssetMetadata(db, ref, blob.size);
  }

  return ref;
}

/**
 * Writes an asset chunk by chunk as the stream yields it, so the whole
 * payload never sits in memory. `ref.size` is the expected size, used for the
 * storage headroom check; the returned ref carries the size actually written.
 */
export async function persistAssetStream(
  source: ReadableStream<Uint8Array>,
  ref: AssetRef
): Promise<AssetRef> {
  const db = await getDb();
  const alreadyExists = await assetExists(ref.assetId);

  if (alreadyExists) {
    await source.cancel();
    return ref;
  }

  await assertStorageHeadroom(ref, ref.size);
  const size = await writeAssetChunkStream(db, ref.assetId, source);
  const writtenRef = { ...ref, size };
  await putAssetMetadata(db, writtenRef, size);
  return writtenRef;
}

export async function persistAssetBytes(
  bytes: Uint8Array,
  ref: AssetRef
): Promise<AssetRef> {
  const blob = new Blob([toArrayBuffer(bytes)], { type: ref.mimeType });
  return persistAssetBlob(blob, { ...ref, size: blob.size });
}

export async function createAssetRefFromFile(
  file: File,
  kind: AssetRef['kind'],
  originalName = file.name
): Promise<AssetRef> {
  const ref: AssetRef = {
    assetId: crypto.randomUUID(),
    originalName,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    kind
  };

  return persistAssetBlob(file, ref);
}

function findCompanionFiles(file: UploadedFile): File[] {
  if (!file.relatedFileObjects?.length) {
    return [];
  }

  const mainFileName =
    file.originalFile?.name?.toLowerCase() ?? file.name.toLowerCase();

  return file.relatedFileObjects.filter(
    (candidate) => candidate.name.toLowerCase() !== mainFileName
  );
}

export async function persistTableSnapshot(
  bytes: Uint8Array,
  fileName: string,
  hasGeometry: boolean
): Promise<AssetRef> {
  const baseName = fileName.replace(/\.[^.]+$/u, '');
  return persistAssetBytes(bytes, {
    assetId: crypto.randomUUID(),
    originalName: `${baseName}${FILE_EXTENSION_GROUPS.PARQUET[0]}`,
    mimeType: hasGeometry ? MIME.GEOPARQUET : MIME.PARQUET,
    size: bytes.byteLength,
    kind: 'primary'
  });
}

export async function ensureUploadedFileAssets(
  file: UploadedFile
): Promise<UploadedFile> {
  const preparedFile = { ...file };
  const archiveLayerSnapshot = preparedFile.sourceArchive
    ? preparedFile.archiveLayerSnapshot
    : undefined;
  const hasArchiveSnapshotAsset = Boolean(
    preparedFile.assetRef &&
    ARCHIVE_SNAPSHOT_EXTENSIONS.some((extension) =>
      preparedFile.assetRef?.originalName.endsWith(extension)
    )
  );

  const primaryAssetMissing =
    preparedFile.assetRef &&
    !(await assetExists(preparedFile.assetRef.assetId));

  if (
    !preparedFile.assetRef ||
    primaryAssetMissing ||
    (archiveLayerSnapshot && !hasArchiveSnapshotAsset)
  ) {
    if (archiveLayerSnapshot) {
      preparedFile.assetRef = await persistTableSnapshot(
        archiveLayerSnapshot,
        preparedFile.name,
        Boolean(preparedFile.geometry)
      );
    } else if (preparedFile.originalFile) {
      preparedFile.assetRef = await createAssetRefFromFile(
        preparedFile.originalFile,
        'primary',
        preparedFile.name
      );
    }
  }

  if (
    (preparedFile.companionAssetRefs?.length &&
      (
        await Promise.all(
          preparedFile.companionAssetRefs.map((assetRef) =>
            assetExists(assetRef.assetId)
          )
        )
      ).every(Boolean)) ||
    !preparedFile.relatedFileObjects
  ) {
    return preparedFile;
  }

  const companionFiles = findCompanionFiles(preparedFile);

  if (companionFiles.length > 0) {
    preparedFile.companionAssetRefs = [];

    for (const companion of companionFiles) {
      preparedFile.companionAssetRefs.push(
        await createAssetRefFromFile(companion, 'companion')
      );
    }
  }

  return preparedFile;
}

async function loadAssetMetadata(
  assetId: string
): Promise<StoredAssetMetadata | null> {
  const db = await getDb();

  return new Promise<StoredAssetMetadata | null>((resolve, reject) => {
    const tx = db.transaction([ASSET_STORE_NAME], 'readonly');
    const request = tx.objectStore(ASSET_STORE_NAME).get(assetId);

    request.onsuccess = () =>
      resolve((request.result as StoredAssetMetadata | undefined) ?? null);
    request.onerror = () =>
      reject(request.error || new Error(m.error_failed_load_asset_metadata()));
  });
}

export async function readAssetBytes(assetId: string): Promise<Uint8Array> {
  const db = await getDb();
  const metadata = await loadAssetMetadata(assetId);

  if (!metadata) {
    throw new DataValidationError(
      m.error_missing_asset_metadata({ assetId }),
      'assetId',
      { assetId }
    );
  }

  const chunks = await new Promise<StoredAssetChunk[]>((resolve, reject) => {
    const tx = db.transaction([ASSET_CHUNK_STORE_NAME], 'readonly');
    const store = tx.objectStore(ASSET_CHUNK_STORE_NAME);
    const index = store.index('assetId');
    const request = index.getAll(IDBKeyRange.only(assetId));

    request.onsuccess = () =>
      resolve(
        (request.result as StoredAssetChunk[]).sort(
          (a, b) => a.chunkIndex - b.chunkIndex
        )
      );
    request.onerror = () =>
      reject(request.error || new Error(m.error_failed_read_asset_chunks()));
  });

  if (chunks.length !== metadata.chunkCount) {
    throw new DataValidationError(
      m.error_corrupted_asset({
        assetId,
        expectedChunks: String(metadata.chunkCount),
        actualChunks: String(chunks.length)
      }),
      'chunks',
      {
        assetId,
        expectedChunks: metadata.chunkCount,
        actualChunks: chunks.length
      }
    );
  }

  return combineUint8Arrays(chunks.map((chunk) => new Uint8Array(chunk.data)));
}

export async function createFileFromAssetRef(
  assetRef: AssetRef
): Promise<File> {
  const bytes = await readAssetBytes(assetRef.assetId);
  return new File([toArrayBuffer(bytes)], assetRef.originalName, {
    type: assetRef.mimeType || 'application/octet-stream'
  });
}

export async function createCompanionFilesFromAssetRefs(
  assetRefs: AssetRef[] | undefined
): Promise<File[] | undefined> {
  if (!assetRefs?.length) {
    return undefined;
  }

  const files = await Promise.all(assetRefs.map(createFileFromAssetRef));
  return files.length > 0 ? files : undefined;
}

export function extractAssetIdsFromFiles(files: UploadedFile[]): string[] {
  return files.flatMap((file) =>
    collectFileAssetRefs(file).map((assetRef) => assetRef.assetId)
  );
}

async function loadProjectAssetIds(projectId: string): Promise<string[]> {
  const db = await getDb();

  return new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction([ASSET_REF_STORE_NAME], 'readonly');
    const store = tx.objectStore(ASSET_REF_STORE_NAME);
    const index = store.index('projectId');
    const request = index.getAll(IDBKeyRange.only(projectId));

    request.onsuccess = () => {
      const refs = (request.result as StoredProjectAssetRef[]).map(
        (entry) => entry.assetId
      );
      resolve(refs);
    };
    request.onerror = () =>
      reject(request.error || new Error(m.error_failed_read_project_refs()));
  });
}

export async function syncProjectAssetRefs(
  projectId: string,
  files: UploadedFile[],
  additionalAssetRefs: readonly AssetRef[] = []
): Promise<void> {
  const db = await getDb();
  const nextAssetIds = new Set([
    ...extractAssetIdsFromFiles(files),
    ...additionalAssetRefs.map((assetRef) => assetRef.assetId)
  ]);
  const currentAssetIds = new Set(await loadProjectAssetIds(projectId));

  const idsToAdd = [...nextAssetIds].filter(
    (assetId) => !currentAssetIds.has(assetId)
  );
  const idsToRemove = [...currentAssetIds].filter(
    (assetId) => !nextAssetIds.has(assetId)
  );

  if (idsToAdd.length === 0 && idsToRemove.length === 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ASSET_REF_STORE_NAME], 'readwrite');
    const store = tx.objectStore(ASSET_REF_STORE_NAME);

    idsToAdd.forEach((assetId) => {
      store.put({
        id: createProjectAssetRefId(projectId, assetId),
        projectId,
        assetId,
        createdAt: new Date().toISOString()
      } satisfies StoredProjectAssetRef);
    });

    idsToRemove.forEach((assetId) => {
      store.delete(createProjectAssetRefId(projectId, assetId));
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error || new Error(m.error_failed_sync_project_refs()));
  });

  await deleteOrphanAssets(idsToRemove);
}

async function countAssetReferences(assetId: string): Promise<number> {
  const db = await getDb();

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction([ASSET_REF_STORE_NAME], 'readonly');
    const store = tx.objectStore(ASSET_REF_STORE_NAME);
    const index = store.index('assetId');
    const request = index.count(IDBKeyRange.only(assetId));

    request.onsuccess = () => resolve(request.result ?? 0);
    request.onerror = () =>
      reject(request.error || new Error('Failed to count asset refs'));
  });
}

async function deleteAsset(assetId: string): Promise<void> {
  const db = await getDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      [ASSET_STORE_NAME, ASSET_CHUNK_STORE_NAME],
      'readwrite'
    );
    tx.objectStore(ASSET_STORE_NAME).delete(assetId);

    const chunkStore = tx.objectStore(ASSET_CHUNK_STORE_NAME);
    const index = chunkStore.index('assetId');
    const request = index.openKeyCursor(IDBKeyRange.only(assetId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      chunkStore.delete(cursor.primaryKey);
      cursor.continue();
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error || new Error(m.error_failed_delete_asset()));
  });
}

export async function deleteOrphanAssets(assetIds: string[]): Promise<void> {
  for (const assetId of assetIds) {
    const refCount = await countAssetReferences(assetId);

    if (refCount === 0) {
      await deleteAsset(assetId);
    }
  }
}

export async function removeProjectAssetRefs(projectId: string): Promise<void> {
  const assetIds = await loadProjectAssetIds(projectId);
  if (assetIds.length === 0) {
    return;
  }

  const db = await getDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ASSET_REF_STORE_NAME], 'readwrite');
    const store = tx.objectStore(ASSET_REF_STORE_NAME);

    assetIds.forEach((assetId) => {
      store.delete(createProjectAssetRefId(projectId, assetId));
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error || new Error(m.error_failed_remove_project_refs()));
  });

  await deleteOrphanAssets(assetIds);
}

export async function estimateStorageHeadroom(
  requiredBytes: number
): Promise<boolean> {
  const storageManager = globalThis.navigator?.storage;
  if (!storageManager?.estimate) {
    return true;
  }

  try {
    const { quota = 0, usage = 0 } = await storageManager.estimate();
    if (!quota) {
      return true;
    }

    const remaining = quota - usage;
    const safetyMargin = Math.max(requiredBytes * 0.2, CHUNK_SIZE);
    return remaining > requiredBytes + safetyMargin;
  } catch {
    return true;
  }
}
