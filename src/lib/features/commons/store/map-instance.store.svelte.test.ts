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
  getBboxCenterMock: vi.fn(() => [0, 0] as const),
  getMaxScaleMock: vi.fn(() => 1)
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  persistenceRegistry: {
    register: mocks.registerMock,
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('$lib/features/map/stores/projection.store.svelte', () => ({
  projectionStore: {
    referenceBbox: null,
    canvasSize: { width: 800, height: 600 },
    fitPaddingPx: 0,
    isProjectedCoordinates: false
  }
}));

vi.mock('$lib/features/map/core/projscreen', () => ({
  get_bbox_center: mocks.getBboxCenterMock,
  get_max_scale: mocks.getMaxScaleMock
}));

import { mapInstanceStore } from './map-instance.store.svelte';

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

describe('mapInstanceStore map zoom bounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mapInstanceStore.setZoom(resolveMapZoomLevel(DEFAULT_MAP_BASE_ZOOM, 900));

    expect(mapMock.state.currentZoom).toBeCloseTo(
      resolveMapZoomLevel(DEFAULT_MAP_BASE_ZOOM, MAX_MAP_ZOOM_PERCENT),
      10
    );
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
      resolveMapZoomLevel(DEFAULT_MAP_BASE_ZOOM, MIN_MAP_ZOOM_PERCENT),
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
});
