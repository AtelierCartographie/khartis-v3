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
  syncLabelsVisibility: () => void;
  syncProjection: () => void;
  cleanup: () => void;
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
    logger.debug('syncBasemapStyle called', LogCategory.MAP, {
      hasMap: !!map,
      isMapLoaded: getIsMapLoaded(),
      isStyleLoading
    });

    if (!map || !getIsMapLoaded()) return;

    if (isStyleLoading) {
      logger.debug('Style still loading, skipping', LogCategory.MAP);
      return;
    }

    const style = basemapStyleStore.selectedStyleUrl;
    const styleKey = getStyleKey(style);

    if (styleKey === lastAppliedStyleKey) {
      logger.debug('Style already applied, skipping', LogCategory.MAP, {
        styleKey
      });
      return;
    }

    logger.debug('Applying new style', LogCategory.MAP, {
      from: lastAppliedStyleKey,
      to: styleKey
    });

    isStyleLoading = true;
    styleLoadStartTime = performance.now();

    if (styleLoadHandler) {
      map.off('style.load', styleLoadHandler);
    }

    styleLoadHandler = () => {
      const loadTime = performance.now() - styleLoadStartTime;
      logger.debug(
        `Style loaded in ${loadTime.toFixed(1)}ms`,
        LogCategory.MAP,
        { styleKey }
      );
      isStyleLoading = false;
      lastAppliedStyleKey = styleKey;

      if (styleLoadHandler) {
        map.off('style.load', styleLoadHandler);
        styleLoadHandler = null;
      }

      if (onStyleLoaded) {
        logger.debug('Calling onStyleLoaded callback', LogCategory.MAP);
        onStyleLoaded();
      }
    };

    // `style.load` fires once when the full style graph is ready.
    // Using `styledata` can flip the loading flag too early.
    map.once('style.load', styleLoadHandler);
    logger.debug('Calling map.setStyle()', LogCategory.MAP);
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

  function syncLabelsVisibility(): void {
    const map = getMap();
    if (!map || !getIsMapLoaded() || isStyleLoading) return;

    const show = basemapStyleStore.showLabels;
    const visibility = show ? 'visible' : 'none';

    try {
      const style = map.getStyle();
      if (!style?.layers) return;

      for (const layer of style.layers) {
        if (
          layer.type === 'symbol' &&
          layer.layout &&
          'text-field' in layer.layout &&
          layer.layout['text-field']
        ) {
          map.setLayoutProperty(layer.id, 'visibility', visibility);
        }
      }
    } catch {
      logger.warn('Failed to sync labels visibility', LogCategory.MAP);
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

  function cleanup(): void {
    const map = getMap();
    if (map && styleLoadHandler) {
      map.off('style.load', styleLoadHandler);
      styleLoadHandler = null;
    }
    isStyleLoading = false;
    lastAppliedStyleKey = null;
    logger.debug('Basemap hook cleanup completed', LogCategory.MAP);
  }

  return {
    syncBasemapStyle,
    syncOSMRasterLayer,
    syncLabelsVisibility,
    syncProjection,
    cleanup,
    get isStyleLoading() {
      return isStyleLoading;
    }
  };
}
