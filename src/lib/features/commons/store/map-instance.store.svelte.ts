import type { Deck, View } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import { projectionStore } from '$lib/features/map/stores/projection.store.svelte';
import {
  get_bbox_center,
  get_max_scale
} from '$lib/features/map/core/projscreen';

type DeckInstance = Deck<View | View[] | null>;
export type ViewportFitMode = 'auto' | 'manual';
export type ViewportFitReason =
  | 'dataset'
  | 'basemap'
  | 'projection'
  | 'reset'
  | 'restore';

interface DeckViewState {
  target: [number, number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
}

const DEFAULT_DECK_VIEW_STATE: DeckViewState = {
  target: [0, 0, 0],
  zoom: 0,
  minZoom: -10,
  maxZoom: 10
};

const DECK_ZOOM_STEP = 0.1375;
const MAPLIBRE_ZOOM_STEP = 0.275;

/** Ensure target always has exactly 3 numeric elements. */
function normalizeTarget(t: number[]): [number, number, number] {
  return [t[0] ?? 0, t[1] ?? 0, t[2] ?? 0];
}

/**
 * Convert a world-coordinate target to data coordinates using
 * the inverse of the model matrix: `data = world / scale + center`.
 */
function worldToData(target: number[]): [number, number, number] {
  const t = normalizeTarget(target);
  const bbox = projectionStore.referenceBbox;
  if (!bbox) return t;
  const [cx, cy] = get_bbox_center(bbox);
  const scale = get_max_scale(
    projectionStore.canvasSize,
    bbox,
    projectionStore.fitPaddingPx
  );
  if (scale === 0) return t;
  const yDirection = projectionStore.isProjectedCoordinates ? -1 : 1;
  return [t[0] / scale + cx, (t[1] * yDirection) / scale + cy, 0];
}

/**
 * Convert a data-coordinate target to world coordinates using
 * the model matrix: `world = scale * (data - center)`.
 */
function dataToWorld(target: number[]): [number, number, number] {
  const t = normalizeTarget(target);
  const bbox = projectionStore.referenceBbox;
  if (!bbox) return t;
  const [cx, cy] = get_bbox_center(bbox);
  const scale = get_max_scale(
    projectionStore.canvasSize,
    bbox,
    projectionStore.fitPaddingPx
  );
  const yDirection = projectionStore.isProjectedCoordinates ? -1 : 1;
  return [scale * (t[0] - cx), yDirection * scale * (t[1] - cy), 0];
}

interface PendingViewState {
  zoom: number;
  /** Target stored in data (geographic) coordinates, not world coordinates. */
  target: [number, number, number];
}

type SerializedViewState = PendingViewState;

function createMapInstanceStore() {
  const state = $state<{
    map: MapLibreMap | null;
    deckOverlay: MapboxOverlay | null;
    deckInstance: DeckInstance | null;
    isMapLoaded: boolean;
    zoomLevel: number;
    baseZoomLevel: number;
    deckViewState: DeckViewState;
    viewportFitMode: ViewportFitMode;
    viewportFitReason: ViewportFitReason | null;
  }>({
    map: null,
    deckOverlay: null,
    deckInstance: null,
    isMapLoaded: false,
    zoomLevel: 100,
    baseZoomLevel: 1.5,
    deckViewState: { ...DEFAULT_DECK_VIEW_STATE },
    viewportFitMode: 'auto',
    viewportFitReason: null
  });

  let pendingRestore: PendingViewState | null = null;
  let lastSerializedViewState: SerializedViewState | null = null;

  function buildSerializedViewState(): SerializedViewState | null {
    const worldTarget = normalizeTarget(state.deckViewState.target);
    const bbox = projectionStore.referenceBbox;

    if (!bbox) {
      return lastSerializedViewState;
    }

    const scale = get_max_scale(
      projectionStore.canvasSize,
      bbox,
      projectionStore.fitPaddingPx
    );
    if (scale === 0) {
      return lastSerializedViewState;
    }

    const serialized = {
      zoom: state.deckViewState.zoom,
      target: worldToData(worldTarget)
    };

    lastSerializedViewState = serialized;
    return serialized;
  }

  function setMapInstance(map: MapLibreMap | null) {
    state.map = map;
  }

  function setDeckOverlay(overlay: MapboxOverlay | null) {
    state.deckOverlay = overlay;
  }

  function setDeckInstance(instance: DeckInstance | null) {
    state.deckInstance = instance;
  }

  function setMapLoaded(loaded: boolean) {
    state.isMapLoaded = loaded;
  }

  function getMapCanvas(): HTMLCanvasElement | null {
    return state.map?.getCanvas() ?? null;
  }

  function getMapBounds() {
    if (!state.map) return null;
    const bounds = state.map.getBounds();
    return {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    };
  }

  function getMapZoom(): number {
    return state.map?.getZoom() ?? 0;
  }

  function getMapCenter(): { lng: number; lat: number } | null {
    const center = state.map?.getCenter();
    return center ? { lng: center.lng, lat: center.lat } : null;
  }

  function setBaseZoomLevel(zoom: number) {
    state.baseZoomLevel = zoom;
  }

  function markViewportAutoFit(reason: ViewportFitReason): void {
    state.viewportFitMode = 'auto';
    state.viewportFitReason = reason;
  }

  function markViewportManual(): void {
    state.viewportFitMode = 'manual';
    state.viewportFitReason = null;
  }

  function updateZoomFromMap() {
    if (state.map) {
      const mapZoom = state.map.getZoom();
      const baseZoom = state.baseZoomLevel;
      const percent = 100 * Math.pow(2, (mapZoom - baseZoom) / 2);
      state.zoomLevel = Math.round(percent);
      return;
    }

    if (state.deckInstance) {
      const deckZoom = state.deckViewState.zoom;
      const percent = 100 * Math.pow(2, deckZoom);
      state.zoomLevel = Math.round(percent);
    }
  }

  function updateDeckViewState(
    viewState: Partial<DeckViewState>,
    fromUserInteraction = false
  ) {
    state.deckViewState = {
      ...state.deckViewState,
      ...viewState
    };
    updateZoomFromMap();
    if (fromUserInteraction) {
      markViewportManual();
      pendingRestore = null;
      persistenceRegistry.notifyChange('mapViewState');
    }
  }

  function applyDeckViewState(): void {
    if (!state.deckInstance) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state.deckInstance as any).setProps({
      initialViewState: { main: state.deckViewState }
    });
  }

  /** Clear pending restore and save the project immediately. */
  function consumePendingRestore(): void {
    pendingRestore = null;
    persistenceRegistry.notifyChange('mapViewState', 'immediate');
  }

  function zoomIn() {
    if (state.map) {
      markViewportManual();
      const currentZoom = state.map.getZoom();
      state.map.setZoom(currentZoom + MAPLIBRE_ZOOM_STEP);
      return;
    }

    if (state.deckInstance) {
      markViewportManual();
      pendingRestore = null;
      const newZoom = Math.min(
        state.deckViewState.zoom + DECK_ZOOM_STEP,
        state.deckViewState.maxZoom
      );
      state.deckViewState = {
        ...state.deckViewState,
        zoom: newZoom
      };
      applyDeckViewState();
      updateZoomFromMap();
      consumePendingRestore();
    }
  }

  function zoomOut() {
    if (state.map) {
      markViewportManual();
      const currentZoom = state.map.getZoom();
      state.map.setZoom(currentZoom - MAPLIBRE_ZOOM_STEP);
      return;
    }

    if (state.deckInstance) {
      markViewportManual();
      pendingRestore = null;
      const newZoom = Math.max(
        state.deckViewState.zoom - DECK_ZOOM_STEP,
        state.deckViewState.minZoom
      );
      state.deckViewState = {
        ...state.deckViewState,
        zoom: newZoom
      };
      applyDeckViewState();
      updateZoomFromMap();
      consumePendingRestore();
    }
  }

  function setZoom(zoom: number) {
    if (state.map) {
      markViewportManual();
      state.map.setZoom(zoom);
      return;
    }

    if (state.deckInstance) {
      markViewportManual();
      pendingRestore = null;
      const clampedZoom = Math.max(
        state.deckViewState.minZoom,
        Math.min(zoom, state.deckViewState.maxZoom)
      );
      state.deckViewState = {
        ...state.deckViewState,
        zoom: clampedZoom
      };
      applyDeckViewState();
      updateZoomFromMap();
      consumePendingRestore();
    }
  }

  function resetZoom() {
    if (state.map) {
      markViewportManual();
      state.map.setZoom(state.baseZoomLevel);
      return;
    }

    if (state.deckInstance) {
      markViewportManual();
      pendingRestore = null;
      state.deckViewState = {
        ...state.deckViewState,
        zoom: 0
      };
      applyDeckViewState();
      updateZoomFromMap();
      consumePendingRestore();
    }
  }

  /**
   * Reset the Deck.gl orthographic camera to origin — or restore the
   * project-saved view state if one exists.
   *
   * `pendingRestore` is kept alive across ALL calls to this function
   * (data load, world basemap load, reference basemap load, …) so the
   * last one wins.  It is only cleared when the user explicitly changes
   * the zoom via the toolbar.
   */
  function fitToOrthographicBounds(
    reason: ViewportFitReason | null = null
  ): void {
    if (!state.deckInstance || !state.isMapLoaded) return;

    if (pendingRestore) {
      state.deckViewState = {
        ...state.deckViewState,
        target: dataToWorld(pendingRestore.target),
        zoom: pendingRestore.zoom
      };
      markViewportManual();
    } else {
      state.deckViewState = {
        ...state.deckViewState,
        target: [0, 0, 0],
        zoom: 0
      };
      if (reason) {
        markViewportAutoFit(reason);
      }
    }

    applyDeckViewState();
    updateZoomFromMap();
    buildSerializedViewState();
    persistenceRegistry.notifyChange('mapViewState');
  }

  function restoreFromSerialized(data: {
    zoom?: number;
    target?: [number, number, number];
  }): void {
    const zoom =
      typeof data.zoom === 'number' && Number.isFinite(data.zoom)
        ? data.zoom
        : null;

    if (zoom == null) return;

    const raw = data.target;
    const hasValidXY =
      Array.isArray(raw) &&
      raw.length >= 2 &&
      typeof raw[0] === 'number' &&
      Number.isFinite(raw[0]) &&
      typeof raw[1] === 'number' &&
      Number.isFinite(raw[1]);
    const target: [number, number, number] = hasValidXY
      ? [raw[0], raw[1], 0]
      : [0, 0, 0];

    pendingRestore = { zoom, target };
    lastSerializedViewState = pendingRestore;
  }

  function clearPersistedViewState(): void {
    pendingRestore = null;
    lastSerializedViewState = null;
    state.deckViewState = { ...DEFAULT_DECK_VIEW_STATE };
    state.viewportFitMode = 'auto';
    state.viewportFitReason = null;

    if (state.deckInstance && state.isMapLoaded && !state.map) {
      applyDeckViewState();
    }

    updateZoomFromMap();
  }

  function reset() {
    state.map = null;
    state.deckOverlay = null;
    state.deckInstance = null;
    state.isMapLoaded = false;
    state.zoomLevel = 100;
    state.baseZoomLevel = 1.5;
    state.deckViewState = { ...DEFAULT_DECK_VIEW_STATE };
    state.viewportFitMode = 'auto';
    state.viewportFitReason = null;
    // Note: pendingRestore is intentionally NOT cleared here.
    // reset() is called during map teardown (view switch, destroy)
    // but pendingRestore must survive until fitToOrthographicBounds()
    // consumes it on the next initialization.
    lastSerializedViewState = null;
  }

  return {
    get map() {
      return state.map;
    },
    get deckOverlay() {
      return state.deckOverlay;
    },
    get deckInstance() {
      return state.deckInstance;
    },
    get isMapLoaded() {
      return state.isMapLoaded;
    },
    get hasPendingRestore() {
      return pendingRestore !== null;
    },
    get currentZoom(): number {
      if (state.map) {
        return state.map.getZoom();
      }
      return state.deckViewState.zoom;
    },
    get zoomLevel() {
      return state.zoomLevel;
    },
    get baseZoomLevel() {
      return state.baseZoomLevel;
    },
    get deckViewState() {
      return state.deckViewState;
    },
    get isViewportAutoFitManaged() {
      return state.viewportFitMode === 'auto';
    },
    get viewportFitMode() {
      return state.viewportFitMode;
    },
    get viewportFitReason() {
      return state.viewportFitReason;
    },
    setMapInstance,
    setDeckOverlay,
    setDeckInstance,
    setMapLoaded,
    getMapCanvas,
    getMapBounds,
    getMapZoom,
    getMapCenter,
    setBaseZoomLevel,
    updateZoomFromMap,
    markViewportAutoFit,
    markViewportManual,
    updateDeckViewState,
    buildSerializedViewState,
    zoomIn,
    zoomOut,
    setZoom,
    resetZoom,
    fitToOrthographicBounds,
    restoreFromSerialized,
    clearPersistedViewState,
    reset
  };
}

export const mapInstanceStore = createMapInstanceStore();

persistenceRegistry.register({
  key: 'mapViewState',
  serialize: () =>
    mapInstanceStore.buildSerializedViewState() ?? {
      zoom: mapInstanceStore.deckViewState.zoom,
      target: [0, 0, 0]
    },
  deserialize: (data: unknown) =>
    mapInstanceStore.restoreFromSerialized(
      data as { zoom?: number; target?: [number, number, number] }
    ),
  reset: () => mapInstanceStore.clearPersistedViewState(),
  priority: 'debounced'
});
