import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';

class MapInstanceStore {
  private _state = $state<{
    map: MapLibreMap | null;
    deckOverlay: MapboxOverlay | null;
    isMapLoaded: boolean;
    zoomLevel: number;
    baseZoomLevel: number;
  }>({
    map: null,
    deckOverlay: null,
    isMapLoaded: false,
    zoomLevel: 100,
    baseZoomLevel: 1.5
  });

  get map() {
    return this._state.map;
  }

  get deckOverlay() {
    return this._state.deckOverlay;
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
    const mapZoom = this._state.map?.getZoom() ?? 1.5;
    const baseZoom = this._state.baseZoomLevel;
    const percent = 100 * Math.pow(2, (mapZoom - baseZoom) / 2);
    this._state.zoomLevel = Math.round(percent);
  }

  reset() {
    this._state.map = null;
    this._state.deckOverlay = null;
    this._state.isMapLoaded = false;
    this._state.zoomLevel = 100;
    this._state.baseZoomLevel = 1.5;
  }
}

export const mapInstanceStore = new MapInstanceStore();
