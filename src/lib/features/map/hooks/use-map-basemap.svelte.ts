import type {
  Map as MapLibreMap,
  StyleSpecification,
  TransformStyleFunction
} from 'maplibre-gl';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { OSMSourceId } from '../constants';
import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
import { mapLoadingStore } from '../stores/map-loading.store.svelte';
import { mapProjectionStore } from '../stores/map-projection.store.svelte';
import {
  createOSMRasterSource,
  createOSMRasterLayer
} from '../services/osm-tile.service';

export interface UseMapBasemapProps {
  getMap: () => MapLibreMap | null;
  getIsMapLoaded: () => boolean;
  onProjectionChanged?: () => void;
  onStyleChangeRequested?: () => void;
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
  const {
    getMap,
    getIsMapLoaded,
    onProjectionChanged,
    onStyleChangeRequested,
    onStyleLoaded
  } = props;
  const REFERENCE_BASEMAP_LOAD_TIMEOUT_MS = 10_000;

  function getStyleKey(style: string | StyleSpecification): string {
    if (typeof style === 'string') {
      return style;
    }
    return style.name || 'inline-style';
  }

  const currentStyleKey = getStyleKey(basemapStyleStore.selectedStyleUrl);
  let lastAppliedStyleKey: string | null = currentStyleKey;
  let loadingStyleKey: string | null = null;
  let pendingStyleSync = false;
  let pendingStyleSyncScheduled = false;
  let lastAppliedOSMRasterKey: string | null = null;
  let isStyleLoading = $state(false);
  let styleLoadHandler: (() => void) | null = null;
  let styleIdleHandler: (() => void) | null = null;
  let styleSafetyTimeout: ReturnType<typeof setTimeout> | null = null;
  let finishStyleLoading: (() => void) | null = null;
  let rasterLoadMap: MapLibreMap | null = null;
  let rasterIdleHandler: (() => void) | null = null;
  let rasterSafetyTimeout: ReturnType<typeof setTimeout> | null = null;
  let finishRasterLoading: (() => void) | null = null;

  function beginReferenceBasemapLoading(): () => void {
    let hasEnded = false;
    mapLoadingStore.beginReferenceBasemapLoading();

    return () => {
      if (hasEnded) {
        return;
      }

      hasEnded = true;
      mapLoadingStore.endReferenceBasemapLoading();
    };
  }

  function endStyleLoading(): void {
    finishStyleLoading?.();
    finishStyleLoading = null;
  }

  function completeRasterLoad(map: MapLibreMap | null = rasterLoadMap): void {
    if (rasterSafetyTimeout) {
      clearTimeout(rasterSafetyTimeout);
      rasterSafetyTimeout = null;
    }

    if (map && rasterIdleHandler) {
      map.off('idle', rasterIdleHandler);
    }

    rasterLoadMap = null;
    rasterIdleHandler = null;
    finishRasterLoading?.();
    finishRasterLoading = null;
  }

  function beginRasterLoad(map: MapLibreMap, rasterKey: string): void {
    completeRasterLoad(map);

    rasterLoadMap = map;
    finishRasterLoading = beginReferenceBasemapLoading();
    rasterIdleHandler = () => completeRasterLoad(map);
    map.once('idle', rasterIdleHandler);
    rasterSafetyTimeout = setTimeout(() => {
      logger.warn(
        'OSM raster load timed out after 10s, unlocking',
        LogCategory.MAP,
        { rasterKey }
      );
      completeRasterLoad(map);
    }, REFERENCE_BASEMAP_LOAD_TIMEOUT_MS);
  }

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

  function schedulePendingStyleSync(): void {
    if (pendingStyleSyncScheduled) {
      return;
    }

    pendingStyleSyncScheduled = true;
    queueMicrotask(() => {
      pendingStyleSyncScheduled = false;
      syncBasemapStyle();
    });
  }

  function syncBasemapStyle(): void {
    const map = getMap();
    const style = basemapStyleStore.selectedStyleUrl;
    const styleKey = getStyleKey(style);

    if (!map || !getIsMapLoaded()) return;

    if (isStyleLoading) {
      if (styleKey !== loadingStyleKey) {
        pendingStyleSync = true;
      }
      return;
    }

    if (styleKey === lastAppliedStyleKey) {
      syncProjection();
      return;
    }

    isStyleLoading = true;
    loadingStyleKey = styleKey;
    pendingStyleSync = false;
    endStyleLoading();
    completeRasterLoad(map);
    finishStyleLoading = beginReferenceBasemapLoading();

    if (styleLoadHandler) {
      map.off('style.load', styleLoadHandler);
    }
    if (styleIdleHandler) {
      map.off('idle', styleIdleHandler);
    }

    const completeStyleLoad = (wasTimeout = false) => {
      if (styleSafetyTimeout) {
        clearTimeout(styleSafetyTimeout);
        styleSafetyTimeout = null;
      }
      isStyleLoading = false;
      loadingStyleKey = null;
      endStyleLoading();
      lastAppliedStyleKey = styleKey;

      if (styleLoadHandler) {
        map.off('style.load', styleLoadHandler);
        styleLoadHandler = null;
      }
      if (styleIdleHandler) {
        map.off('idle', styleIdleHandler);
        styleIdleHandler = null;
      }

      const latestStyleKey = getStyleKey(basemapStyleStore.selectedStyleUrl);
      if (pendingStyleSync && latestStyleKey !== lastAppliedStyleKey) {
        pendingStyleSync = false;
        schedulePendingStyleSync();
        return;
      }
      pendingStyleSync = false;

      if (onStyleLoaded && !wasTimeout) {
        onStyleLoaded();
      }
    };

    styleLoadHandler = () => completeStyleLoad(false);
    styleIdleHandler = () => completeStyleLoad(false);

    styleSafetyTimeout = setTimeout(() => {
      if (isStyleLoading) {
        logger.warn(
          'Basemap style.load timed out after 10s, unlocking',
          LogCategory.MAP,
          { styleKey }
        );
        completeStyleLoad(true);
      }
    }, REFERENCE_BASEMAP_LOAD_TIMEOUT_MS);

    map.once('style.load', styleLoadHandler);
    map.once('idle', styleIdleHandler);

    const stripStyleProjection: TransformStyleFunction = (previous, next) => {
      if ('projection' in next) {
        const { projection: _, ...rest } = next;
        return rest as StyleSpecification;
      }
      return next;
    };

    try {
      map.setStyle(style, {
        diff: false,
        transformStyle: stripStyleProjection
      });
      onStyleChangeRequested?.();
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
    if (!map || !getIsMapLoaded() || isStyleLoading || !map.isStyleLoaded())
      return;

    const osmBasemap = osmBasemapStore.activeOSMBasemap;
    const tileConfig = osmBasemapStore.tileConfig;
    const osmLayerId = `${OSMSourceId.RASTER}-layer`;
    const nextRasterKey = getOSMRasterKey();
    const hasRasterSource = Boolean(map.getSource(OSMSourceId.RASTER));
    const hasRasterLayer = Boolean(map.getLayer(osmLayerId));

    if (!nextRasterKey) {
      completeRasterLoad(map);

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
        beginRasterLoad(map, nextRasterKey);
      } catch (error) {
        logger.warn('Failed to add OSM raster layer', LogCategory.MAP, error);
        completeRasterLoad(map);
      }

      lastAppliedOSMRasterKey = nextRasterKey;
    }
  }

  function syncLabelsVisibility(): void {
    const map = getMap();
    if (!map || !getIsMapLoaded() || isStyleLoading || !map.isStyleLoaded())
      return;

    const show = basemapStyleStore.showLabels;
    const visibility = show ? 'visible' : 'none';

    try {
      const style = map.getStyle();
      if (!style?.layers) return;

      for (const layer of style.layers) {
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
    if (!map || !getIsMapLoaded() || isStyleLoading || !map.isStyleLoaded())
      return;

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
    if (!map || !getIsMapLoaded()) {
      return;
    }

    const projection = mapProjectionStore.projection;
    try {
      map.setProjection({ type: projection });
    } catch (error) {
      logger.warn('Failed to sync MapLibre projection', LogCategory.MAP, error);
      return;
    }

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
    if (map && styleIdleHandler) {
      map.off('idle', styleIdleHandler);
      styleIdleHandler = null;
    }
    if (styleSafetyTimeout) {
      clearTimeout(styleSafetyTimeout);
      styleSafetyTimeout = null;
    }
    endStyleLoading();
    completeRasterLoad(map);
    isStyleLoading = false;
    loadingStyleKey = null;
    pendingStyleSync = false;
    pendingStyleSyncScheduled = false;
    lastAppliedStyleKey = null;
    lastAppliedOSMRasterKey = null;
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
