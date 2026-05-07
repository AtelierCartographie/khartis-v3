import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectivityStore,
  type ConnectivityStore
} from './connectivity.store.svelte';

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: { SYSTEM: 'SYSTEM' },
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

describe('connectivityStore', () => {
  let store: ConnectivityStore;

  beforeEach(() => {
    store = connectivityStore;
    store.reset();
  });

  afterEach(() => {
    store.reset();
  });

  describe('online/offline reactivity', () => {
    it('should reflect navigator.onLine on initial read', () => {
      expect(store.isOnline).toBe(navigator.onLine !== false);
    });

    it('should update isOnline when window emits online event', () => {
      window.dispatchEvent(new Event('offline'));
      expect(store.isOnline).toBe(false);

      window.dispatchEvent(new Event('online'));
      expect(store.isOnline).toBe(true);
    });
  });

  describe('storage estimate', () => {
    it('should populate storage snapshot when navigator.storage.estimate resolves', async () => {
      const estimateMock = vi.fn().mockResolvedValue({
        usage: 50_000_000,
        quota: 200_000_000
      });

      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: { estimate: estimateMock }
      });

      await store.refreshStorageEstimate();

      expect(store.storage).toEqual({
        usage: 50_000_000,
        quota: 200_000_000,
        ratio: 0.25
      });
    });

    it('should handle missing navigator.storage gracefully', async () => {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: undefined
      });

      await store.refreshStorageEstimate();
      expect(store.storage).toBeNull();
    });
  });

  describe('basemap status', () => {
    it('should set and read basemap status', () => {
      store.setBasemapStatus('europe-nuts2-2024-low', 'downloading', 0.5);
      const entry = store.basemaps.get('europe-nuts2-2024-low');
      expect(entry).toEqual({
        id: 'europe-nuts2-2024-low',
        status: 'downloading',
        progress: 0.5,
        bytes: undefined
      });
    });

    it('should preserve bytes when only updating status', () => {
      store.setBasemapStatus('id1', 'downloading', 0.3, 12345);
      store.setBasemapStatus('id1', 'cached', 1);
      expect(store.basemaps.get('id1')?.bytes).toBe(12345);
    });

    it('should count cached basemaps', () => {
      store.setBasemapStatus('a', 'cached', 1);
      store.setBasemapStatus('b', 'cached', 1);
      store.setBasemapStatus('c', 'downloading', 0.5);
      expect(store.cachedBasemapCount).toBe(2);
    });
  });

  describe('handleSwMessage', () => {
    it('should mark basemap as cached on BG_FETCH_DONE', () => {
      store.handleSwMessage({
        type: 'BG_FETCH_DONE',
        basemapId: 'monde-countries-2024-low',
        bytes: 1_400_000
      });

      const entry = store.basemaps.get('monde-countries-2024-low');
      expect(entry?.status).toBe('cached');
      expect(entry?.bytes).toBe(1_400_000);
    });

    it('should update progress on BG_FETCH_PROGRESS', () => {
      store.handleSwMessage({
        type: 'BG_FETCH_PROGRESS',
        basemapId: 'foo',
        downloaded: 500,
        downloadTotal: 1000,
        progress: 0.5
      });

      expect(store.basemaps.get('foo')?.status).toBe('downloading');
      expect(store.basemaps.get('foo')?.progress).toBe(0.5);
    });

    it('should mark basemap as failed on BG_FETCH_FAIL', () => {
      store.setBasemapStatus('bar', 'downloading', 0.3);
      store.handleSwMessage({
        type: 'BG_FETCH_FAIL',
        basemapId: 'bar',
        reason: 'network error'
      });
      expect(store.basemaps.get('bar')?.status).toBe('failed');
    });

    it('should evict cached entries on CACHE_CLEARED with scope=basemaps', () => {
      store.setBasemapStatus('a', 'cached', 1);
      store.setBasemapStatus('b', 'cached', 1);

      store.handleSwMessage({
        type: 'CACHE_CLEARED',
        scope: 'basemaps',
        cleared: ['basemaps-data']
      });

      expect(store.basemaps.get('a')?.status).toBe('evicted');
      expect(store.basemaps.get('b')?.status).toBe('evicted');
    });

    it('should set quotaExceeded on QUOTA_EXCEEDED', () => {
      store.handleSwMessage({
        type: 'QUOTA_EXCEEDED',
        cacheName: 'basemaps-data'
      });
      expect(store.quotaExceeded).toBe(true);
    });
  });

  describe('warmupPhase', () => {
    it('should be idle by default', () => {
      expect(store.warmupPhase).toBe('idle');
    });

    it('should accept phase transitions', () => {
      store.setWarmupPhase('A');
      expect(store.warmupPhase).toBe('A');

      store.setWarmupPhase('A-done');
      expect(store.warmupPhase).toBe('A-done');

      store.setWarmupPhase('B');
      expect(store.warmupPhase).toBe('B');
    });
  });
});
