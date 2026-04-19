import { unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureUploadedFileAssets = vi.fn(async (file) => file);
const readAssetBytes = vi.fn(async () => new Uint8Array([1, 2, 3, 4]));
const persistAssetBytes = vi.fn(async () => undefined);
const saveProject = vi.fn(async () => undefined);
const deserialize = vi.fn(async (project) => project);
const migrateIfNeeded = vi.fn((project) => project);
const serialize = vi.fn(async (project) => ({
  id: project.id,
  manifest: {
    ...project.manifest,
    createdAt: project.manifest.createdAt.toISOString(),
    updatedAt: project.manifest.updatedAt.toISOString()
  },
  data: {
    sourceFiles: project.data.sourceFiles
  }
}));

vi.mock('$lib/features/project-management/core/asset-store', () => ({
  ensureUploadedFileAssets,
  readAssetBytes,
  persistAssetBytes
}));

vi.mock('$lib/features/project-management/core/persistence', () => ({
  saveProject
}));

vi.mock('$lib/features/project-management/core/serializer', () => ({
  deserialize,
  serialize
}));

vi.mock('$lib/features/project-management/core/schema-migration', () => ({
  migrateIfNeeded
}));

function createProjectFixture() {
  return {
    id: 'project-1',
    manifest: {
      version: '3.3.0',
      createdAt: new Date('2026-04-16T00:00:00.000Z'),
      updatedAt: new Date('2026-04-16T00:00:00.000Z'),
      name: 'Archive Project',
      format: 'kh' as const
    },
    data: {
      sourceFiles: [
        {
          id: 'file-1',
          name: 'data.csv',
          size: 4,
          type: 'text/csv',
          fileType: 'csv',
          status: 'complete',
          sourceType: 'file_upload',
          assetRef: {
            assetId: 'asset-1',
            originalName: 'data.csv',
            mimeType: 'text/csv',
            size: 4,
            kind: 'primary' as const
          }
        }
      ]
    }
  };
}

describe('project archive format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a .kh archive with manifest, project metadata and assets', async () => {
    const { createArchive } =
      await import('$lib/features/project-management/io/exporter');
    const project = createProjectFixture();

    const blob = await createArchive(project as never);
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));

    expect(ensureUploadedFileAssets).toHaveBeenCalledTimes(1);
    expect(readAssetBytes).toHaveBeenCalledWith('asset-1');
    expect(archive['manifest.json']).toBeDefined();
    expect(archive['project.json']).toBeDefined();
    expect(archive['assets/asset-1']).toBeDefined();

    const manifest = JSON.parse(
      new TextDecoder().decode(archive['manifest.json'])
    ) as {
      archiveVersion: number;
      assetCount: number;
      assets: Array<{ assetId: string; path: string }>;
    };

    expect(manifest.archiveVersion).toBe(2);
    expect(manifest.assetCount).toBe(1);
    expect(manifest.assets[0]).toEqual(
      expect.objectContaining({
        assetId: 'asset-1',
        path: 'assets/asset-1'
      })
    );
  });

  it('imports a .kh archive by restoring assets before saving the project', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');

    const archive = zipSync({
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({
          archiveVersion: 2,
          appVersion: '3.3.0',
          exportedAt: '2026-04-16T00:00:00.000Z',
          projectId: 'project-1',
          assetCount: 1,
          assets: [
            {
              assetId: 'asset-1',
              originalName: 'data.csv',
              mimeType: 'text/csv',
              size: 4,
              kind: 'primary',
              path: 'assets/asset-1'
            }
          ]
        })
      ),
      'project.json': new TextEncoder().encode(
        JSON.stringify({
          id: 'project-1',
          manifest: {
            version: '3.3.0',
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z',
            name: 'Archive Project',
            format: 'kh'
          },
          data: {
            sourceFiles: [
              {
                id: 'file-1',
                name: 'data.csv',
                size: 4,
                type: 'text/csv',
                fileType: 'csv',
                status: 'complete',
                sourceType: 'file_upload',
                assetRef: {
                  assetId: 'asset-1',
                  originalName: 'data.csv',
                  mimeType: 'text/csv',
                  size: 4,
                  kind: 'primary'
                }
              }
            ]
          }
        })
      ),
      'assets/asset-1': new Uint8Array([1, 2, 3, 4])
    });

    const archiveBuffer = archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength
    ) as ArrayBuffer;

    const file = new File([archiveBuffer], 'archive.kh', {
      type: 'application/octet-stream'
    });

    const imported = await importProject(file);

    expect(persistAssetBytes).toHaveBeenCalledTimes(1);
    expect(persistAssetBytes).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        assetId: 'asset-1',
        path: 'assets/asset-1'
      })
    );
    expect(deserialize).toHaveBeenCalledTimes(1);
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(imported.id).toBe('project-1');
  });
});
