import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';

class MapInstanceStore {
  private _state = $state<{
    map: MapLibreMap | null;
    deckOverlay: MapboxOverlay | null;
    isMapLoaded: boolean;
  }>({
    map: null,
    deckOverlay: null,
    isMapLoaded: false
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

  reset() {
    this._state.map = null;
    this._state.deckOverlay = null;
    this._state.isMapLoaded = false;
  }
}

export const mapInstanceStore = new MapInstanceStore();
