import { unzipSync } from 'fflate';
import { m } from '$lib/paraglide/messages';
import { ParseError } from '$lib/features/commons/pipeline.errors';
import type { AssetRef } from '$lib/features/commons/types/create-project.types';
import type { SerializedProject } from '$lib/types/serialization.types';
import { persistAssetBytes } from '../services/asset-store.service';
import { saveProject } from '../services/persistence.service';
import { migrateIfNeeded } from '../core/schema-migration';
import { deserialize } from '../services/serializer.service';
import type { KhartisProject } from '../types';
import { PROJECT_CONST } from '../constants';

const KHARTIS_PROJECT_FILE_TYPE = 'khartis-project';

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

export async function importProject(file: File): Promise<KhartisProject> {
  const archiveBuffer = await file.arrayBuffer();
  const archiveEntries = unzipSync(new Uint8Array(archiveBuffer));

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

  await restoreArchiveAssets(archiveEntries, archiveManifest);

  const project = await deserialize({
    ...migrated,
    id: migrated.id || crypto.randomUUID(),
    manifest: {
      ...migrated.manifest,
      updatedAt: new Date().toISOString()
    }
  });

  await saveProject(project);
  return project;
}
