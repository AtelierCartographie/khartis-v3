import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
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
