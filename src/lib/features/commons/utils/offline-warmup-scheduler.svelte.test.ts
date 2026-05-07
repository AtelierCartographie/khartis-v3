import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepareBasemapForOfflineMock: vi.fn(),
  ensurePeriodicBasemapRevalidationMock: vi.fn(),
  isOnSlowConnectionMock: vi.fn(),
  buildEssentialDownloadEntriesMock: vi.fn(),
  buildExtendedDownloadEntriesMock: vi.fn(),
  resolveStaticAssetUrlMock: vi.fn((path: string) => `http://test${path}`)
}));

vi.mock('$lib/features/commons/utils/pwa-offline', () => ({
  prepareBasemapForOffline: (...args: unknown[]) =>
    mocks.prepareBasemapForOfflineMock(...args),
  ensurePeriodicBasemapRevalidation: () =>
    mocks.ensurePeriodicBasemapRevalidationMock(),
  isOnSlowConnection: () => mocks.isOnSlowConnectionMock()
}));

vi.mock('$lib/features/commons/utils/static-asset-url', () => ({
  resolveStaticAssetUrl: (path: string) => mocks.resolveStaticAssetUrlMock(path)
}));

vi.mock('$lib/features/commons/utils/offline-basemap-sets', () => ({
  buildEssentialDownloadEntries: () =>
    mocks.buildEssentialDownloadEntriesMock(),
  buildExtendedDownloadEntries: () => mocks.buildExtendedDownloadEntriesMock()
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: { SYSTEM: 'SYSTEM' },
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}));

interface FakeStore {
  warmupPhase: string;
  basemapStatuses: Map<string, { status: string; progress: number }>;
  setWarmupPhase: ReturnType<typeof vi.fn>;
  setBasemapStatus: ReturnType<typeof vi.fn>;
}

function createFakeStore(): FakeStore {
  const basemapStatuses = new Map<
    string,
    { status: string; progress: number }
  >();
  const store: FakeStore = {
    warmupPhase: 'idle',
    basemapStatuses,
    setWarmupPhase: vi.fn((phase: string) => {
      store.warmupPhase = phase;
    }),
    setBasemapStatus: vi.fn((id: string, status: string, progress = 0) => {
      basemapStatuses.set(id, { status, progress });
    })
  };
  return store;
}

const ESSENTIAL_FIXTURE = [
  {
    basemapId: 'monde-countries-2024-low',
    title: 'Monde',
    files: ['monde-countries-2024-low'],
    urls: ['http://test/basemaps/geometry/monde-countries-2024-low.parquet']
  },
  {
    basemapId: 'europe-nuts2-2024-low',
    title: 'Europe',
    files: ['europe-nuts2-2024-low'],
    urls: ['http://test/basemaps/geometry/europe-nuts2-2024-low.parquet']
  }
];

async function loadModule() {
  vi.resetModules();
  const mod = await import('./offline-warmup-scheduler');
  mod._resetWarmupRunningForTests();
  return mod;
}

describe('offline-warmup-scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true
    });
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => '0' }
      })
    });
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      cb();
      return 1;
    });
    mocks.isOnSlowConnectionMock.mockReturnValue(false);
    mocks.buildEssentialDownloadEntriesMock.mockResolvedValue(
      ESSENTIAL_FIXTURE
    );
    mocks.buildExtendedDownloadEntriesMock.mockResolvedValue(ESSENTIAL_FIXTURE);
    mocks.prepareBasemapForOfflineMock.mockResolvedValue({
      status: 'started'
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('shouldSkipWarmup', () => {
    it('should return true when navigator is offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: false
      });
      const mod = await loadModule();
      expect(mod.shouldSkipWarmup()).toBe(true);
    });

    it('should return true when on slow connection', async () => {
      mocks.isOnSlowConnectionMock.mockReturnValue(true);
      const mod = await loadModule();
      expect(mod.shouldSkipWarmup()).toBe(true);
    });

    it('should return true when user disabled offline downloads', async () => {
      const mod = await loadModule();
      mod.setOfflineDownloadsDisabled(true);
      expect(mod.shouldSkipWarmup()).toBe(true);
      mod.setOfflineDownloadsDisabled(false);
    });

    it('should return false on normal online connection', async () => {
      const mod = await loadModule();
      expect(mod.shouldSkipWarmup()).toBe(false);
    });
  });

  describe('startProgressiveWarmup', () => {
    it('should set warmupPhase to disabled when shouldSkipWarmup is true', async () => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: false
      });
      const mod = await loadModule();
      const store = createFakeStore();
      const controller = new AbortController();

      mod.startProgressiveWarmup({
        store: store as never,
        signal: controller.signal
      });

      expect(store.warmupPhase).toBe('disabled');
    });

    it('should run phase A then transition to A-done', async () => {
      const mod = await loadModule();
      const store = createFakeStore();
      const controller = new AbortController();

      mod.startProgressiveWarmup({
        store: store as never,
        signal: controller.signal
      });

      await vi.advanceTimersByTimeAsync(0);

      const phaseSequence = store.setWarmupPhase.mock.calls.map(
        (c: unknown[]) => c[0] as string
      );
      expect(phaseSequence).toContain('A');
      expect(phaseSequence).toContain('A-done');
    });

    it('should call prepareBasemapForOffline for each essential after delay', async () => {
      const mod = await loadModule();
      const store = createFakeStore();
      const controller = new AbortController();

      mod.startProgressiveWarmup({
        store: store as never,
        signal: controller.signal
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.runOnlyPendingTimersAsync();

      expect(mocks.prepareBasemapForOfflineMock).toHaveBeenCalledTimes(
        ESSENTIAL_FIXTURE.length
      );

      const calledIds = mocks.prepareBasemapForOfflineMock.mock.calls.map(
        (c) => (c[0] as { basemapId: string }).basemapId
      );
      expect(calledIds).toContain('monde-countries-2024-low');
      expect(calledIds).toContain('europe-nuts2-2024-low');
    });

    it('should fall back to fetch when Background Fetch is unsupported', async () => {
      mocks.prepareBasemapForOfflineMock.mockResolvedValue({
        status: 'unsupported'
      });
      const mod = await loadModule();
      const store = createFakeStore();
      const controller = new AbortController();

      mod.startProgressiveWarmup({
        store: store as never,
        signal: controller.signal
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.runOnlyPendingTimersAsync();

      expect(global.fetch).toHaveBeenCalled();
    });

    it('should respect abort signal during phase A', async () => {
      const mod = await loadModule();
      const store = createFakeStore();
      const controller = new AbortController();

      mod.startProgressiveWarmup({
        store: store as never,
        signal: controller.signal
      });

      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(5_000);

      expect(mocks.prepareBasemapForOfflineMock).not.toHaveBeenCalled();
    });
  });

  describe('startExtendedWarmup', () => {
    it('should download every non-essential extended entry', async () => {
      mocks.buildExtendedDownloadEntriesMock.mockResolvedValue([
        ...ESSENTIAL_FIXTURE,
        {
          basemapId: 'france-departement-2025-medium',
          title: 'France',
          files: ['france-departement-2025-medium'],
          urls: ['http://test/d.parquet']
        }
      ]);
      const mod = await loadModule();
      const store = createFakeStore();
      const controller = new AbortController();

      const promise = mod.startExtendedWarmup({
        store: store as never,
        signal: controller.signal
      });
      await vi.runAllTimersAsync();
      await promise;

      const calledIds = mocks.prepareBasemapForOfflineMock.mock.calls.map(
        (c) => (c[0] as { basemapId: string }).basemapId
      );
      expect(calledIds).toContain('france-departement-2025-medium');
      expect(calledIds).not.toContain('monde-countries-2024-low');
    });

    it('should skip when shouldSkipWarmup is true', async () => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: false
      });
      const mod = await loadModule();
      const store = createFakeStore();
      const controller = new AbortController();

      await mod.startExtendedWarmup({
        store: store as never,
        signal: controller.signal
      });

      expect(mocks.prepareBasemapForOfflineMock).not.toHaveBeenCalled();
    });
  });

  describe('user-disabled flag', () => {
    it('should persist the disabled flag in localStorage', async () => {
      const mod = await loadModule();
      mod.setOfflineDownloadsDisabled(true);
      expect(mod.areOfflineDownloadsDisabled()).toBe(true);
      mod.setOfflineDownloadsDisabled(false);
      expect(mod.areOfflineDownloadsDisabled()).toBe(false);
    });
  });
});
