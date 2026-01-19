import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { OSMSourceId } from '../constants';
import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
import { mapProjectionStore } from '../stores/map-projection.store.svelte';
import {
  createOSMRasterSource,
  createOSMRasterLayer
} from '../services/osm-tile.service';

export interface UseMapBasemapProps {
  getMap: () => MapLibreMap | null;
  getIsMapLoaded: () => boolean;
  onProjectionChanged?: () => void;
  onStyleLoaded?: () => void;
}

export interface UseMapBasemapReturn {
  syncBasemapStyle: () => void;
  syncOSMRasterLayer: () => void;
  syncProjection: () => void;
  readonly isStyleLoading: boolean;
}

export function useMapBasemap(props: UseMapBasemapProps): UseMapBasemapReturn {
  const { getMap, getIsMapLoaded, onProjectionChanged, onStyleLoaded } = props;

  function getStyleKey(style: string | StyleSpecification): string {
    if (typeof style === 'string') {
      return style;
    }
    return style.name || 'inline-style';
  }

  const currentStyleKey = getStyleKey(basemapStyleStore.selectedStyleUrl);
  let lastAppliedStyleKey = $state<string | null>(currentStyleKey);
  let isStyleLoading = $state(false);
  let styleLoadHandler: (() => void) | null = null;
  let styleLoadStartTime = 0;

  function syncBasemapStyle(): void {
    const map = getMap();
    console.log('[BASEMAP] syncBasemapStyle called', {
      hasMap: !!map,
      isMapLoaded: getIsMapLoaded(),
      isStyleLoading
    });

    if (!map || !getIsMapLoaded()) return;

    if (isStyleLoading) {
      console.log('[BASEMAP] Style still loading, skipping');
      logger.debug('Style is still loading, skipping sync', LogCategory.MAP);
      return;
    }

    const style = basemapStyleStore.selectedStyleUrl;
    const styleKey = getStyleKey(style);

    if (styleKey === lastAppliedStyleKey) {
      console.log('[BASEMAP] Style already applied, skipping', { styleKey });
      return;
    }

    console.log('[BASEMAP] Applying new style', {
      from: lastAppliedStyleKey,
      to: styleKey
    });
    logger.debug('Changing basemap style', LogCategory.MAP, {
      from: lastAppliedStyleKey,
      to: styleKey
    });

    isStyleLoading = true;
    styleLoadStartTime = performance.now();

    if (styleLoadHandler) {
      map.off('styledata', styleLoadHandler);
    }

    styleLoadHandler = () => {
      const loadTime = performance.now() - styleLoadStartTime;
      console.log(`[BASEMAP] Style loaded in ${loadTime.toFixed(1)}ms`, { styleKey });
      isStyleLoading = false;
      lastAppliedStyleKey = styleKey;
      logger.debug('Basemap style loaded', LogCategory.MAP, { styleKey });

      if (styleLoadHandler) {
        map.off('styledata', styleLoadHandler);
        styleLoadHandler = null;
      }

      if (onStyleLoaded) {
        console.log('[BASEMAP] Calling onStyleLoaded callback');
        setTimeout(() => onStyleLoaded(), 50);
      }
    };

    map.once('styledata', styleLoadHandler);
    console.log('[BASEMAP] Calling map.setStyle()');
    map.setStyle(style);
  }

  function syncOSMRasterLayer(): void {
    const map = getMap();
    if (!map || !getIsMapLoaded() || isStyleLoading) return;

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

  function syncProjection(): void {
    const map = getMap();
    if (!map || !getIsMapLoaded()) return;

    const projection = mapProjectionStore.projection;
    map.setProjection({ type: projection });

    logger.debug('Map projection changed', LogCategory.MAP, { projection });

    if (onProjectionChanged) {
      setTimeout(() => onProjectionChanged(), 10);
    }
  }

  return {
    syncBasemapStyle,
    syncOSMRasterLayer,
    syncProjection,
    get isStyleLoading() {
      return isStyleLoading;
    }
  };
}
