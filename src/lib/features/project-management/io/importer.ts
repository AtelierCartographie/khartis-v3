import { unzipSync, type UnzipFileInfo } from 'fflate';
import { m } from '$lib/paraglide/messages';
import { ParseError } from '$lib/features/commons/pipeline.errors';
import { STORAGE_LIMITS } from '$lib/features/commons/constants/validation.config';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { AssetRef } from '$lib/features/commons/types/create-project.types';
import type { SerializedProject } from '$lib/types/serialization.types';
import {
  deleteOrphanAssets,
  persistAssetBytes
} from '../services/asset-store.service';
import {
  loadSerializedProject,
  removeProject,
  saveProject
} from '../services/persistence.service';
import { migrateIfNeeded } from '../core/schema-migration';
import { deserialize } from '../services/serializer.service';
import type { KhartisProject } from '../types';
import { PROJECT_CONST } from '../constants';

const KHARTIS_PROJECT_FILE_TYPE = 'khartis-project';
const ARCHIVE_ASSET_PATH_PREFIX = 'assets/';
const ARCHIVE_JSON_ENTRIES = ['manifest.json', 'project.json'];

const ARCHIVE_IMPORT_LIMITS = {
  maxArchiveBytes: STORAGE_LIMITS.maxFileSize,
  maxEntryBytes: STORAGE_LIMITS.maxFileSize,
  maxTotalBytes: STORAGE_LIMITS.maxFileSize + STORAGE_LIMITS.maxProjectSize,
  // 2 JSON entries + assets bounded by maxFileCount source files and their companions.
  maxEntryCount: 256
} as const;

interface ProjectArchiveAssetEntry extends AssetRef {
  path: string;
}

interface ProjectArchiveManifest {
  archiveVersion: number;
  appVersion: string;
  exportedAt: string;
  projectId: string;
  assetCount: number;
  assets: ProjectArchiveAssetEntry[];
}

function throwArchiveTooLarge(
  fileName: string,
  details: Record<string, unknown>
): never {
  throw new ParseError(
    m.error_project_archive_too_large({
      limit: String(
        Math.round(ARCHIVE_IMPORT_LIMITS.maxArchiveBytes / (1024 * 1024))
      )
    }),
    KHARTIS_PROJECT_FILE_TYPE,
    { fileName, ...details }
  );
}

function unzipArchive(
  archiveBytes: Uint8Array,
  fileName: string
): Record<string, Uint8Array> {
  let entryCount = 0;
  let totalBytes = 0;
  let oversizedEntry: string | null = null;

  const filter = (entry: UnzipFileInfo): boolean => {
    if (oversizedEntry) {
      return false;
    }

    const isExpectedEntry =
      ARCHIVE_JSON_ENTRIES.includes(entry.name) ||
      entry.name.startsWith(ARCHIVE_ASSET_PATH_PREFIX);
    if (!isExpectedEntry) {
      return false;
    }

    entryCount += 1;
    totalBytes += entry.originalSize;

    if (
      entryCount > ARCHIVE_IMPORT_LIMITS.maxEntryCount ||
      entry.originalSize > ARCHIVE_IMPORT_LIMITS.maxEntryBytes ||
      totalBytes > ARCHIVE_IMPORT_LIMITS.maxTotalBytes
    ) {
      oversizedEntry = entry.name;
      return false;
    }

    return true;
  };

  let archiveEntries: Record<string, Uint8Array>;
  try {
    archiveEntries = unzipSync(archiveBytes, { filter });
  } catch (error) {
    throw new ParseError(
      m.error_invalid_kh_archive_structure(),
      KHARTIS_PROJECT_FILE_TYPE,
      {
        fileName,
        cause: error instanceof Error ? error.message : String(error)
      }
    );
  }

  if (oversizedEntry) {
    throwArchiveTooLarge(fileName, {
      entry: oversizedEntry,
      entryCount,
      totalBytes
    });
  }

  return archiveEntries;
}

function decodeJson<T>(payload: Uint8Array, label: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as T;
  } catch (error) {
    throw new ParseError(
      m.error_invalid_project_archive_entry({ label }),
      KHARTIS_PROJECT_FILE_TYPE,
      {
        cause: error instanceof Error ? error.message : String(error),
        label
      }
    );
  }
}

function isArchiveAssetEntry(
  value: unknown
): value is ProjectArchiveAssetEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.assetId === 'string' &&
    candidate.assetId.length > 0 &&
    candidate.path === `${ARCHIVE_ASSET_PATH_PREFIX}${candidate.assetId}` &&
    typeof candidate.originalName === 'string' &&
    typeof candidate.mimeType === 'string'
  );
}

function assertArchiveManifest(
  value: unknown
): asserts value is ProjectArchiveManifest {
  if (!value || typeof value !== 'object') {
    throw new ParseError(
      m.error_invalid_project_manifest(),
      KHARTIS_PROJECT_FILE_TYPE
    );
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.archiveVersion !== 'number' ||
    !PROJECT_CONST.ARCHIVE.SUPPORTED_VERSIONS.some(
      (version) => version === candidate.archiveVersion
    ) ||
    !Array.isArray(candidate.assets) ||
    typeof candidate.projectId !== 'string'
  ) {
    throw new ParseError(
      m.error_unsupported_project_manifest(),
      KHARTIS_PROJECT_FILE_TYPE,
      {
        archiveVersion: candidate.archiveVersion,
        projectId: candidate.projectId
      }
    );
  }

  if (
    candidate.assetCount !== candidate.assets.length ||
    !candidate.assets.every(isArchiveAssetEntry)
  ) {
    throw new ParseError(
      m.error_invalid_project_manifest(),
      KHARTIS_PROJECT_FILE_TYPE,
      {
        projectId: candidate.projectId,
        assetCount: candidate.assetCount,
        assetEntryCount: candidate.assets.length
      }
    );
  }
}

async function restoreArchiveAssets(
  archiveEntries: Record<string, Uint8Array>,
  manifest: ProjectArchiveManifest
): Promise<void> {
  for (const asset of manifest.assets) {
    const payload = archiveEntries[asset.path];
    if (!payload) {
      throw new ParseError(
        m.error_missing_archived_asset({ originalName: asset.originalName }),
        KHARTIS_PROJECT_FILE_TYPE,
        {
          assetId: asset.assetId,
          originalName: asset.originalName,
          path: asset.path
        }
      );
    }

    await persistAssetBytes(payload, asset);
  }
}

function assertSerializedProject(
  value: unknown
): asserts value is SerializedProject {
  if (!value || typeof value !== 'object') {
    throw new ParseError(
      m.error_invalid_project_payload(),
      KHARTIS_PROJECT_FILE_TYPE
    );
  }

  const candidate = value as Record<string, unknown>;
  const manifest = candidate.manifest as Record<string, unknown> | undefined;

  if (!manifest || typeof manifest.name !== 'string') {
    throw new ParseError(
      m.error_invalid_project_payload(),
      KHARTIS_PROJECT_FILE_TYPE
    );
  }
}

async function resolveImportedProjectId(
  serializedProject: SerializedProject
): Promise<string> {
  const requestedId =
    typeof serializedProject.id === 'string' && serializedProject.id.length > 0
      ? serializedProject.id
      : crypto.randomUUID();

  const existingProject = await loadSerializedProject(requestedId);
  return existingProject ? crypto.randomUUID() : requestedId;
}

async function cleanupFailedImport(
  projectId: string,
  manifest: ProjectArchiveManifest
): Promise<void> {
  try {
    await removeProject(projectId);
    await deleteOrphanAssets(manifest.assets.map((asset) => asset.assetId));
  } catch (cleanupError) {
    logger.error(
      'Failed to clean up after an aborted project import',
      LogCategory.PERSISTENCE,
      { projectId, cleanupError }
    );
  }
}

export async function importProject(file: File): Promise<KhartisProject> {
  if (file.size > ARCHIVE_IMPORT_LIMITS.maxArchiveBytes) {
    throwArchiveTooLarge(file.name, { archiveBytes: file.size });
  }

  const archiveBuffer = await file.arrayBuffer();
  const archiveEntries = unzipArchive(new Uint8Array(archiveBuffer), file.name);

  const manifestPayload = archiveEntries['manifest.json'];
  const projectPayload = archiveEntries['project.json'];

  if (!manifestPayload || !projectPayload) {
    throw new ParseError(
      m.error_invalid_kh_archive_structure(),
      KHARTIS_PROJECT_FILE_TYPE,
      { fileName: file.name }
    );
  }

  const archiveManifest = decodeJson<unknown>(manifestPayload, 'manifest.json');
  assertArchiveManifest(archiveManifest);

  const serializedProject = decodeJson<unknown>(projectPayload, 'project.json');
  assertSerializedProject(serializedProject);

  const migrated = migrateIfNeeded({ ...serializedProject });
  assertSerializedProject(migrated);

  const projectId = await resolveImportedProjectId(migrated);

  try {
    await restoreArchiveAssets(archiveEntries, archiveManifest);

    const project = await deserialize({
      ...migrated,
      id: projectId,
      manifest: {
        ...migrated.manifest,
        updatedAt: new Date().toISOString()
      }
    });

    await saveProject(project);
    return project;
  } catch (error) {
    await cleanupFailedImport(projectId, archiveManifest);
    throw error;
  }
}
