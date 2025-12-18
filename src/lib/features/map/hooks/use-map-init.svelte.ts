import { Deck, OrthographicView } from '@deck.gl/core';
import type { DeckProps } from '@deck.gl/core';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import maplibregl from 'maplibre-gl';
import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { BASEMAP_STYLES, DEFAULT_BASEMAP_STYLE } from '../constants';
import { createTooltipHandler } from '../interactions';
import { basemapService } from '../services/basemap.service.svelte';
import { projectionStore } from '../stores/projection.store.svelte';

export type ViewMode = 'orthographic' | 'maplibre';

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
  initialize: (container: HTMLDivElement, viewMode?: ViewMode) => void;
  destroy: () => void;
  switchToMapLibreMode: () => void;
  switchToOrthographicMode: () => void;
  readonly map: maplibregl.Map | null;
  readonly deckOverlay: MapboxOverlay | null;
  readonly deckInstance: Deck | null;
  readonly isMapLoaded: boolean;
  readonly viewMode: ViewMode;
}

const DEFAULT_CONFIG: MapInitConfig = {
  center: [0, 20],
  zoom: 1.5,
  minZoom: 0.5,
  maxZoom: 20
};

const ORTHOGRAPHIC_VIEW = new OrthographicView({ id: 'main', flipY: false });

export function useMapInit(props: UseMapInitProps): UseMapInitReturn {
  const { onMapLoaded, onWorldBaseLoaded, onZoom, onMoveEnd } = props;

  let map = $state<maplibregl.Map | null>(null);
  let deckOverlay = $state<MapboxOverlay | null>(null);
  let deckInstance = $state<Deck | null>(null);
  let isMapLoaded = $state(false);
  let currentViewMode = $state<ViewMode>('orthographic');
  let containerRef = $state<HTMLDivElement | null>(null);

  function initializeOrthographic(container: HTMLDivElement): void {
    logger.info('Initializing Deck.gl with OrthographicView', LogCategory.MAP);

    containerRef = container;

    const canvasSize = {
      width: container.clientWidth || 800,
      height: container.clientHeight || 600
    };
    projectionStore.updateCanvasSize(canvasSize);

    deckInstance = new Deck({
      parent: container,
      views: [ORTHOGRAPHIC_VIEW],
      initialViewState: {
        main: {
          target: [0, 0, 0],
          zoom: 0,
          minZoom: -10,
          maxZoom: 10
        }
      },
      width: '100%',
      height: '100%',
      controller: true,
      layers: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getTooltip: createTooltipHandler() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onViewStateChange: ({ viewState }: { viewState: any }) => {
        if (viewState.main) {
          mapInstanceStore.updateDeckViewState({
            target: viewState.main.target,
            zoom: viewState.main.zoom
          });
        }
        onZoom();
        return viewState;
      },
      onResize: ({ width, height }) => {
        projectionStore.updateCanvasSize({ width, height });
      },
      onAfterRender: () => {
        if (!isMapLoaded) {
          isMapLoaded = true;
          mapInstanceStore.setDeckInstance(deckInstance);
          mapInstanceStore.setMapLoaded(true);
          logger.success('Deck.gl OrthographicView ready', LogCategory.MAP);
          onMapLoaded();
          loadDefaultBasemap();
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any as Deck;

    currentViewMode = 'orthographic';
  }

  function initializeMapLibre(
    container: HTMLDivElement,
    config: MapInitConfig = DEFAULT_CONFIG
  ): void {
    logger.info('Initializing MapLibre + Deck.gl overlay', LogCategory.MAP);

    containerRef = container;

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
      logger.success('MapLibre + Deck.gl ready', LogCategory.MAP);

      onMapLoaded();
      loadDefaultBasemap();

      requestAnimationFrame(() => {
        map?.resize();
      });
    });

    map.on('zoom', onZoom);
    map.on('moveend', onMoveEnd);
    map.on('zoomend', onMoveEnd);
    currentViewMode = 'maplibre';
  }

  function loadDefaultBasemap(): void {
    basemapService.loadDefaultBasemap().then((basemap) => {
      if (basemap?.geometryTable) {
        onWorldBaseLoaded(basemap.geometryTable);
        logger.info('World base layer loaded', LogCategory.MAP, {
          rows: basemap.geometryTable.numRows
        });
      }
    });
  }

  function initialize(
    container: HTMLDivElement,
    viewMode: ViewMode = 'orthographic'
  ): void {
    if (viewMode === 'orthographic') {
      initializeOrthographic(container);
    } else {
      initializeMapLibre(container);
    }
  }

  function switchToMapLibreMode(): void {
    if (currentViewMode === 'maplibre' || !containerRef) return;

    destroy();
    initializeMapLibre(containerRef);
  }

  function switchToOrthographicMode(): void {
    if (currentViewMode === 'orthographic' || !containerRef) return;

    destroy();
    initializeOrthographic(containerRef);
  }

  function destroy(): void {
    if (map) {
      map.remove();
      map = null;
    }
    if (deckInstance) {
      deckInstance.finalize();
      deckInstance = null;
    }
    deckOverlay = null;
    isMapLoaded = false;
    projectionStore.reset();
    mapInstanceStore.reset();
    logger.info('Map destroyed', LogCategory.MAP);
  }

  return {
    initialize,
    destroy,
    switchToMapLibreMode,
    switchToOrthographicMode,
    get map() {
      return map;
    },
    get deckOverlay() {
      return deckOverlay;
    },
    get deckInstance() {
      return deckInstance;
    },
    get isMapLoaded() {
      return isMapLoaded;
    },
    get viewMode() {
      return currentViewMode;
    }
  };
}
