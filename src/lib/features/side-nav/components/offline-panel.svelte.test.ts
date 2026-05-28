import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({
  buildEssentialDownloadEntriesMock: vi.fn(),
  buildExtendedDownloadEntriesMock: vi.fn(),
  prepareBasemapForOfflineMock: vi.fn(),
  cacheUrlsForOfflineMock: vi.fn(),
  refreshStorageEstimateMock: vi.fn().mockResolvedValue(undefined),
  refreshCachedBasemapsMock: vi.fn().mockResolvedValue(undefined),
  setBasemapStatusMock: vi.fn(),
  clearOfflineCacheMock: vi.fn(),
  basemapsMap: new Map<string, { status: string; progress: number }>()
}));

vi.mock('$lib/features/commons/stores/global.svelte', () => {
  const state = { isOfflinePanelOpen: true };
  return {
    globalState: {
      get isOfflinePanelOpen() {
        return state.isOfflinePanelOpen;
      },
      set isOfflinePanelOpen(value: boolean) {
        state.isOfflinePanelOpen = value;
      }
    }
  };
});

vi.mock('$lib/features/commons/stores/connectivity.store.svelte', () => ({
  connectivityStore: {
    get isOnline() {
      return true;
    },
    get isSlowConnection() {
      return false;
    },
    get storage() {
      return { usage: 1_000_000, quota: 10_000_000, ratio: 0.1 };
    },
    get warmupPhase() {
      return 'idle' as const;
    },
    get quotaExceeded() {
      return false;
    },
    get basemaps() {
      return mocks.basemapsMap;
    },
    get cachedBasemapCount() {
      return 0;
    },
    refreshStorageEstimate: () => mocks.refreshStorageEstimateMock(),
    refreshCachedBasemaps: () => mocks.refreshCachedBasemapsMock(),
    setBasemapStatus: (...args: unknown[]) =>
      mocks.setBasemapStatusMock(...args),
    setWarmupPhase: vi.fn(),
    setQuotaExceeded: vi.fn(),
    handleSwMessage: vi.fn(),
    clearOfflineCache: (...args: unknown[]) =>
      mocks.clearOfflineCacheMock(...args),
    reset: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/offline-basemap-sets', () => ({
  buildEssentialDownloadEntries: () =>
    mocks.buildEssentialDownloadEntriesMock(),
  buildExtendedDownloadEntries: () => mocks.buildExtendedDownloadEntriesMock(),
  classifyBasemapRegion: (id: string) => {
    if (id.startsWith('france-')) return 'france';
    if (id.startsWith('europe-')) return 'europe';
    if (id.startsWith('monde-')) return 'monde';
    return 'autre';
  }
}));

vi.mock('$lib/features/commons/utils/pwa-offline', () => ({
  cacheUrlsForOffline: (...args: unknown[]) =>
    mocks.cacheUrlsForOfflineMock(...args),
  prepareBasemapForOffline: (...args: unknown[]) =>
    mocks.prepareBasemapForOfflineMock(...args)
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

describe('OfflinePanel', () => {
  beforeEach(() => {
    mocks.buildEssentialDownloadEntriesMock.mockResolvedValue([
      {
        basemapId: 'monde-countries-2024-low',
        title: 'Monde',
        files: [],
        urls: []
      }
    ]);
    mocks.buildExtendedDownloadEntriesMock.mockResolvedValue([
      {
        basemapId: 'monde-countries-2024-low',
        title: 'Monde',
        files: [],
        urls: []
      },
      {
        basemapId: 'france-departement-2025-medium',
        title: 'France',
        files: [],
        urls: []
      }
    ]);
    mocks.prepareBasemapForOfflineMock.mockResolvedValue({
      status: 'unsupported'
    });
    mocks.cacheUrlsForOfflineMock.mockResolvedValue({
      status: 'cached',
      bytes: 0
    });
    mocks.basemapsMap.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render when globalState.isOfflinePanelOpen is true', async () => {
    const Component = (await import('./offline-panel.svelte')).default;
    render(Component);

    await waitFor(() => {
      expect(screen.getByText('Accès hors ligne')).toBeTruthy();
    });
  });

  it('should expose the primary "Tout télécharger" action', async () => {
    const Component = (await import('./offline-panel.svelte')).default;
    render(Component);

    await waitFor(() => {
      expect(screen.getByTestId('offline-download-all')).toBeTruthy();
      expect(screen.getByText('Tout télécharger')).toBeTruthy();
    });
  });

  it('should not expose application update controls inside offline access', async () => {
    const Component = (await import('./offline-panel.svelte')).default;
    render(Component);

    await waitFor(() => {
      expect(screen.getByTestId('offline-download-all')).toBeTruthy();
    });

    expect(screen.queryByTestId('offline-factory-reset-btn')).toBeNull();
    expect(screen.queryByText('Mettre à jour Khartis')).toBeNull();
  });

  it('should not expose one-by-one download buttons in the list', async () => {
    const Component = (await import('./offline-panel.svelte')).default;
    render(Component);

    await waitFor(() => {
      expect(screen.getByText('Fonds de carte')).toBeTruthy();
    });

    expect(screen.queryByTestId('offline-row-download')).toBeNull();
  });

  it('should download every listed basemap through the primary action', async () => {
    const Component = (await import('./offline-panel.svelte')).default;
    render(Component);

    await waitFor(() => {
      expect(screen.getByTestId('offline-download-all')).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId('offline-download-all'));

    await waitFor(() => {
      expect(mocks.prepareBasemapForOfflineMock).toHaveBeenCalledTimes(2);
      expect(mocks.cacheUrlsForOfflineMock).toHaveBeenCalledWith(
        'basemaps-data',
        [],
        expect.any(AbortSignal)
      );
      expect(mocks.setBasemapStatusMock).toHaveBeenCalledWith(
        'monde-countries-2024-low',
        'cached',
        1,
        0
      );
      expect(mocks.setBasemapStatusMock).toHaveBeenCalledWith(
        'france-departement-2025-medium',
        'cached',
        1,
        0
      );
    });
  });
});
