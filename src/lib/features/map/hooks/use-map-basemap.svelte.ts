import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { OSMSourceId } from '../constants';
import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
import {
  createOSMRasterSource,
  createOSMRasterLayer
} from '../services/osm-tile.service';

export interface UseMapBasemapProps {
  getMap: () => MapLibreMap | null;
  getIsMapLoaded: () => boolean;
}

export interface UseMapBasemapReturn {
  syncBasemapStyle: () => void;
  syncOSMRasterLayer: () => void;
}

export function useMapBasemap(props: UseMapBasemapProps): UseMapBasemapReturn {
  const { getMap, getIsMapLoaded } = props;

  function syncBasemapStyle(): void {
    const map = getMap();
    if (!map || !getIsMapLoaded()) return;

    const style = basemapStyleStore.selectedStyleUrl;
    const currentStyle = map.getStyle();
    const shouldUpdate =
      typeof style === 'string'
        ? currentStyle?.sprite !== style
        : currentStyle?.name !== (style as StyleSpecification).name;

    if (shouldUpdate) {
      map.setStyle(style);
    }
  }

  function syncOSMRasterLayer(): void {
    const map = getMap();
    if (!map || !getIsMapLoaded()) return;

    const osmBasemap = osmBasemapStore.activeOSMBasemap;
    const tileConfig = osmBasemapStore.tileConfig;
    const osmLayerId = `${OSMSourceId.RASTER}-layer`;

    try {
      if (map.getLayer(osmLayerId)) map.removeLayer(osmLayerId);
      if (map.getSource(OSMSourceId.RASTER))
        map.removeSource(OSMSourceId.RASTER);
    } catch {
      // Ignore cleanup errors
    }

    if (osmBasemap && tileConfig) {
      const rasterSource = createOSMRasterSource(tileConfig);
      const rasterLayer = createOSMRasterLayer(OSMSourceId.RASTER);

      try {
        if (!map.getSource(OSMSourceId.RASTER)) {
          map.addSource(OSMSourceId.RASTER, rasterSource);
        }
        if (!map.getLayer(osmLayerId)) {
          map.addLayer(rasterLayer);
        }
      } catch (error) {
        logger.warn('Failed to add OSM raster layer', LogCategory.MAP, error);
      }

      logger.debug('OSM raster basemap applied', LogCategory.MAP, {
        basemap: osmBasemap.file,
        title: osmBasemap.title
      });
    }
  }

  return {
    syncBasemapStyle,
    syncOSMRasterLayer
  };
}
