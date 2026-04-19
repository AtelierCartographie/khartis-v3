import { unzipSync } from 'fflate';
import type { AssetRef } from '$lib/features/commons/store/create-project.types';
import type { SerializedProject } from '$lib/types/serialization.types';
import { persistAssetBytes } from '../core/asset-store';
import { saveProject } from '../core/persistence';
import { migrateIfNeeded } from '../core/schema-migration';
import { deserialize } from '../core/serializer';
import type { KhartisProject } from '../types';

interface ProjectArchiveAssetEntry extends AssetRef {
  path: string;
}

interface ProjectArchiveManifest {
  archiveVersion: 2;
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
    throw new Error(`Invalid ${label} in project archive`, {
      cause: error
    });
  }
}

function assertArchiveManifest(
  value: unknown
): asserts value is ProjectArchiveManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid project archive manifest');
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.archiveVersion !== 2 ||
    !Array.isArray(candidate.assets) ||
    typeof candidate.projectId !== 'string'
  ) {
    throw new Error('Unsupported project archive manifest');
  }
}

async function restoreArchiveAssets(
  archiveEntries: Record<string, Uint8Array>,
  manifest: ProjectArchiveManifest
): Promise<void> {
  for (const asset of manifest.assets) {
    const payload = archiveEntries[asset.path];
    if (!payload) {
      throw new Error(`Missing archived asset: ${asset.originalName}`);
    }

    await persistAssetBytes(payload, asset);
  }
}

function assertSerializedProject(
  value: unknown
): asserts value is SerializedProject {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid project archive payload');
  }

  const candidate = value as Record<string, unknown>;
  const manifest = candidate.manifest as Record<string, unknown> | undefined;

  if (!manifest || typeof manifest.name !== 'string') {
    throw new Error('Invalid project archive payload');
  }
}

export async function importProject(file: File): Promise<KhartisProject> {
  const archiveBuffer = await file.arrayBuffer();
  const archiveEntries = unzipSync(new Uint8Array(archiveBuffer));

  const manifestPayload = archiveEntries['manifest.json'];
  const projectPayload = archiveEntries['project.json'];

  if (!manifestPayload || !projectPayload) {
    throw new Error('Invalid .kh archive structure');
  }

  const archiveManifest = decodeJson<unknown>(manifestPayload, 'manifest.json');
  assertArchiveManifest(archiveManifest);

  await restoreArchiveAssets(archiveEntries, archiveManifest);

  const serializedProject = decodeJson<unknown>(projectPayload, 'project.json');
  assertSerializedProject(serializedProject);

  const migrated = migrateIfNeeded(
    serializedProject as unknown as Record<string, unknown>
  ) as unknown as SerializedProject;

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
