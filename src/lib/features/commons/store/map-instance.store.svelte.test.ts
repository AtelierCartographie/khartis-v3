import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  DEFAULT_MAP_BASE_ZOOM,
  MAX_MAP_ZOOM_PERCENT,
  MIN_MAP_ZOOM_PERCENT,
  resolveMapZoomBounds,
  resolveMapZoomLevel
} from '$lib/features/map/utils/map-zoom.utils';

const mocks = vi.hoisted(() => ({
  registerMock: vi.fn(),
  notifyChangeMock: vi.fn(),
  getBboxCenterMock: vi.fn<() => [number, number]>(() => [0, 0]),
  getMaxScaleMock: vi.fn(() => 1),
  projectionStoreMock: {
    referenceBbox: null as [number, number, number, number] | null,
    canvasSize: { width: 800, height: 600 },
    fitPaddingPx: 0,
    isProjectedCoordinates: false
  }
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  persistenceRegistry: {
    register: mocks.registerMock,
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('$lib/features/map/stores/projection.store.svelte', () => ({
  projectionStore: mocks.projectionStoreMock
}));

vi.mock('$lib/features/map/core/projscreen', () => ({
  get_bbox_center: mocks.getBboxCenterMock,
  get_max_scale: mocks.getMaxScaleMock
}));

import {
  injectProjectionContext,
  mapInstanceStore
} from './map-instance.store.svelte';

const mapViewStatePersistenceEntry = mocks.registerMock.mock.calls.find(
  ([entry]) => entry?.key === 'mapViewState'
)?.[0] as { serialize: () => unknown } | undefined;

interface MockMapState {
  currentZoom: number;
  minZoom: number;
  maxZoom: number;
}

function createMapMock(initialZoom = DEFAULT_MAP_BASE_ZOOM) {
  const state: MockMapState = {
    currentZoom: initialZoom,
    minZoom: Number.NEGATIVE_INFINITY,
    maxZoom: Number.POSITIVE_INFINITY
  };

  const map = {
    getZoom: vi.fn(() => state.currentZoom),
    setZoom: vi.fn((zoom: number) => {
      state.currentZoom = Math.max(
        state.minZoom,
        Math.min(state.maxZoom, zoom)
      );
    }),
    setMinZoom: vi.fn((zoom: number) => {
      state.minZoom = zoom;
      state.currentZoom = Math.max(state.currentZoom, state.minZoom);
    }),
    setMaxZoom: vi.fn((zoom: number) => {
      state.maxZoom = zoom;
      state.currentZoom = Math.min(state.currentZoom, state.maxZoom);
    }),
    jumpTo: vi.fn(({ center }: { center?: [number, number] }) => {
      if (!center) return;
    }),
    getCanvas: vi.fn(() => null),
    getBounds: vi.fn(() => ({
      getNorth: () => 0,
      getSouth: () => 0,
      getEast: () => 0,
      getWest: () => 0
    })),
    getCenter: vi.fn(() => ({ lng: 0, lat: 0 }))
  };

  return {
    map: map as unknown as MapLibreMap,
    state
  };
}

function createDeckMock() {
  const deck = {
    setProps: vi.fn()
  };

  return {
    deck,
    setPropsMock: deck.setProps
  };
}

describe('mapInstanceStore map zoom bounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectionStoreMock.referenceBbox = null;
    mocks.projectionStoreMock.canvasSize = { width: 800, height: 600 };
    mocks.projectionStoreMock.fitPaddingPx = 0;
    mocks.projectionStoreMock.isProjectedCoordinates = false;
    mocks.getBboxCenterMock.mockReturnValue([0, 0]);
    mocks.getMaxScaleMock.mockReturnValue(1);
    injectProjectionContext(() => ({
      referenceBbox: mocks.projectionStoreMock.referenceBbox,
      canvasSize: mocks.projectionStoreMock.canvasSize,
      fitPaddingPx: mocks.projectionStoreMock.fitPaddingPx,
      isProjectedCoordinates: mocks.projectionStoreMock.isProjectedCoordinates
    }));
    mapInstanceStore.reset();
  });

  it('updates native MapLibre min/max zoom when the base zoom changes', () => {
    const mapMock = createMapMock(4.8);
    mapInstanceStore.setMapInstance(mapMock.map);

    vi.clearAllMocks();
    mapInstanceStore.setBaseZoomLevel(4.8);

    const bounds = resolveMapZoomBounds(4.8);

    expect(mapMock.state.minZoom).toBeCloseTo(bounds.minZoom, 10);
    expect(mapMock.state.maxZoom).toBeCloseTo(bounds.maxZoom, 10);
    expect(mapMock.state.currentZoom).toBeCloseTo(4.8, 10);
    expect(mapInstanceStore.zoomLevel).toBe(100);
  });

  it('clamps direct map zoom assignments to the configured UI range', () => {
    const mapMock = createMapMock();
    mapInstanceStore.setMapInstance(mapMock.map);

    vi.clearAllMocks();
    mapInstanceStore.setZoom(resolveMapZoomLevel(DEFAULT_MAP_BASE_ZOOM, 9000));

    expect(mapMock.state.currentZoom).toBeCloseTo(
      resolveMapZoomLevel(DEFAULT_MAP_BASE_ZOOM, MAX_MAP_ZOOM_PERCENT),
      10
    );
  });

  it('clamps direct orthographic zoom assignments to the configured UI range', () => {
    const { deck } = createDeckMock();
    const maxZoom = resolveMapZoomLevel(
      DEFAULT_MAP_BASE_ZOOM,
      MAX_MAP_ZOOM_PERCENT
    );

    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);
    mapInstanceStore.setZoom(resolveMapZoomLevel(DEFAULT_MAP_BASE_ZOOM, 9000));

    expect(mapInstanceStore.deckViewState.zoom).toBeCloseTo(maxZoom, 10);
    expect(mapInstanceStore.zoomLevel).toBe(MAX_MAP_ZOOM_PERCENT);
  });

  it('stops zooming in once the map hits the supported max percent', () => {
    const mapMock = createMapMock(
      resolveMapZoomLevel(DEFAULT_MAP_BASE_ZOOM, MAX_MAP_ZOOM_PERCENT)
    );
    mapInstanceStore.setMapInstance(mapMock.map);

    vi.clearAllMocks();
    mapInstanceStore.zoomIn();

    expect(mapMock.state.currentZoom).toBeCloseTo(
      resolveMapZoomLevel(DEFAULT_MAP_BASE_ZOOM, MAX_MAP_ZOOM_PERCENT),
      10
    );
  });

  it('stops zooming out once the map hits the supported min percent', () => {
    const mapMock = createMapMock(
      resolveMapZoomLevel(DEFAULT_MAP_BASE_ZOOM, MIN_MAP_ZOOM_PERCENT)
    );
    mapInstanceStore.setMapInstance(mapMock.map);

    vi.clearAllMocks();
    mapInstanceStore.zoomOut();

    expect(mapMock.state.currentZoom).toBeCloseTo(
      resolveMapZoomBounds(DEFAULT_MAP_BASE_ZOOM).minZoom,
      10
    );
  });

  it('marks maplibre centering as a manual viewport change', () => {
    const mapMock = createMapMock();
    mapInstanceStore.setMapInstance(mapMock.map);

    vi.clearAllMocks();
    mapInstanceStore.centerOnDataPoint(2.35, 48.86);

    expect(mapMock.map.jumpTo).toHaveBeenCalledWith({
      center: [2.35, 48.86]
    });
    expect(mapInstanceStore.viewportFitMode).toBe('manual');
    expect(mocks.notifyChangeMock).toHaveBeenCalledWith('mapViewState');
  });

  it('serializes the current maplibre viewport through the registry payload', () => {
    const mapMock = createMapMock(5.25);
    (
      mapMock.map as unknown as {
        getCenter: () => { lng: number; lat: number };
      }
    ).getCenter = vi.fn(() => ({ lng: 2.35, lat: 48.86 }));
    mapInstanceStore.setMapInstance(mapMock.map);
    mapInstanceStore.setMapLoaded(true);
    mapInstanceStore.setBaseZoomLevel(4.8);

    expect(mapViewStatePersistenceEntry?.serialize()).toEqual({
      zoom: 5.25,
      center: [2.35, 48.86],
      baseZoom: 4.8
    });
  });

  it('applies a restored maplibre viewport without going through auto-fit', () => {
    const mapMock = createMapMock();
    mapInstanceStore.setMapInstance(mapMock.map);
    mapInstanceStore.setMapLoaded(true);
    mapInstanceStore.restoreFromSerialized({
      zoom: 6,
      center: [2.35, 48.86],
      baseZoom: 5.1
    });

    expect(mapInstanceStore.hasPendingMapLibreRestore).toBe(true);
    expect(mapInstanceStore.applyPendingMapLibreRestore()).toBe(true);
    expect(mapMock.map.jumpTo).toHaveBeenCalledWith({
      center: [2.35, 48.86],
      zoom: 6
    });
    expect(mapInstanceStore.hasPendingMapLibreRestore).toBe(false);
    expect(mapInstanceStore.baseZoomLevel).toBe(5.1);
    expect(mapInstanceStore.viewportFitMode).toBe('manual');
  });

  it('does not serialize a fallback orthographic viewport before projection bounds exist', () => {
    expect(mapViewStatePersistenceEntry?.serialize()).toBeNull();
  });

  it('waits for projection bounds before applying a restored orthographic view', () => {
    const { deck, setPropsMock } = createDeckMock();
    const zoomBounds = resolveMapZoomBounds(DEFAULT_MAP_BASE_ZOOM);

    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);
    mapInstanceStore.restoreFromSerialized({
      zoom: 2,
      target: [10, 20, 0]
    });

    mapInstanceStore.fitToOrthographicBounds();

    expect(setPropsMock).not.toHaveBeenCalled();
    expect(mocks.notifyChangeMock).not.toHaveBeenCalled();

    mocks.projectionStoreMock.referenceBbox = [0, 0, 100, 100];
    mocks.getBboxCenterMock.mockReturnValue([50, 50]);
    mocks.getMaxScaleMock.mockReturnValue(2);

    mapInstanceStore.fitToOrthographicBounds();

    expect(setPropsMock).toHaveBeenCalledWith({
      viewState: {
        main: {
          target: [-80, -60, 0],
          zoom: 2,
          minZoom: zoomBounds.minZoom,
          maxZoom: zoomBounds.maxZoom
        }
      },
      initialViewState: {
        main: {
          target: [-80, -60, 0],
          zoom: 2,
          minZoom: zoomBounds.minZoom,
          maxZoom: zoomBounds.maxZoom
        }
      }
    });
    expect(mocks.notifyChangeMock).toHaveBeenCalledWith('mapViewState');
  });

  it('drops an implausible restored orthographic target and recenters the view', () => {
    const { deck, setPropsMock } = createDeckMock();
    const zoomBounds = resolveMapZoomBounds(DEFAULT_MAP_BASE_ZOOM);

    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);
    mocks.projectionStoreMock.referenceBbox = [200, 100, 600, 400];
    mocks.getBboxCenterMock.mockReturnValue([400, 250]);
    mapInstanceStore.restoreFromSerialized({
      zoom: 0,
      target: [0, 0, 0]
    });

    mapInstanceStore.fitToOrthographicBounds();

    expect(setPropsMock).toHaveBeenCalledWith({
      viewState: {
        main: {
          target: [0, 0, 0],
          zoom: DEFAULT_MAP_BASE_ZOOM,
          minZoom: zoomBounds.minZoom,
          maxZoom: zoomBounds.maxZoom
        }
      },
      initialViewState: {
        main: {
          target: [0, 0, 0],
          zoom: DEFAULT_MAP_BASE_ZOOM,
          minZoom: zoomBounds.minZoom,
          maxZoom: zoomBounds.maxZoom
        }
      }
    });
    expect(mocks.notifyChangeMock).toHaveBeenCalledWith('mapViewState');
  });

  it('delegates zoom commands to a synchronized viewport controller when one is registered', () => {
    const synchronizedViewportController = {
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      setZoom: vi.fn(),
      resetZoom: vi.fn()
    };

    mapInstanceStore.setSynchronizedViewportController(
      synchronizedViewportController
    );

    mapInstanceStore.zoomIn();
    mapInstanceStore.zoomOut();
    mapInstanceStore.setZoom(2.5);
    mapInstanceStore.resetZoom();

    expect(synchronizedViewportController.zoomIn).toHaveBeenCalledTimes(1);
    expect(synchronizedViewportController.zoomOut).toHaveBeenCalledTimes(1);
    expect(synchronizedViewportController.setZoom).toHaveBeenCalledWith(2.5);
    expect(synchronizedViewportController.resetZoom).toHaveBeenCalledTimes(1);
  });

  it('uses the orthographic view-state adapter when one is registered', () => {
    const { deck, setPropsMock } = createDeckMock();
    const applyViewStateMock = vi.fn();
    const zoomBounds = resolveMapZoomBounds(DEFAULT_MAP_BASE_ZOOM);

    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);
    mapInstanceStore.setOrthographicViewStateAdapter({
      applyViewState: applyViewStateMock
    });

    mapInstanceStore.setZoomLocal(1.25);

    expect(applyViewStateMock).toHaveBeenCalledWith({
      target: [0, 0, 0],
      zoom: 1.25,
      minZoom: zoomBounds.minZoom,
      maxZoom: zoomBounds.maxZoom
    });
    expect(setPropsMock).not.toHaveBeenCalled();
  });
});
