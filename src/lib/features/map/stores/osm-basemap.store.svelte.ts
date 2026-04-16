import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import { basemapCatalogService } from '../services/basemap-catalog.service.svelte';
import type { OSMTileConfig } from '../services/osm-tile.service';
import { getOSMTileConfig, isOSMBasemap } from '../services/osm-tile.service';
import type { BasemapMetadata } from '../types/basemap.types';

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
      persistenceRegistry.notifyChange('osmBasemap');
      return;
    }
    clear();
  }

  function reset(): void {
    clear();
  }

  function restoreFromSerialized(fileId: string | null): void {
    if (!fileId) {
      clear();
      return;
    }
    const basemap = basemapCatalogService.getBasemapById(fileId);
    if (basemap && isOSMBasemap(basemap)) {
      setOSMBasemap(basemap);
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
