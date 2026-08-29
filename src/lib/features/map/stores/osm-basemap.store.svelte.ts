import { persistenceRegistry } from '$lib/features/project-management/core';
import { basemapCatalogService } from '../services/basemap-catalog.service.svelte';
import type { OSMTileConfig } from '../services/osm-tile.service';
import { getOSMTileConfig, isOSMBasemap } from '../services/osm-tile.service';
import type { BasemapMetadata } from '../types/basemap.types';

function createOSMBasemapStore() {
  const state = $state<{
    activeOSMBasemap: BasemapMetadata | null;
    tileConfig: OSMTileConfig | null;
    isDisabledByUser: boolean;
  }>({
    activeOSMBasemap: null,
    tileConfig: null,
    isDisabledByUser: false
  });

  function clear(notify = true): void {
    const wasActive =
      state.activeOSMBasemap !== null ||
      state.tileConfig !== null ||
      state.isDisabledByUser;
    state.activeOSMBasemap = null;
    state.tileConfig = null;
    state.isDisabledByUser = false;

    if (notify && wasActive) {
      persistenceRegistry.notifyChange('osmBasemap');
    }
  }

  function disable(): void {
    const stateChanged =
      state.activeOSMBasemap !== null ||
      state.tileConfig !== null ||
      !state.isDisabledByUser;
    state.activeOSMBasemap = null;
    state.tileConfig = null;
    state.isDisabledByUser = true;

    if (stateChanged) {
      persistenceRegistry.notifyChange('osmBasemap');
    }
  }

  function setOSMBasemap(basemap: BasemapMetadata | null): void {
    if (basemap && isOSMBasemap(basemap)) {
      const config = getOSMTileConfig(basemap);
      state.activeOSMBasemap = basemap;
      state.tileConfig = config;
      state.isDisabledByUser = false;
      persistenceRegistry.notifyChange('osmBasemap');
      return;
    }
    clear();
  }

  function reset(): void {
    clear(false);
  }

  function restoreFromSerialized(fileId: string | null): void {
    if (!fileId) {
      state.activeOSMBasemap = null;
      state.tileConfig = null;
      state.isDisabledByUser = true;
      return;
    }
    const basemap = basemapCatalogService.getBasemapById(fileId);
    if (basemap && isOSMBasemap(basemap)) {
      setOSMBasemap(basemap);
      return;
    }
    clear(false);
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
    get isDisabledByUser(): boolean {
      return state.isDisabledByUser;
    },
    setOSMBasemap,
    disable,
    clear,
    reset,
    restoreFromSerialized
  };
}

export const osmBasemapStore = createOSMBasemapStore();

persistenceRegistry.register({
  key: 'osmBasemap',
  serialize: () => osmBasemapStore.activeOSMBasemap?.file ?? null,
  deserialize: (data: unknown) =>
    osmBasemapStore.restoreFromSerialized(data as string | null),
  reset: () => osmBasemapStore.reset(),
  priority: 'debounced'
});
