import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_CONST } from '../constants';

const METADATA_KEY = 'khartis_projects_metadata';
const CURRENT_KEY = 'khartis_current_project';

const mocks = vi.hoisted(() => ({
  localforageGetItem: vi.fn<(key: string) => Promise<string | null>>(),
  localforageRemoveItem: vi.fn<(key: string) => Promise<void>>(),
  ensureUploadedFileAssets: vi.fn(),
  removeProjectAssetRefs: vi.fn(),
  syncProjectAssetRefs: vi.fn(),
  prepareForIndexedDB: vi.fn(),
  registerAssetStores: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('localforage', () => ({
  default: {
    getItem: mocks.localforageGetItem,
    removeItem: mocks.localforageRemoveItem
  }
}));

vi.mock('./asset-store.service', () => ({
  ensureUploadedFileAssets: mocks.ensureUploadedFileAssets,
  registerAssetStores: mocks.registerAssetStores,
  removeProjectAssetRefs: mocks.removeProjectAssetRefs,
  syncProjectAssetRefs: mocks.syncProjectAssetRefs
}));

vi.mock('./serializer.service', () => ({
  deserialize: vi.fn(),
  prepareForIndexedDB: mocks.prepareForIndexedDB
}));

vi.mock('../core/schema-migration', () => ({
  assertCurrentProjectSchema: vi.fn(),
  migrateIfNeeded: vi.fn((value: unknown) => value)
}));

vi.mock('$lib/features/commons/utils/size-estimation.utils', () => ({
  estimateProjectStorageSize: vi.fn(() => 0)
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  },
  LogCategory: {
    PERSISTENCE: 'PERSISTENCE'
  }
}));

interface FakeStoreData {
  keyPath: string;
  records: Map<string, Record<string, unknown>>;
}

class FakeObjectStore {
  constructor(
    private readonly store: FakeStoreData,
    private readonly scheduleComplete: () => void
  ) {}

  createIndex(): void {}

  put(value: Record<string, unknown>): void {
    const key = String(value[this.store.keyPath]);
    this.store.records.set(key, structuredClone(value));
    this.scheduleComplete();
  }

  get(key: string) {
    return createRequest(this.store.records.get(key));
  }

  delete(key: string): void {
    this.store.records.delete(key);
    this.scheduleComplete();
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;

  onerror: (() => void) | null = null;

  error: Error | null = null;

  private completionQueued = false;

  constructor(
    private readonly stores: Map<string, FakeStoreData>,
    private readonly transactionError: Error | null = null
  ) {}

  objectStore(name: string): FakeObjectStore {
    const store = this.stores.get(name);
    if (!store) {
      throw new Error(`Missing fake store: ${name}`);
    }

    return new FakeObjectStore(store, () => this.queueComplete());
  }

  private queueComplete(): void {
    if (this.completionQueued) {
      return;
    }

    this.completionQueued = true;
    setTimeout(() => {
      if (this.transactionError) {
        this.error = this.transactionError;
        this.onerror?.();
        return;
      }
      this.oncomplete?.();
    }, 0);
  }
}

class FakeDatabase {
  private readonly stores = new Map<string, FakeStoreData>();

  private readonly transactionErrors: Error[] = [];

  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name)
  };

  createObjectStore(name: string, options: { keyPath: string }) {
    if (!this.stores.has(name)) {
      this.stores.set(name, {
        keyPath: options.keyPath,
        records: new Map()
      });
    }

    return {
      createIndex: vi.fn()
    };
  }

  transaction(_storeNames: string[], _mode: string): FakeTransaction {
    return new FakeTransaction(
      this.stores,
      this.transactionErrors.shift() ?? null
    );
  }

  failNextTransaction(error: Error): void {
    this.transactionErrors.push(error);
  }

  seedStore(
    name: string,
    keyPath: string,
    values: Record<string, unknown>[]
  ): void {
    this.createObjectStore(name, { keyPath });
    const store = this.stores.get(name);
    if (!store) {
      throw new Error(`Missing fake store after seed: ${name}`);
    }

    values.forEach((value) => {
      store.records.set(String(value[keyPath]), structuredClone(value));
    });
  }
}

function createRequest(result: unknown) {
  const request: {
    result: unknown;
    error: Error | null;
    onsuccess: (() => void) | null;
    onerror: (() => void) | null;
  } = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null
  };

  setTimeout(() => {
    request.result = result;
    request.onsuccess?.();
  }, 0);

  return request;
}

function installFakeIndexedDb(database: FakeDatabase): void {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: {
      open: vi.fn(() => {
        const request: {
          result: FakeDatabase;
          error: Error | null;
          onsuccess: (() => void) | null;
          onerror: (() => void) | null;
          onupgradeneeded:
            ((event: { target: { result: FakeDatabase } }) => void) | null;
        } = {
          result: database,
          error: null,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null
        };

        setTimeout(() => {
          request.onupgradeneeded?.({ target: { result: database } });
          setTimeout(() => {
            request.onsuccess?.();
          }, 0);
        }, 0);

        return request;
      })
    }
  });
}

function createMetadataEntry(id: string, name: string) {
  return {
    id,
    name,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-02T00:00:00.000Z').toISOString(),
    size: 128
  };
}

describe('project persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.localforageGetItem.mockResolvedValue(null);
    mocks.localforageRemoveItem.mockResolvedValue();
    mocks.ensureUploadedFileAssets.mockImplementation(async (file) => file);
    mocks.removeProjectAssetRefs.mockResolvedValue(undefined);
    mocks.syncProjectAssetRefs.mockResolvedValue(undefined);
    mocks.prepareForIndexedDB.mockImplementation(async (project) => project);
  });

  it('saves an asset-prepared copy without mutating the live project', async () => {
    const database = new FakeDatabase();
    installFakeIndexedDb(database);

    const sourceFile = {
      id: 'file-1',
      name: 'data.csv',
      size: 4,
      type: 'text/csv',
      fileType: 'csv',
      status: 'complete',
      sourceType: 'file_upload'
    };
    const preparedFile = {
      ...sourceFile,
      assetRef: {
        assetId: 'asset-1',
        originalName: 'data.csv',
        mimeType: 'text/csv',
        size: 4,
        kind: 'primary' as const
      }
    };
    const project = {
      id: 'project-1',
      manifest: {
        version: PROJECT_CONST.SCHEMA_VERSION,
        createdAt: new Date('2026-04-16T00:00:00.000Z'),
        updatedAt: new Date('2026-04-16T00:00:00.000Z'),
        name: 'Save Project',
        format: 'kh' as const
      },
      data: {
        sourceFiles: [sourceFile]
      }
    };
    mocks.ensureUploadedFileAssets.mockResolvedValue(preparedFile);

    const { saveProject } = await import('./persistence.service');
    await saveProject(project as never);

    const storedProject = mocks.prepareForIndexedDB.mock.calls[0]?.[0] as {
      manifest: { version: string };
      data: { sourceFiles: unknown[] };
    };

    expect(project.manifest.version).toBe(PROJECT_CONST.SCHEMA_VERSION);
    expect(project.data.sourceFiles[0]).toBe(sourceFile);
    expect(project.data.sourceFiles[0]).not.toHaveProperty('assetRef');
    expect(storedProject).not.toBe(project);
    expect(storedProject.manifest.version).toBe(PROJECT_CONST.SCHEMA_VERSION);
    expect(storedProject.data.sourceFiles).toEqual([preparedFile]);
    expect(storedProject.data.sourceFiles).not.toBe(project.data.sourceFiles);
    expect(mocks.syncProjectAssetRefs).toHaveBeenCalledWith('project-1', [
      preparedFile
    ]);
  });

  it('waits for legacy metadata migration before listing saved projects', async () => {
    const database = new FakeDatabase();
    installFakeIndexedDb(database);

    const legacyMetadata = [createMetadataEntry('legacy-project', 'Legacy')];
    mocks.localforageGetItem.mockImplementation(async (key: string) => {
      if (key !== METADATA_KEY) {
        return null;
      }

      await new Promise((resolve) => setTimeout(resolve, 5));
      return JSON.stringify(legacyMetadata);
    });

    const { openDatabase, listMetadata } =
      await import('./persistence.service');

    await openDatabase();

    const metadata = await listMetadata();

    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.id).toBe('legacy-project');
    expect(mocks.localforageRemoveItem).toHaveBeenCalledWith(METADATA_KEY);
  });

  it('does not overwrite IndexedDB metadata with stale localforage values', async () => {
    const database = new FakeDatabase();
    database.seedStore('metadata', 'key', [
      {
        key: METADATA_KEY,
        value: JSON.stringify([createMetadataEntry('fresh-project', 'Fresh')])
      }
    ]);
    installFakeIndexedDb(database);

    mocks.localforageGetItem.mockImplementation(async (key: string) => {
      if (key !== METADATA_KEY) {
        return null;
      }

      return JSON.stringify([createMetadataEntry('stale-project', 'Stale')]);
    });

    const { openDatabase, listMetadata } =
      await import('./persistence.service');

    await openDatabase();

    const metadata = await listMetadata();

    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.id).toBe('fresh-project');
    expect(mocks.localforageRemoveItem).toHaveBeenCalledWith(METADATA_KEY);
  });

  it('keeps project storage reads working without a persistence-storage import cycle', async () => {
    const database = new FakeDatabase();
    database.seedStore('metadata', 'key', [
      {
        key: CURRENT_KEY,
        value: JSON.stringify('current-project')
      }
    ]);
    installFakeIndexedDb(database);

    await import('./persistence.service');
    const { projectStorage } = await import('./storage.service');

    await expect(projectStorage.load<string>(CURRENT_KEY)).resolves.toBe(
      'current-project'
    );
    expect(mocks.loggerWarn).not.toHaveBeenCalledWith(
      'Failed to load project storage entry',
      expect.anything(),
      expect.objectContaining({ key: CURRENT_KEY })
    );
  });

  it('throws a typed quota error when project storage save exceeds browser quota', async () => {
    const database = new FakeDatabase();
    installFakeIndexedDb(database);
    const quotaError = new Error('Quota exceeded');
    quotaError.name = 'QuotaExceededError';
    database.failNextTransaction(quotaError);

    const { projectStorage } = await import('./storage.service');

    let error: unknown;
    try {
      await projectStorage.save(CURRENT_KEY, 'current-project');
    } catch (caught) {
      error = caught;
    }

    const { PipelineError } =
      await import('$lib/features/commons/pipeline.errors');

    expect(error).toBeInstanceOf(PipelineError);
    expect(error).toMatchObject({
      name: 'PipelineError',
      code: 'PROJECT_STORAGE_QUOTA_EXCEEDED',
      details: expect.objectContaining({
        key: CURRENT_KEY,
        cause: quotaError
      })
    });
  });
});
