import type { DeckProps } from '@deck.gl/core';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import maplibregl from 'maplibre-gl';
import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { BASEMAP_STYLES, DEFAULT_BASEMAP_STYLE } from '../constants';
import { createTooltipHandler } from '../interactions';
import { basemapService } from '../services/basemap.service.svelte';

export interface MapInitConfig {
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
}

export interface UseMapInitProps {
  onMapLoaded: () => void;
  onWorldBaseLoaded: (table: ArrowTable) => void;
  onZoom: () => void;
  onMoveEnd: () => void;
}

export interface UseMapInitReturn {
  initialize: (container: HTMLDivElement) => void;
  destroy: () => void;
  readonly map: maplibregl.Map | null;
  readonly deckOverlay: MapboxOverlay | null;
  readonly isMapLoaded: boolean;
}

const DEFAULT_CONFIG: MapInitConfig = {
  center: [0, 20],
  zoom: 1.5,
  minZoom: 0.5,
  maxZoom: 20
};

export function useMapInit(props: UseMapInitProps): UseMapInitReturn {
  const { onMapLoaded, onWorldBaseLoaded, onZoom, onMoveEnd } = props;

  let map = $state<maplibregl.Map | null>(null);
  let deckOverlay = $state<MapboxOverlay | null>(null);
  let isMapLoaded = $state(false);

  function initialize(
    container: HTMLDivElement,
    config: MapInitConfig = DEFAULT_CONFIG
  ): void {
    logger.info('Mounting Deck.gl map component', LogCategory.MAP);

    map = new maplibregl.Map({
      container,
      style: BASEMAP_STYLES[DEFAULT_BASEMAP_STYLE],
      center: config.center,
      zoom: config.zoom,
      minZoom: config.minZoom,
      maxZoom: config.maxZoom,
      pitch: 0,
      bearing: 0,
      interactive: true,
      scrollZoom: true,
      dragPan: true,
      dragRotate: false,
      doubleClickZoom: true,
      touchZoomRotate: true
    });

    map.on('load', () => {
      if (!map) return;

      deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: [],
        getTooltip: createTooltipHandler()
      } as DeckProps);

      map.addControl(deckOverlay as maplibregl.IControl);
      map.addControl(
        new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
        'bottom-left'
      );

      isMapLoaded = true;
      mapInstanceStore.setMapInstance(map);
      mapInstanceStore.setDeckOverlay(deckOverlay);
      mapInstanceStore.setMapLoaded(true);
      logger.success('Maplibre + Deck.gl ready', LogCategory.MAP);

      onMapLoaded();

      basemapService.loadDefaultBasemap().then((basemap) => {
        if (basemap?.geometryTable) {
          onWorldBaseLoaded(basemap.geometryTable);
          logger.info('World base layer loaded', LogCategory.MAP, {
            rows: basemap.geometryTable.numRows
          });
        }
      });

      // Trigger resize to handle CSS transform on parent container
      requestAnimationFrame(() => {
        map?.resize();
      });
    });

    map.on('zoom', onZoom);
    map.on('moveend', onMoveEnd);
    map.on('zoomend', onMoveEnd);
  }

  function destroy(): void {
    if (map) {
      map.remove();
      map = null;
    }
    deckOverlay = null;
    isMapLoaded = false;
    mapInstanceStore.reset();
    logger.info('Deck.gl map destroyed', LogCategory.MAP);
  }

  return {
    initialize,
    destroy,
    get map() {
      return map;
    },
    get deckOverlay() {
      return deckOverlay;
    },
    get isMapLoaded() {
      return isMapLoaded;
    }
  };
}
