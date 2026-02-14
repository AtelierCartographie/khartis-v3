import type { Deck, View } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';

type DeckInstance = Deck<View | View[] | null>;

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

function createMapInstanceStore() {
  const state = $state<{
    map: MapLibreMap | null;
    deckOverlay: MapboxOverlay | null;
    deckInstance: DeckInstance | null;
    isMapLoaded: boolean;
    zoomLevel: number;
    baseZoomLevel: number;
    deckViewState: DeckViewState;
  }>({
    map: null,
    deckOverlay: null,
    deckInstance: null,
    isMapLoaded: false,
    zoomLevel: 100,
    baseZoomLevel: 1.5,
    deckViewState: { ...DEFAULT_DECK_VIEW_STATE }
  });

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

  function updateDeckViewState(viewState: Partial<DeckViewState>) {
    state.deckViewState = {
      ...state.deckViewState,
      ...viewState
    };
    updateZoomFromMap();
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

  function zoomIn() {
    if (state.map) {
      const currentZoom = state.map.getZoom();
      state.map.setZoom(currentZoom + MAPLIBRE_ZOOM_STEP);
      return;
    }

    if (state.deckInstance) {
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
    }
  }

  function zoomOut() {
    if (state.map) {
      const currentZoom = state.map.getZoom();
      state.map.setZoom(currentZoom - MAPLIBRE_ZOOM_STEP);
      return;
    }

    if (state.deckInstance) {
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
    }
  }

  function setZoom(zoom: number) {
    if (state.map) {
      state.map.setZoom(zoom);
      return;
    }

    if (state.deckInstance) {
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
    }
  }

  function resetZoom() {
    if (state.map) {
      state.map.setZoom(state.baseZoomLevel);
      return;
    }

    if (state.deckInstance) {
      state.deckViewState = {
        ...state.deckViewState,
        zoom: 0
      };
      applyDeckViewState();
      updateZoomFromMap();
    }
  }

  /**
   * Reset the Deck.gl orthographic camera to origin.
   * The model matrix (from projectionStore) already centers and scales data
   * to fit the canvas at zoom 0, so target [0,0,0] + zoom 0 = "fit bounds".
   */
  function fitToOrthographicBounds(): void {
    if (!state.deckInstance || !state.isMapLoaded) return;

    state.deckViewState = {
      ...state.deckViewState,
      target: [0, 0, 0],
      zoom: 0
    };
    applyDeckViewState();
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
    updateDeckViewState,
    zoomIn,
    zoomOut,
    setZoom,
    resetZoom,
    fitToOrthographicBounds,
    reset
  };
}

export const mapInstanceStore = createMapInstanceStore();
