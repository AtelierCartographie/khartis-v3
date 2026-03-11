import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MapStorageKey } from '$lib/features/map/constants/map.constants';
import { useMapPosition } from '$lib/features/map/hooks/use-map-position.svelte';

type LocalStorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function createLocalStorageMock(): LocalStorageMock {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
}

describe('useMapPosition', () => {
  beforeEach(() => {
    const localStorageMock = createLocalStorageMock();

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {}
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: localStorageMock
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('restores saved positions when longitude and latitude are zero', () => {
    const setCenter = vi.fn();
    const setZoom = vi.fn();

    localStorage.setItem(
      MapStorageKey.MAP_CENTER,
      JSON.stringify({ lng: 0, lat: 0 })
    );
    localStorage.setItem(MapStorageKey.MAP_ZOOM, '2.5');

    const mapPosition = useMapPosition({
      getMap: () =>
        ({
          getCenter: vi.fn(),
          getZoom: vi.fn(),
          setCenter,
          setZoom
        }) as never,
      getIsMapLoaded: () => true
    });

    expect(mapPosition.getSavedPosition()).toEqual({
      center: { lng: 0, lat: 0 },
      zoom: 2.5
    });

    mapPosition.restorePosition();

    expect(setCenter).toHaveBeenCalledWith([0, 0]);
    expect(setZoom).toHaveBeenCalledWith(2.5);
  });
});
