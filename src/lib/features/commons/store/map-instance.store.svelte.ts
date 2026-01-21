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

class MapInstanceStore {
  private _state = $state<{
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

  get map() {
    return this._state.map;
  }

  get deckOverlay() {
    return this._state.deckOverlay;
  }

  get deckInstance() {
    return this._state.deckInstance;
  }

  get isMapLoaded() {
    return this._state.isMapLoaded;
  }

  setMapInstance(map: MapLibreMap | null) {
    this._state.map = map;
  }

  setDeckOverlay(overlay: MapboxOverlay | null) {
    this._state.deckOverlay = overlay;
  }

  setDeckInstance(instance: DeckInstance | null) {
    this._state.deckInstance = instance;
  }

  setMapLoaded(loaded: boolean) {
    this._state.isMapLoaded = loaded;
  }

  getMapCanvas(): HTMLCanvasElement | null {
    return this._state.map?.getCanvas() ?? null;
  }

  getMapBounds() {
    if (!this._state.map) return null;
    const bounds = this._state.map.getBounds();
    return {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    };
  }

  getMapZoom(): number {
    return this._state.map?.getZoom() ?? 0;
  }

  get currentZoom(): number {
    if (this._state.map) {
      return this._state.map.getZoom();
    }
    return this._state.deckViewState.zoom;
  }

  getMapCenter(): { lng: number; lat: number } | null {
    const center = this._state.map?.getCenter();
    return center ? { lng: center.lng, lat: center.lat } : null;
  }

  get zoomLevel() {
    return this._state.zoomLevel;
  }

  get baseZoomLevel() {
    return this._state.baseZoomLevel;
  }

  setBaseZoomLevel(zoom: number) {
    this._state.baseZoomLevel = zoom;
  }

  updateZoomFromMap() {
    if (this._state.map) {
      const mapZoom = this._state.map.getZoom();
      const baseZoom = this._state.baseZoomLevel;
      const percent = 100 * Math.pow(2, (mapZoom - baseZoom) / 2);
      this._state.zoomLevel = Math.round(percent);
    } else if (this._state.deckInstance) {
      const deckZoom = this._state.deckViewState.zoom;
      const percent = 100 * Math.pow(2, deckZoom);
      this._state.zoomLevel = Math.round(percent);
    }
  }

  get deckViewState() {
    return this._state.deckViewState;
  }

  updateDeckViewState(viewState: Partial<DeckViewState>) {
    this._state.deckViewState = {
      ...this._state.deckViewState,
      ...viewState
    };
    this.updateZoomFromMap();
  }

  zoomIn() {
    if (this._state.map) {
      const currentZoom = this._state.map.getZoom();
      this._state.map.setZoom(currentZoom + MAPLIBRE_ZOOM_STEP);
    } else if (this._state.deckInstance) {
      const newZoom = Math.min(
        this._state.deckViewState.zoom + DECK_ZOOM_STEP,
        this._state.deckViewState.maxZoom
      );
      this._state.deckViewState = {
        ...this._state.deckViewState,
        zoom: newZoom
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this._state.deckInstance as any).setProps({
        initialViewState: { main: this._state.deckViewState }
      });
      this.updateZoomFromMap();
    }
  }

  zoomOut() {
    if (this._state.map) {
      const currentZoom = this._state.map.getZoom();
      this._state.map.setZoom(currentZoom - MAPLIBRE_ZOOM_STEP);
    } else if (this._state.deckInstance) {
      const newZoom = Math.max(
        this._state.deckViewState.zoom - DECK_ZOOM_STEP,
        this._state.deckViewState.minZoom
      );
      this._state.deckViewState = {
        ...this._state.deckViewState,
        zoom: newZoom
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this._state.deckInstance as any).setProps({
        initialViewState: { main: this._state.deckViewState }
      });
      this.updateZoomFromMap();
    }
  }

  setZoom(zoom: number) {
    if (this._state.map) {
      this._state.map.setZoom(zoom);
    } else if (this._state.deckInstance) {
      const clampedZoom = Math.max(
        this._state.deckViewState.minZoom,
        Math.min(zoom, this._state.deckViewState.maxZoom)
      );
      this._state.deckViewState = {
        ...this._state.deckViewState,
        zoom: clampedZoom
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this._state.deckInstance as any).setProps({
        initialViewState: { main: this._state.deckViewState }
      });
      this.updateZoomFromMap();
    }
  }

  resetZoom() {
    if (this._state.map) {
      this._state.map.setZoom(this._state.baseZoomLevel);
    } else if (this._state.deckInstance) {
      this._state.deckViewState = {
        ...this._state.deckViewState,
        zoom: 0
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this._state.deckInstance as any).setProps({
        initialViewState: { main: this._state.deckViewState }
      });
      this.updateZoomFromMap();
    }
  }

  reset() {
    this._state.map = null;
    this._state.deckOverlay = null;
    this._state.deckInstance = null;
    this._state.isMapLoaded = false;
    this._state.zoomLevel = 100;
    this._state.baseZoomLevel = 1.5;
    this._state.deckViewState = { ...DEFAULT_DECK_VIEW_STATE };
  }
}

export const mapInstanceStore = new MapInstanceStore();
