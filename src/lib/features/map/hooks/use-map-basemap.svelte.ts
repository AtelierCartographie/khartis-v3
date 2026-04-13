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
  syncGroupVisibility: () => void;
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
  let lastAppliedStyleKey: string | null = currentStyleKey;
  let lastAppliedOSMRasterKey: string | null = null;
  let isStyleLoading = $state(false);
  let styleLoadHandler: (() => void) | null = null;

  function getOSMRasterKey(): string | null {
    const osmBasemap = osmBasemapStore.activeOSMBasemap;
    const tileConfig = osmBasemapStore.tileConfig;

    if (!osmBasemap || !tileConfig) {
      return null;
    }

    return [
      osmBasemap.file,
      tileConfig.urlTemplate,
      tileConfig.minZoom,
      tileConfig.maxZoom,
      tileConfig.tileSize
    ].join('::');
  }

  function syncBasemapStyle(): void {
    const map = getMap();

    if (!map || !getIsMapLoaded()) return;

    if (isStyleLoading) return;

    const style = basemapStyleStore.selectedStyleUrl;
    const styleKey = getStyleKey(style);

    if (styleKey === lastAppliedStyleKey) return;

    logger.debug('Applying basemap style', LogCategory.MAP, {
      from: lastAppliedStyleKey,
      to: styleKey
    });

    isStyleLoading = true;

    if (styleLoadHandler) {
      map.off('style.load', styleLoadHandler);
    }

    let safetyTimeout: ReturnType<typeof setTimeout> | null = null;

    const completeStyleLoad = () => {
      if (safetyTimeout) {
        clearTimeout(safetyTimeout);
        safetyTimeout = null;
      }
      isStyleLoading = false;
      lastAppliedStyleKey = styleKey;

      if (styleLoadHandler) {
        map.off('style.load', styleLoadHandler);
        styleLoadHandler = null;
      }

      if (onStyleLoaded) {
        onStyleLoaded();
      }
    };

    styleLoadHandler = completeStyleLoad;

    // Safety timeout: if style.load never fires (e.g. network error),
    // unlock the loading flag after 10s to avoid permanent deadlock.
    safetyTimeout = setTimeout(() => {
      if (isStyleLoading) {
        logger.warn(
          'Basemap style.load timed out after 10s, unlocking',
          LogCategory.MAP,
          { styleKey }
        );
        completeStyleLoad();
      }
    }, 10_000);

    // `style.load` fires once when the full style graph is ready.
    // Using `styledata` can flip the loading flag too early.
    map.once('style.load', styleLoadHandler);

    try {
      map.setStyle(style, { diff: true });
    } catch (error) {
      logger.error(
        'setStyle() threw, unlocking style loading',
        LogCategory.MAP,
        error
      );
      completeStyleLoad();
    }
  }

  function syncOSMRasterLayer(): void {
    const map = getMap();
    if (!map || !getIsMapLoaded() || isStyleLoading) return;

    const osmBasemap = osmBasemapStore.activeOSMBasemap;
    const tileConfig = osmBasemapStore.tileConfig;
    const osmLayerId = `${OSMSourceId.RASTER}-layer`;
    const nextRasterKey = getOSMRasterKey();
    const hasRasterSource = Boolean(map.getSource(OSMSourceId.RASTER));
    const hasRasterLayer = Boolean(map.getLayer(osmLayerId));

    if (!nextRasterKey) {
      try {
        if (hasRasterLayer) map.removeLayer(osmLayerId);
        if (hasRasterSource) map.removeSource(OSMSourceId.RASTER);
      } catch {
        // Ignore cleanup errors
      }

      lastAppliedOSMRasterKey = null;
      return;
    }

    if (
      nextRasterKey === lastAppliedOSMRasterKey &&
      hasRasterSource &&
      hasRasterLayer
    ) {
      return;
    }

    if (osmBasemap && tileConfig) {
      const rasterSource = createOSMRasterSource(tileConfig);
      const rasterLayer = createOSMRasterLayer(OSMSourceId.RASTER);

      try {
        if (hasRasterLayer) map.removeLayer(osmLayerId);
        if (hasRasterSource) map.removeSource(OSMSourceId.RASTER);
        if (!map.getSource(OSMSourceId.RASTER)) {
          map.addSource(OSMSourceId.RASTER, rasterSource);
        }
        if (!map.getLayer(osmLayerId)) {
          map.addLayer(rasterLayer);
        }
      } catch (error) {
        logger.warn('Failed to add OSM raster layer', LogCategory.MAP, error);
      }

      lastAppliedOSMRasterKey = nextRasterKey;
      logger.debug('OSM raster basemap applied', LogCategory.MAP, {
        basemap: osmBasemap.file,
        title: osmBasemap.title_fr
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
        // Skip layers managed by the cartefacile group system
        if (
          (layer.metadata as Record<string, unknown> | undefined)?.[
            'cartefacile:group'
          ]
        )
          continue;

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

  function syncGroupVisibility(): void {
    const map = getMap();
    if (!map || !getIsMapLoaded() || isStyleLoading) return;

    const groupVisibility = basemapStyleStore.groupVisibility;

    try {
      const style = map.getStyle();
      if (!style?.layers) return;

      for (const layer of style.layers) {
        const group = (layer.metadata as Record<string, unknown> | undefined)?.[
          'cartefacile:group'
        ];
        if (typeof group === 'string' && group in groupVisibility) {
          map.setLayoutProperty(
            layer.id,
            'visibility',
            groupVisibility[group] ? 'visible' : 'none'
          );
        }
      }
    } catch {
      logger.warn('Failed to sync group visibility', LogCategory.MAP);
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
    lastAppliedOSMRasterKey = null;
    logger.debug('Basemap hook cleanup completed', LogCategory.MAP);
  }

  return {
    syncBasemapStyle,
    syncOSMRasterLayer,
    syncLabelsVisibility,
    syncGroupVisibility,
    syncProjection,
    cleanup,
    get isStyleLoading() {
      return isStyleLoading;
    }
  };
}
