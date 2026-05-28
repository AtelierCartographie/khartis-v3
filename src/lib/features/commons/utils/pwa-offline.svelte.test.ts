import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPwaResetUrl,
  cacheUrlsForOffline,
  isBackgroundFetchSupported,
  isOnSlowConnection,
  isPeriodicSyncSupported,
  prepareBasemapForOffline
} from './pwa-offline';

interface ConnectionShape {
  saveData?: boolean;
  effectiveType?: string;
}

const navigatorWithConnection = navigator as Navigator & {
  connection?: ConnectionShape;
};

describe('pwa-offline capability detection', () => {
  it('reports background fetch as unsupported in jsdom', () => {
    expect(isBackgroundFetchSupported()).toBe(false);
  });

  it('reports periodic sync as unsupported in jsdom', () => {
    expect(isPeriodicSyncSupported()).toBe(false);
  });

  it('returns false for slow connection without Network Information API', () => {
    expect(isOnSlowConnection()).toBe(false);
  });
});

describe('buildPwaResetUrl', () => {
  it('adds the reset query parameter while preserving path, search and hash', () => {
    expect(
      buildPwaResetUrl('https://example.test/cartographie/?lang=fr#map')
    ).toBe('/cartographie/?lang=fr&reset=1#map');
  });

  it('replaces an existing reset query parameter', () => {
    expect(buildPwaResetUrl('https://example.test/app?reset=0')).toBe(
      '/app?reset=1'
    );
  });
});

describe('cacheUrlsForOffline', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes successful responses into the requested cache', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn().mockResolvedValue({ put });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('ok', {
        status: 200,
        headers: { 'content-length': '2' }
      })
    );

    vi.stubGlobal('caches', { open });
    vi.stubGlobal('fetch', fetchMock);

    const result = await cacheUrlsForOffline('basemaps-data', ['/a.parquet']);

    expect(result).toEqual({ status: 'cached', bytes: 2 });
    expect(open).toHaveBeenCalledWith('basemaps-data');
    expect(fetchMock).toHaveBeenCalledWith('/a.parquet', { signal: undefined });
    expect(put).toHaveBeenCalledOnce();
  });

  it('reports unsupported when Cache Storage is unavailable', async () => {
    vi.stubGlobal('caches', undefined);

    await expect(cacheUrlsForOffline('basemaps-data', [])).resolves.toEqual({
      status: 'unsupported',
      bytes: 0
    });
  });
});

describe('isOnSlowConnection with mocked connection', () => {
  let originalConnection: ConnectionShape | undefined;

  beforeEach(() => {
    originalConnection = navigatorWithConnection.connection;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: originalConnection
    });
  });

  it('detects saveData', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true, effectiveType: '4g' }
    });
    expect(isOnSlowConnection()).toBe(true);
  });

  it('detects 2g effective type', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: false, effectiveType: '2g' }
    });
    expect(isOnSlowConnection()).toBe(true);
  });

  it('treats 4g as fast', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: false, effectiveType: '4g' }
    });
    expect(isOnSlowConnection()).toBe(false);
  });
});

describe('prepareBasemapForOffline', () => {
  it('returns unsupported when no service worker registration is available', async () => {
    const original = navigator.serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined
    });
    try {
      const result = await prepareBasemapForOffline({
        basemapId: 'test',
        urls: ['/foo.parquet'],
        title: 'Test'
      });
      expect(result.status).toBe('unsupported');
    } finally {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: original
      });
    }
  });

  it('returns unsupported when registration has no backgroundFetch', async () => {
    const fakeRegistration = {} as ServiceWorkerRegistration;
    const fakeReady = Promise.resolve(fakeRegistration);
    const original = navigator.serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: fakeReady }
    });
    try {
      const result = await prepareBasemapForOffline({
        basemapId: 'test',
        urls: ['/foo.parquet'],
        title: 'Test'
      });
      expect(result.status).toBe('unsupported');
    } finally {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: original
      });
    }
  });

  it('starts a background fetch when supported', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ id: 'khartis-basemap-test' });
    const fakeRegistration = {
      backgroundFetch: {
        fetch: fetchSpy,
        get: vi.fn().mockResolvedValue(null),
        getIds: vi.fn().mockResolvedValue([])
      }
    } as unknown as ServiceWorkerRegistration;
    const original = navigator.serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(fakeRegistration) }
    });
    try {
      const result = await prepareBasemapForOffline({
        basemapId: 'test',
        urls: ['/a.parquet', '/b.parquet'],
        title: 'Carte test'
      });
      expect(result.status).toBe('started');
      expect(fetchSpy).toHaveBeenCalledWith(
        'khartis-basemap-test',
        ['/a.parquet', '/b.parquet'],
        expect.objectContaining({ title: 'Carte test' })
      );
    } finally {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: original
      });
    }
  });
});
