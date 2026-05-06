import { zipSync } from 'fflate';
import type {
  AssetRef,
  UploadedFile
} from '$lib/features/commons/types/create-project.types';
import { PROJECT_CONST } from '../constants';
import {
  ensureUploadedFileAssets,
  readAssetBytes
} from '../services/asset-store.service';
import { serialize } from '../services/serializer.service';
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function collectUniqueAssetRefs(files: UploadedFile[]): AssetRef[] {
  const uniqueAssetRefs = new Map<string, AssetRef>();

  files.forEach((file) => {
    if (file.assetRef) {
      uniqueAssetRefs.set(file.assetRef.assetId, file.assetRef);
    }

    file.companionAssetRefs?.forEach((assetRef) => {
      uniqueAssetRefs.set(assetRef.assetId, assetRef);
    });
  });

  return [...uniqueAssetRefs.values()];
}

async function ensureProjectAssets(
  project: KhartisProject
): Promise<KhartisProject> {
  if (!project.data?.sourceFiles?.length) {
    return project;
  }

  project.data.sourceFiles = await Promise.all(
    project.data.sourceFiles.map((file) => ensureUploadedFileAssets(file))
  );

  return project;
}

async function createArchivePayload(project: KhartisProject): Promise<Blob> {
  await ensureProjectAssets(project);

  const serialized = await serialize(project);
  const sourceFiles = project.data?.sourceFiles ?? [];
  const assetRefs = collectUniqueAssetRefs(sourceFiles);
  const manifestAssets: ProjectArchiveAssetEntry[] = assetRefs.map(
    (assetRef) => ({
      ...assetRef,
      path: `assets/${assetRef.assetId}`
    })
  );

  const manifest: ProjectArchiveManifest = {
    archiveVersion: 2,
    appVersion: PROJECT_CONST.APP_VERSION,
    exportedAt: new Date().toISOString(),
    projectId: project.id,
    assetCount: manifestAssets.length,
    assets: manifestAssets
  };

  const archiveEntries: Record<
    string,
    Uint8Array | [Uint8Array, { level: 0 | 6 }]
  > = {
    'manifest.json': [
      new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
      { level: 6 as const }
    ],
    'project.json': [
      new TextEncoder().encode(JSON.stringify(serialized, null, 2)),
      { level: 6 as const }
    ]
  };

  for (const asset of manifestAssets) {
    archiveEntries[asset.path] = [
      await readAssetBytes(asset.assetId),
      { level: 0 as const }
    ];
  }

  const archive = zipSync(archiveEntries, { level: 0 });
  return new Blob([toArrayBuffer(archive)], {
    type: 'application/octet-stream'
  });
}

export async function exportProject(project: KhartisProject): Promise<Blob> {
  return createArchivePayload(project);
}

export async function createArchive(project: KhartisProject): Promise<Blob> {
  return createArchivePayload(project);
}
