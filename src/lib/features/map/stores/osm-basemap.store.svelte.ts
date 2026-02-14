import type { OSMTileConfig } from '../services/osm-tile.service';
import { getOSMTileConfig, isOSMBasemap } from '../services/osm-tile.service';
import type { BasemapMetadata } from '../types/basemap.types';

/**
 * Store for managing OSM basemap state
 * Tracks when an OSM raster basemap is active
 */
function createOSMBasemapStore() {
  const state = $state<{
    activeOSMBasemap: BasemapMetadata | null;
    tileConfig: OSMTileConfig | null;
  }>({
    activeOSMBasemap: null,
    tileConfig: null
  });

  function clear(): void {
    state.activeOSMBasemap = null;
    state.tileConfig = null;
  }

  function setOSMBasemap(basemap: BasemapMetadata | null): void {
    if (basemap && isOSMBasemap(basemap)) {
      const config = getOSMTileConfig(basemap);
      state.activeOSMBasemap = basemap;
      state.tileConfig = config;
      return;
    }
    clear();
  }

  return {
    get activeOSMBasemap(): BasemapMetadata | null {
      return state.activeOSMBasemap;
    },
    get tileConfig(): OSMTileConfig | null {
      return state.tileConfig;
    },
    get isActive(): boolean {
      return state.activeOSMBasemap !== null;
    },
    setOSMBasemap,
    clear
  };
}

export const osmBasemapStore = createOSMBasemapStore();
