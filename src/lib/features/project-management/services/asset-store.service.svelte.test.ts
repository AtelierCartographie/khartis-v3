import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetRef } from '$lib/features/commons/types/create-project.types';
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

const { persistAssetBlob, readAssetBytes } =
  await import('./asset-store.service');

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
    private readonly database: FakeAssetDatabase
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

  put(_value: unknown): void {}

  delete(_key: unknown): void {}
}

class FakeAssetTransaction {
  oncomplete: (() => void) | null = null;

  onerror: (() => void) | null = null;

  error: Error | null = null;

  constructor(private readonly database: FakeAssetDatabase) {}

  objectStore(name: string): FakeAssetObjectStore {
    return new FakeAssetObjectStore(name as FakeStoreName, this.database);
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
});
