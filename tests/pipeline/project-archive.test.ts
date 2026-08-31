import { unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ParseError,
  PipelineError
} from '$lib/features/commons/pipeline.errors';
import { PROJECT_CONST } from '$lib/features/project-management/constants';

const ensureUploadedFileAssets = vi.fn(async (file) => file);
const readAssetBytes = vi.fn(async () => new Uint8Array([1, 2, 3, 4]));
const persistAssetBytes = vi.fn(async () => undefined);
const deleteOrphanAssets = vi.fn(async () => undefined);
const saveProject = vi.fn(async () => undefined);
const loadSerializedProject = vi.fn(async () => null);
const removeProject = vi.fn(async () => undefined);
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

vi.mock(
  '$lib/features/project-management/services/asset-store.service',
  () => ({
    ensureUploadedFileAssets,
    readAssetBytes,
    persistAssetBytes,
    deleteOrphanAssets
  })
);

vi.mock(
  '$lib/features/project-management/services/persistence.service',
  () => ({
    saveProject,
    loadSerializedProject,
    removeProject
  })
);

vi.mock('$lib/features/project-management/services/serializer.service', () => ({
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
      version: PROJECT_CONST.SCHEMA_VERSION,
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

    expect(manifest.archiveVersion).toBe(PROJECT_CONST.ARCHIVE.CURRENT_VERSION);
    expect(manifest.assetCount).toBe(1);
    expect(manifest.assets[0]).toEqual(
      expect.objectContaining({
        assetId: 'asset-1',
        path: 'assets/asset-1'
      })
    );
  });

  it('exports from an asset-prepared copy without mutating the project', async () => {
    const { createArchive } =
      await import('$lib/features/project-management/io/exporter');
    const project = createProjectFixture();
    const sourceFile = {
      ...project.data.sourceFiles[0],
      assetRef: undefined
    };
    const preparedFile = {
      ...sourceFile,
      assetRef: {
        assetId: 'asset-prepared',
        originalName: 'data.csv',
        mimeType: 'text/csv',
        size: 4,
        kind: 'primary' as const
      }
    };
    project.data.sourceFiles = [sourceFile as never];
    ensureUploadedFileAssets.mockResolvedValueOnce(preparedFile);

    await createArchive(project as never);

    const serializedProject = serialize.mock.calls[0]?.[0] as {
      data: { sourceFiles: unknown[] };
    };

    expect(project.data.sourceFiles[0]).toBe(sourceFile);
    expect(project.data.sourceFiles[0].assetRef).toBeUndefined();
    expect(serializedProject).not.toBe(project);
    expect(serializedProject.data.sourceFiles).toEqual([preparedFile]);
    expect(serializedProject.data.sourceFiles).not.toBe(
      project.data.sourceFiles
    );
    expect(readAssetBytes).toHaveBeenCalledWith('asset-prepared');
  });

  it('imports a supported .kh archive after validating its project schema', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');

    const archive = zipSync({
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({
          archiveVersion: PROJECT_CONST.ARCHIVE.CURRENT_VERSION,
          appVersion: PROJECT_CONST.SCHEMA_VERSION,
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
            version: PROJECT_CONST.SCHEMA_VERSION,
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

  it('rejects an unsupported archive version before restoring assets', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');

    const archive = zipSync({
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({
          archiveVersion: 1,
          appVersion: PROJECT_CONST.SCHEMA_VERSION,
          exportedAt: '2026-04-16T00:00:00.000Z',
          projectId: 'project-1',
          assetCount: 0,
          assets: []
        })
      ),
      'project.json': new TextEncoder().encode(
        JSON.stringify({
          id: 'project-1',
          manifest: {
            version: PROJECT_CONST.SCHEMA_VERSION,
            name: 'Unsupported archive'
          }
        })
      )
    });
    const archiveBuffer = archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength
    ) as ArrayBuffer;
    const file = new File([archiveBuffer], 'unsupported.kh', {
      type: 'application/octet-stream'
    });

    await expect(importProject(file)).rejects.toMatchObject({
      code: 'PARSE_ERROR',
      details: expect.objectContaining({ archiveVersion: 1 })
    });
    expect(migrateIfNeeded).not.toHaveBeenCalled();
    expect(persistAssetBytes).not.toHaveBeenCalled();
  });

  it('rejects an unsupported project schema before restoring assets', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');
    migrateIfNeeded.mockImplementationOnce(() => {
      throw new PipelineError(
        'Unsupported project schema',
        'UNSUPPORTED_PROJECT_SCHEMA_VERSION'
      );
    });

    const archive = zipSync({
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({
          archiveVersion: PROJECT_CONST.ARCHIVE.CURRENT_VERSION,
          appVersion: PROJECT_CONST.SCHEMA_VERSION,
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
            version: '3.8.0',
            name: 'Pre-production project'
          }
        })
      ),
      'assets/asset-1': new Uint8Array([1, 2, 3, 4])
    });
    const archiveBuffer = archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength
    ) as ArrayBuffer;
    const file = new File([archiveBuffer], 'unsupported-schema.kh', {
      type: 'application/octet-stream'
    });

    await expect(importProject(file)).rejects.toMatchObject({
      code: 'UNSUPPORTED_PROJECT_SCHEMA_VERSION'
    });
    expect(persistAssetBytes).not.toHaveBeenCalled();
    expect(deserialize).not.toHaveBeenCalled();
    expect(saveProject).not.toHaveBeenCalled();
  });

  function createArchiveFile(
    entries: Parameters<typeof zipSync>[0],
    fileName = 'archive.kh'
  ): File {
    const archive = zipSync(entries);
    const archiveBuffer = archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength
    ) as ArrayBuffer;
    return new File([archiveBuffer], fileName, {
      type: 'application/octet-stream'
    });
  }

  function createManifestPayload(overrides: Record<string, unknown> = {}) {
    return new TextEncoder().encode(
      JSON.stringify({
        archiveVersion: PROJECT_CONST.ARCHIVE.CURRENT_VERSION,
        appVersion: PROJECT_CONST.SCHEMA_VERSION,
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
        ],
        ...overrides
      })
    );
  }

  function createProjectPayload() {
    return new TextEncoder().encode(
      JSON.stringify({
        id: 'project-1',
        manifest: {
          version: PROJECT_CONST.SCHEMA_VERSION,
          createdAt: '2026-04-16T00:00:00.000Z',
          updatedAt: '2026-04-16T00:00:00.000Z',
          name: 'Archive Project',
          format: 'kh'
        },
        data: { sourceFiles: [] }
      })
    );
  }

  it('imports under a new id when the archive project id already exists locally', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');
    loadSerializedProject.mockResolvedValueOnce({
      id: 'project-1'
    } as never);

    const file = createArchiveFile({
      'manifest.json': createManifestPayload(),
      'project.json': createProjectPayload(),
      'assets/asset-1': new Uint8Array([1, 2, 3, 4])
    });

    const imported = await importProject(file);

    expect(loadSerializedProject).toHaveBeenCalledWith('project-1');
    expect(imported.id).not.toBe('project-1');
    expect(imported.id).toMatch(/[0-9a-f-]{36}/u);
    expect(saveProject).toHaveBeenCalledTimes(1);
  });

  it('removes the partial project and orphan assets when saving the imported project fails', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');
    saveProject.mockRejectedValueOnce(new Error('quota exceeded') as never);

    const file = createArchiveFile({
      'manifest.json': createManifestPayload(),
      'project.json': createProjectPayload(),
      'assets/asset-1': new Uint8Array([1, 2, 3, 4])
    });

    await expect(importProject(file)).rejects.toThrow('quota exceeded');
    expect(persistAssetBytes).toHaveBeenCalledTimes(1);
    expect(removeProject).toHaveBeenCalledWith('project-1');
    expect(deleteOrphanAssets).toHaveBeenCalledWith(['asset-1']);
  });

  it('rejects an archive that exceeds the entry count limit', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');

    const entries: Record<string, Uint8Array> = {
      'manifest.json': createManifestPayload(),
      'project.json': createProjectPayload()
    };
    for (let index = 0; index < 300; index++) {
      entries[`assets/flood-${index}`] = new Uint8Array([0]);
    }

    await expect(
      importProject(createArchiveFile(entries))
    ).rejects.toMatchObject({
      code: 'PARSE_ERROR',
      details: expect.objectContaining({ entry: expect.any(String) })
    });
    expect(persistAssetBytes).not.toHaveBeenCalled();
  });

  it('rejects an archive file larger than the size limit before unzipping', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');

    const file = createArchiveFile({
      'manifest.json': createManifestPayload(),
      'project.json': createProjectPayload(),
      'assets/asset-1': new Uint8Array([1, 2, 3, 4])
    });
    Object.defineProperty(file, 'size', { value: 201 * 1024 * 1024 });

    await expect(importProject(file)).rejects.toMatchObject({
      code: 'PARSE_ERROR',
      details: expect.objectContaining({ archiveBytes: 201 * 1024 * 1024 })
    });
    expect(persistAssetBytes).not.toHaveBeenCalled();
  });

  it('rejects a manifest whose assetCount does not match its asset entries', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');

    const file = createArchiveFile({
      'manifest.json': createManifestPayload({ assetCount: 2 }),
      'project.json': createProjectPayload(),
      'assets/asset-1': new Uint8Array([1, 2, 3, 4])
    });

    await expect(importProject(file)).rejects.toMatchObject({
      code: 'PARSE_ERROR',
      details: expect.objectContaining({ assetCount: 2, assetEntryCount: 1 })
    });
    expect(persistAssetBytes).not.toHaveBeenCalled();
  });

  it('rejects a manifest asset entry whose path does not match its asset id', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');

    const file = createArchiveFile({
      'manifest.json': createManifestPayload({
        assets: [
          {
            assetId: 'asset-1',
            originalName: 'data.csv',
            mimeType: 'text/csv',
            size: 4,
            kind: 'primary',
            path: 'project.json'
          }
        ]
      }),
      'project.json': createProjectPayload(),
      'assets/asset-1': new Uint8Array([1, 2, 3, 4])
    });

    await expect(importProject(file)).rejects.toMatchObject({
      code: 'PARSE_ERROR'
    });
    expect(persistAssetBytes).not.toHaveBeenCalled();
  });

  it('ignores unexpected archive entries', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');

    const file = createArchiveFile({
      'manifest.json': createManifestPayload(),
      'project.json': createProjectPayload(),
      'assets/asset-1': new Uint8Array([1, 2, 3, 4]),
      '__MACOSX/junk': new Uint8Array([9, 9, 9])
    });

    const imported = await importProject(file);

    expect(imported.id).toBe('project-1');
    expect(persistAssetBytes).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-zip payload with a localized parse error', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');

    const file = new File([new Uint8Array([1, 2, 3, 4, 5])], 'broken.kh', {
      type: 'application/octet-stream'
    });

    await expect(importProject(file)).rejects.toMatchObject({
      name: 'ParseError',
      code: 'PARSE_ERROR',
      details: expect.objectContaining({
        fileName: 'broken.kh',
        cause: expect.any(String)
      })
    });
  });

  it('rejects invalid .kh archives with a typed parse error', async () => {
    const { importProject } =
      await import('$lib/features/project-management/io/importer');

    const archive = zipSync({
      'manifest.json': new TextEncoder().encode('{}')
    });
    const archiveBuffer = archive.buffer.slice(
      archive.byteOffset,
      archive.byteOffset + archive.byteLength
    ) as ArrayBuffer;
    const file = new File([archiveBuffer], 'broken.kh', {
      type: 'application/octet-stream'
    });

    const request = importProject(file);

    await expect(request).rejects.toMatchObject({
      name: 'ParseError',
      code: 'PARSE_ERROR',
      fileType: 'khartis-project',
      details: {
        fileName: 'broken.kh',
        fileType: 'khartis-project'
      }
    });
    await expect(request).rejects.toBeInstanceOf(ParseError);
  });
});
