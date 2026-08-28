import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataSourceType,
  FileType,
  type AssetRef
} from '$lib/features/commons/types/create-project.types';
import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import {
  DataValidationError,
  PipelineError
} from '$lib/features/commons/pipeline.errors';

const mocks = vi.hoisted(() => ({
  getProjectDatabase: vi.fn<() => Promise<IDBDatabase>>()
}));

vi.mock('./database-access.service', () => ({
  getProjectDatabase: mocks.getProjectDatabase
}));

const {
  createFileFromAssetRef,
  ensureUploadedFileAssets,
  persistAssetBlob,
  readAssetBytes
} = await import('./asset-store.service');

interface FakeStoredAssetMetadata {
  assetId: string;
  mimeType: string;
  size: number;
  chunkCount: number;
  chunkSize: number;
  createdAt: string;
}

interface FakeStoredAssetChunk {
  assetId: string;
  chunkIndex: number;
  data: ArrayBuffer;
}

interface FakeKeyRange {
  value: string;
}

type FakeStoreName = 'project_assets' | 'project_asset_chunks';

class FakeAssetObjectStore {
  constructor(
    private readonly storeName: FakeStoreName,
    private readonly database: FakeAssetDatabase,
    private readonly transaction: FakeAssetTransaction
  ) {}

  getKey(assetId: string): IDBRequest<IDBValidKey | undefined> {
    return createRequest<IDBValidKey | undefined>(
      this.database.hasAsset(assetId) ? assetId : undefined
    );
  }

  get(assetId: string): IDBRequest<FakeStoredAssetMetadata | undefined> {
    return createRequest(this.database.getMetadata(assetId));
  }

  index(_name: string): {
    getAll: (range: FakeKeyRange) => IDBRequest<FakeStoredAssetChunk[]>;
  } {
    return {
      getAll: (range: FakeKeyRange) =>
        createRequest(this.database.getChunks(range.value))
    };
  }

  put(value: unknown): void {
    if (this.storeName === 'project_assets') {
      this.database.putMetadata(value as FakeStoredAssetMetadata);
    } else {
      this.database.putChunk(value as FakeStoredAssetChunk);
    }
    this.transaction.completeSoon();
  }

  delete(_key: unknown): void {}
}

class FakeAssetTransaction {
  oncomplete: (() => void) | null = null;

  onerror: (() => void) | null = null;

  error: Error | null = null;

  private completionScheduled = false;

  constructor(private readonly database: FakeAssetDatabase) {}

  objectStore(name: string): FakeAssetObjectStore {
    return new FakeAssetObjectStore(name as FakeStoreName, this.database, this);
  }

  completeSoon(): void {
    if (this.completionScheduled) return;
    this.completionScheduled = true;
    setTimeout(() => this.oncomplete?.(), 0);
  }
}

class FakeAssetDatabase {
  private readonly metadata = new Map<string, FakeStoredAssetMetadata>();

  private readonly chunks = new Map<string, FakeStoredAssetChunk[]>();

  transaction(_storeNames: string[], _mode: string): FakeAssetTransaction {
    return new FakeAssetTransaction(this);
  }

  hasAsset(assetId: string): boolean {
    return this.metadata.has(assetId);
  }

  getMetadata(assetId: string): FakeStoredAssetMetadata | undefined {
    return this.metadata.get(assetId);
  }

  getChunks(assetId: string): FakeStoredAssetChunk[] {
    return this.chunks.get(assetId) ?? [];
  }

  putMetadata(metadata: FakeStoredAssetMetadata): void {
    this.metadata.set(metadata.assetId, metadata);
  }

  putChunk(chunk: FakeStoredAssetChunk): void {
    const chunks = this.chunks.get(chunk.assetId) ?? [];
    this.chunks.set(chunk.assetId, [...chunks, chunk]);
  }

  seedAsset(
    metadata: FakeStoredAssetMetadata,
    chunks: FakeStoredAssetChunk[]
  ): void {
    this.metadata.set(metadata.assetId, metadata);
    this.chunks.set(metadata.assetId, chunks);
  }
}

function createRequest<T>(result: T): IDBRequest<T> {
  const request: {
    result: T;
    error: DOMException | null;
    onsuccess: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
    onerror: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
  } = {
    result: undefined as T,
    error: null,
    onsuccess: null,
    onerror: null
  };

  setTimeout(() => {
    request.result = result;
    request.onsuccess?.call(request as IDBRequest<T>, new Event('success'));
  }, 0);

  return request as IDBRequest<T>;
}

function installIdbKeyRange(): void {
  Object.defineProperty(globalThis, 'IDBKeyRange', {
    configurable: true,
    writable: true,
    value: {
      only: (value: string): FakeKeyRange => ({ value })
    }
  });
}

function setStorageEstimate(quota: number, usage: number): void {
  Object.defineProperty(globalThis.navigator, 'storage', {
    configurable: true,
    value: {
      estimate: vi.fn(async () => ({ quota, usage }))
    }
  });
}

function makeAssetRef(assetId = 'asset-1'): AssetRef {
  return {
    assetId,
    originalName: 'asset.bin',
    mimeType: 'application/octet-stream',
    size: 4,
    kind: 'primary'
  };
}

describe('asset store errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installIdbKeyRange();
    setStorageEstimate(1024, 1024);
  });

  it('throws a typed storage error when browser storage has no headroom', async () => {
    const database = new FakeAssetDatabase();
    mocks.getProjectDatabase.mockResolvedValue(
      database as unknown as IDBDatabase
    );
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])]);
    const ref = makeAssetRef();

    let error: unknown;
    try {
      await persistAssetBlob(blob, ref);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PipelineError);
    expect(error).toMatchObject({
      name: 'PipelineError',
      code: 'PROJECT_ASSET_STORAGE_INSUFFICIENT',
      details: expect.objectContaining({
        assetId: ref.assetId,
        requiredBytes: blob.size
      })
    });
  });

  it('throws a validation error when asset metadata is missing', async () => {
    const database = new FakeAssetDatabase();
    mocks.getProjectDatabase.mockResolvedValue(
      database as unknown as IDBDatabase
    );

    let error: unknown;
    try {
      await readAssetBytes('missing-asset');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(DataValidationError);
    expect(error).toMatchObject({
      name: 'DataValidationError',
      field: 'assetId',
      details: expect.objectContaining({
        field: 'assetId',
        assetId: 'missing-asset'
      })
    });
  });

  it('throws a validation error when asset chunks are incomplete', async () => {
    const database = new FakeAssetDatabase();
    const assetId = 'asset-2';
    database.seedAsset(
      {
        assetId,
        mimeType: 'application/octet-stream',
        size: 4,
        chunkCount: 2,
        chunkSize: 2,
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
      },
      [
        {
          assetId,
          chunkIndex: 0,
          data: new Uint8Array([1, 2]).buffer
        }
      ]
    );
    mocks.getProjectDatabase.mockResolvedValue(
      database as unknown as IDBDatabase
    );

    let error: unknown;
    try {
      await readAssetBytes(assetId);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(DataValidationError);
    expect(error).toMatchObject({
      name: 'DataValidationError',
      field: 'chunks',
      details: expect.objectContaining({
        field: 'chunks',
        assetId,
        expectedChunks: 2,
        actualChunks: 1
      })
    });
  });

  it('should persist an extracted archive layer as a GeoJSON asset', async () => {
    const database = new FakeAssetDatabase();
    mocks.getProjectDatabase.mockResolvedValue(
      database as unknown as IDBDatabase
    );
    setStorageEstimate(100 * 1024 * 1024, 0);
    const preparedGeoJSON = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [2.3, 48.8] },
          properties: { name: 'Paris' }
        }
      ]
    });

    const preparedFile = await ensureUploadedFileAssets({
      id: 'cities',
      name: 'cities-points',
      size: 256,
      type: 'application/zip',
      fileType: FileType.SHAPEFILE,
      status: FileStatus.COMPLETE,
      sourceType: DataSourceType.FILE_UPLOAD,
      sourceArchive: 'two-shapefiles.zip',
      preparedGeoJSON,
      originalFile: new File([new Uint8Array([1, 2, 3])], 'archive.zip', {
        type: 'application/zip'
      })
    });

    expect(preparedFile.assetRef).toMatchObject({
      originalName: 'cities-points.geojson',
      mimeType: 'application/geo+json',
      size: new Blob([preparedGeoJSON]).size,
      kind: 'primary'
    });

    if (!preparedFile.assetRef) {
      throw new Error('Expected the archive snapshot asset to be persisted');
    }

    const restoredFile = await createFileFromAssetRef(preparedFile.assetRef);
    expect(restoredFile.name).toBe('cities-points.geojson');
    expect(restoredFile.type).toBe('application/geo+json');
    expect(await restoredFile.text()).toBe(preparedGeoJSON);
  });
});
