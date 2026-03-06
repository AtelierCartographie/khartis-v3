import { Deck, OrthographicView } from '@deck.gl/core';
import type { DeckProps, View } from '@deck.gl/core';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { CanvasContext } from '@luma.gl/core';
import maplibregl from 'maplibre-gl';
import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';

export type DeckInstance = Deck<View | View[] | null>;
import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  BasemapStyle,
  DECK_VIEW_ID,
  DECK_CANVAS_ID,
  DECK_DEVICE_TYPE,
  getBasemapStyle
} from '../constants';
import { ViewMode } from '../constants/map.constants';
import { createHoverHandler, createClickHandler } from '../interactions';
import { projectionStore } from '../stores/projection.store.svelte';
import { mapProjectionStore } from '../stores/map-projection.store.svelte';
import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
import type { DeckOrthographicViewStateMap } from '../types';

interface OrthographicViewStateChangeParams {
  viewId: string;
  viewState: DeckOrthographicViewStateMap;
  interactionState: {
    inTransition?: boolean;
    isDragging?: boolean;
    isPanning?: boolean;
    isRotating?: boolean;
    isZooming?: boolean;
  };
  oldViewState?: DeckOrthographicViewStateMap;
}

export interface MapInitConfig {
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
}

export interface UseMapInitProps {
  onMapLoaded: () => void;
  onZoom: () => void;
  onMoveEnd: () => void;
  getActiveVisualizations?: () => import('$lib/features/commons/store/visualization.store.svelte').VisualizationConfig[];
  onOrthographicViewStateChanged?: (
    target: [number, number, number],
    zoom: number
  ) => void;
}

export interface UseMapInitReturn {
  initialize: (container: HTMLDivElement, viewMode?: ViewMode) => void;
  destroy: () => void;
  switchToMapLibreMode: () => void;
  switchToOrthographicMode: () => void;
  readonly map: maplibregl.Map | null;
  readonly deckOverlay: MapboxOverlay | null;
  readonly deckInstance: DeckInstance | null;
  readonly isMapLoaded: boolean;
  readonly viewMode: ViewMode;
}

const DEFAULT_CONFIG: MapInitConfig = {
  center: [0, 20],
  zoom: 1.5,
  minZoom: 0.5,
  maxZoom: 20
};

const ORTHOGRAPHIC_VIEW = new OrthographicView({
  id: DECK_VIEW_ID,
  flipY: false
});
let hasPatchedLumaCanvasContext = false;
let hasWebGL2Support: boolean | null = null;

function supportsWebGL2(): boolean {
  if (hasWebGL2Support !== null) {
    return hasWebGL2Support;
  }

  if (typeof document === 'undefined') {
    hasWebGL2Support = false;
    return hasWebGL2Support;
  }

  try {
    const canvas = document.createElement('canvas');
    hasWebGL2Support = Boolean(canvas.getContext('webgl2'));
  } catch {
    hasWebGL2Support = false;
  }

  return hasWebGL2Support;
}

function patchLumaCanvasContextResizeGuard(): void {
  if (hasPatchedLumaCanvasContext) {
    return;
  }

  const prototype = CanvasContext?.prototype as
    | {
        getMaxDrawingBufferSize?: () => [number, number];
      }
    | undefined;

  if (!prototype || typeof prototype.getMaxDrawingBufferSize !== 'function') {
    return;
  }

  hasPatchedLumaCanvasContext = true;

  prototype.getMaxDrawingBufferSize = function (this: {
    device?: { limits?: { maxTextureDimension2D?: number } };
    canvas?: { width?: number; height?: number };
  }): [number, number] {
    const maxTextureDimension = this.device?.limits?.maxTextureDimension2D;

    if (
      typeof maxTextureDimension === 'number' &&
      Number.isFinite(maxTextureDimension) &&
      maxTextureDimension > 0
    ) {
      return [maxTextureDimension, maxTextureDimension];
    }

    const fallbackWidth = Math.max(1, Math.floor(this.canvas?.width ?? 1));
    const fallbackHeight = Math.max(1, Math.floor(this.canvas?.height ?? 1));
    const fallback = Math.max(fallbackWidth, fallbackHeight);

    return [fallback, fallback];
  };
}

function createDeckWithDeferredResizeObserver(
  deckFactory: () => DeckInstance
): DeckInstance {
  if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
    return deckFactory();
  }

  const globalWindow = window as unknown as Window &
    typeof globalThis & {
      ResizeObserver: typeof ResizeObserver;
    };
  const nativeDescriptor = Object.getOwnPropertyDescriptor(
    globalWindow,
    'ResizeObserver'
  );
  const NativeResizeObserver = globalWindow.ResizeObserver;
  type ResizeObserverCtor = new (
    callback: ResizeObserverCallback
  ) => ResizeObserver;

  const DeferredResizeObserver: ResizeObserverCtor = function (
    this: ResizeObserver,
    callback: ResizeObserverCallback
  ): ResizeObserver {
    return new NativeResizeObserver((entries, observer) => {
      queueMicrotask(() => callback(entries, observer));
    });
  } as unknown as ResizeObserverCtor;

  DeferredResizeObserver.prototype = NativeResizeObserver.prototype;

  try {
    Object.defineProperty(globalWindow, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: DeferredResizeObserver
    });
    return deckFactory();
  } catch {
    return deckFactory();
  } finally {
    if (nativeDescriptor) {
      Object.defineProperty(globalWindow, 'ResizeObserver', nativeDescriptor);
    } else {
      Object.defineProperty(globalWindow, 'ResizeObserver', {
        configurable: true,
        writable: true,
        value: NativeResizeObserver
      });
    }
  }
}

export function useMapInit(props: UseMapInitProps): UseMapInitReturn {
  const {
    onMapLoaded,
    onZoom,
    onMoveEnd,
    getActiveVisualizations,
    onOrthographicViewStateChanged
  } = props;
  patchLumaCanvasContextResizeGuard();

  let map = $state<maplibregl.Map | null>(null);
  let deckOverlay = $state<MapboxOverlay | null>(null);
  let deckInstance = $state<DeckInstance | null>(null);
  let orthographicFallbackCanvas = $state<HTMLCanvasElement | null>(null);
  let isMapLoaded = $state(false);
  const shouldUseMapLibre =
    osmBasemapStore.isActive || basemapStyleStore.requiresMapLibre;
  const initialViewMode: ViewMode = shouldUseMapLibre
    ? ViewMode.MAPLIBRE
    : ViewMode.ORTHOGRAPHIC;
  let currentViewMode = $state<ViewMode>(initialViewMode);
  let containerRef = $state<HTMLDivElement | null>(null);

  function ensureOrthographicFallbackCanvas(
    container: HTMLDivElement
  ): HTMLCanvasElement {
    const staleCanvases = container.querySelectorAll(
      'canvas#deckgl-overlay'
    ) as NodeListOf<HTMLCanvasElement>;
    for (const staleCanvas of staleCanvases) {
      if (staleCanvas !== orthographicFallbackCanvas) {
        staleCanvas.remove();
      }
    }

    if (
      orthographicFallbackCanvas &&
      orthographicFallbackCanvas.parentElement === container
    ) {
      return orthographicFallbackCanvas;
    }

    orthographicFallbackCanvas?.remove();

    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.id = DECK_CANVAS_ID;
    fallbackCanvas.width = Math.max(1, container.clientWidth || 800);
    fallbackCanvas.height = Math.max(1, container.clientHeight || 600);
    Object.assign(fallbackCanvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none'
    });

    container.appendChild(fallbackCanvas);
    orthographicFallbackCanvas = fallbackCanvas;

    return fallbackCanvas;
  }

  function removeOrthographicFallbackCanvas(): void {
    if (orthographicFallbackCanvas) {
      orthographicFallbackCanvas.remove();
      orthographicFallbackCanvas = null;
    }
  }

  function initializeOrthographic(container: HTMLDivElement): void {
    logger.info('Initializing Deck.gl with OrthographicView', LogCategory.MAP);

    containerRef = container;
    isMapLoaded = false;
    removeOrthographicFallbackCanvas();

    const canvasSize = {
      width: container.clientWidth || 800,
      height: container.clientHeight || 600
    };
    projectionStore.updateCanvasSize(canvasSize);

    if (!supportsWebGL2()) {
      ensureOrthographicFallbackCanvas(container);
      deckInstance = null;
      currentViewMode = ViewMode.ORTHOGRAPHIC;
      isMapLoaded = true;
      mapInstanceStore.setDeckInstance(null);
      mapInstanceStore.setMapLoaded(true);
      logger.warn(
        'WebGL2 unavailable: using static orthographic fallback canvas',
        LogCategory.MAP
      );
      onMapLoaded();
      return;
    }

    const handleViewStateChange = ({
      viewState,
      interactionState
    }: OrthographicViewStateChangeParams): DeckOrthographicViewStateMap => {
      if (viewState.main) {
        mapInstanceStore.updateDeckViewState({
          target: viewState.main.target,
          zoom: viewState.main.zoom
        });

        if (
          onOrthographicViewStateChanged &&
          (interactionState.isDragging ||
            interactionState.isPanning ||
            interactionState.isZooming)
        ) {
          onOrthographicViewStateChanged(
            viewState.main.target,
            viewState.main.zoom
          );
        }
      }
      onZoom();
      return viewState;
    };

    const orthographicDeck = createDeckWithDeferredResizeObserver(
      () =>
        new Deck({
          parent: container,
          deviceProps: {
            type: DECK_DEVICE_TYPE
          },
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
          controller: { scrollZoom: false, doubleClickZoom: false },
          layers: [],
          onHover: createHoverHandler(getActiveVisualizations),
          onClick: createClickHandler(getActiveVisualizations),
          onViewStateChange: handleViewStateChange as DeckProps<
            [OrthographicView]
          >['onViewStateChange'],
          onLoad: () => {
            // Ignore late callbacks from a stale deck instance during view switches.
            if (deckInstance !== orthographicDeck) {
              return;
            }

            isMapLoaded = true;
            mapInstanceStore.setMapLoaded(true);
            logger.success('Deck.gl OrthographicView ready', LogCategory.MAP);
            onMapLoaded();
          },
          onError: (error, layer) => {
            logger.error(
              'Deck.gl orthographic runtime error',
              LogCategory.MAP,
              {
                error,
                layerId: layer?.id
              }
            );
          },
          onResize: ({ width, height }) => {
            projectionStore.updateCanvasSize({ width, height });
          }
        })
    );

    deckInstance = orthographicDeck;
    currentViewMode = ViewMode.ORTHOGRAPHIC;
    mapInstanceStore.setDeckInstance(orthographicDeck);
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__deck = orthographicDeck;
    }
  }

  let _initialStyleKey: string | null = null;

  function initializeMapLibre(
    container: HTMLDivElement,
    config: MapInitConfig = DEFAULT_CONFIG
  ): void {
    const style = basemapStyleStore.selectedStyleUrl;
    _initialStyleKey =
      typeof style === 'string' ? style : style.name || 'inline-style';

    logger.info('Initializing MapLibre + Deck.gl overlay', LogCategory.MAP);

    containerRef = container;
    currentViewMode = ViewMode.MAPLIBRE;
    removeOrthographicFallbackCanvas();

    map = new maplibregl.Map({
      container,
      style,
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
        onHover: createHoverHandler(getActiveVisualizations),
        onClick: createClickHandler(getActiveVisualizations)
      } as DeckProps);

      map.addControl(deckOverlay as maplibregl.IControl);
      map.addControl(
        new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
        'bottom-left'
      );

      map.setProjection({ type: mapProjectionStore.projection });

      isMapLoaded = true;
      mapInstanceStore.setMapInstance(map);
      mapInstanceStore.setDeckOverlay(deckOverlay);
      mapInstanceStore.setMapLoaded(true);
      logger.success('MapLibre + Deck.gl ready', LogCategory.MAP);
      if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).__maplibreMap = map;
        (window as unknown as Record<string, unknown>).__deck = deckOverlay;
      }

      onMapLoaded();

      requestAnimationFrame(() => {
        map?.resize();
      });
    });

    map.on('error', (e) => {
      logger.error(
        'MapLibre error, falling back to blank style',
        LogCategory.MAP,
        e
      );
      if (!isMapLoaded && map) {
        map.setStyle(
          getBasemapStyle(
            BasemapStyle.BLANK_WHITE
          ) as maplibregl.StyleSpecification
        );
      }
    });

    map.on('zoom', onZoom);
    map.on('moveend', onMoveEnd);
    map.on('zoomend', onMoveEnd);
  }

  function initialize(
    container: HTMLDivElement,
    viewMode: ViewMode = ViewMode.ORTHOGRAPHIC
  ): void {
    if (viewMode === ViewMode.ORTHOGRAPHIC) {
      initializeOrthographic(container);
    } else {
      initializeMapLibre(container);
    }
  }

  function switchToMapLibreMode(): void {
    if (currentViewMode === ViewMode.MAPLIBRE || !containerRef) {
      return;
    }

    destroy();
    initializeMapLibre(containerRef);
  }

  function switchToOrthographicMode(): void {
    if (currentViewMode === ViewMode.ORTHOGRAPHIC || !containerRef) {
      return;
    }

    destroy();
    initializeOrthographic(containerRef);
  }

  function destroy(): void {
    // Clear reactive refs first so concurrent effects cannot read stale
    // Deck/Map instances during teardown.
    const mapToRemove = map;
    const deckToFinalize = deckInstance;
    map = null;
    deckInstance = null;
    deckOverlay = null;
    isMapLoaded = false;

    if (mapToRemove) {
      mapToRemove.remove();
    }
    if (deckToFinalize) {
      try {
        deckToFinalize.finalize();
      } catch (error) {
        logger.warn(
          'Deck finalize raised an error during teardown',
          LogCategory.MAP,
          error
        );
      }
    }
    removeOrthographicFallbackCanvas();
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
