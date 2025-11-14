import type { BasemapMetadata } from '../types/basemap.types';
import type { OSMTileConfig } from '../services/osm-tile.service';
import { isOSMBasemap, getOSMTileConfig } from '../services/osm-tile.service';
import { logger, LogCategory } from '../../commons/utils/logger';

/**
 * Store for managing OSM basemap state
 * Tracks when an OSM raster basemap is active
 */
class OSMBasemapStore {
  private _state = $state<{
    activeOSMBasemap: BasemapMetadata | null;
    tileConfig: OSMTileConfig | null;
  }>({
    activeOSMBasemap: null,
    tileConfig: null
  });

  get activeOSMBasemap(): BasemapMetadata | null {
    return this._state.activeOSMBasemap;
  }

  get tileConfig(): OSMTileConfig | null {
    return this._state.tileConfig;
  }

  get isActive(): boolean {
    return this._state.activeOSMBasemap !== null;
  }

  setOSMBasemap(basemap: BasemapMetadata | null): void {
    if (basemap && isOSMBasemap(basemap)) {
      const config = getOSMTileConfig(basemap);
      this._state.activeOSMBasemap = basemap;
      this._state.tileConfig = config;
      logger.success(
        `OSM basemap activated: ${basemap.title}`,
        LogCategory.MAP
      );
    } else {
      this.clear();
    }
  }

  clear(): void {
    this._state.activeOSMBasemap = null;
    this._state.tileConfig = null;
  }
}

export const osmBasemapStore = new OSMBasemapStore();
