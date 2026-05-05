import { Deck, OrthographicView } from '@deck.gl/core';
import type { DeckProps, View } from '@deck.gl/core';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { CanvasContext } from '@luma.gl/core';
import maplibregl from 'maplibre-gl';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { EnvironmentUtils } from '$lib/features/commons/utils/environment.utils';

export type DeckInstance = Deck<View | View[] | null>;
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
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
import { mapProjectionStore } from '../stores/map-projection.store.svelte';
import {
  deckDebugStore,
  type DeckDebugMetrics
} from '../stores/deck-debug.store.svelte';
import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
import {
  DEFAULT_MAP_BASE_ZOOM,
  resolveMapZoomBounds,
  resolveOrthographicZoomBounds
} from '../utils/map-zoom.utils';
import { shouldUseMapLibreInterleaved } from '../utils/render-engine.utils';
import { getBrowserMaxRenderBufferSizePx } from '../utils/render-pixel-ratio';
import type {
  DeckOrthographicViewStateMap,
  OrthographicMainViewState
} from '../types';

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
  getActiveVisualizations?: () => import('$lib/features/commons/stores/visualization.store.svelte').VisualizationConfig[];
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
  setRenderPixelRatio: (pixelRatio: number) => void;
  readonly map: maplibregl.Map | null;
  readonly deckOverlay: MapboxOverlay | null;
  readonly deckInstance: DeckInstance | null;
  readonly isMapLoaded: boolean;
  readonly viewMode: ViewMode;
}

const DEFAULT_MAP_ZOOM_BOUNDS = resolveMapZoomBounds(DEFAULT_MAP_BASE_ZOOM);
const DEFAULT_ORTHOGRAPHIC_ZOOM_BOUNDS = resolveOrthographicZoomBounds();
const DEFAULT_CONFIG: MapInitConfig = {
  center: [0, 20],
  zoom: DEFAULT_MAP_BASE_ZOOM,
  minZoom: DEFAULT_MAP_ZOOM_BOUNDS.minZoom,
  maxZoom: DEFAULT_MAP_ZOOM_BOUNDS.maxZoom
};

const ORTHOGRAPHIC_VIEW = new OrthographicView({
  id: DECK_VIEW_ID,
  flipY: false
});
const DEFAULT_RENDER_PIXEL_RATIO = 1;
const IS_DEV = import.meta.env.DEV;

function isDeckDebugEnabled(): boolean {
  return IS_DEV || EnvironmentUtils.hasPreproductionUrlMarker();
}

function getInitialRenderPixelRatio(): number {
  return typeof window !== 'undefined'
    ? window.devicePixelRatio || DEFAULT_RENDER_PIXEL_RATIO
    : DEFAULT_RENDER_PIXEL_RATIO;
}

let hasPatchedLumaCanvasContext = false;
let hasWebGL2Support: boolean | null = null;

export function supportsWebGL2(): boolean {
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

export function patchLumaCanvasContextResizeGuard(): void {
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

export function createDeckWithDeferredResizeObserver(
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
  let renderPixelRatio = $state(getInitialRenderPixelRatio());
  const maxRenderBufferSizePx = getBrowserMaxRenderBufferSizePx();
  const shouldUseMapLibre = shouldUseMapLibreInterleaved({
    requiresMapLibre: basemapStyleStore.requiresMapLibre,
    hasOSMBasemap: osmBasemapStore.isActive
  });
  const initialViewMode: ViewMode = shouldUseMapLibre
    ? ViewMode.MAPLIBRE
    : ViewMode.ORTHOGRAPHIC;
  let currentViewMode = $state<ViewMode>(initialViewMode);
  let containerRef = $state<HTMLDivElement | null>(null);

  function syncDeckDebugState(
    viewMode: ViewMode,
    canvasSize: { width: number; height: number } | null = null,
    clearMetrics = false
  ): void {
    if (!isDeckDebugEnabled()) {
      return;
    }

    deckDebugStore.setViewMode(viewMode);
    deckDebugStore.setRenderPixelRatio(renderPixelRatio);

    if (canvasSize) {
      deckDebugStore.setCanvasSize(canvasSize);
    }

    if (clearMetrics) {
      deckDebugStore.setMetrics(null);
    }
  }

  function handleDeckMetrics(metrics: DeckDebugMetrics): void {
    if (!isDeckDebugEnabled()) {
      return;
    }

    deckDebugStore.setViewMode(currentViewMode);
    deckDebugStore.setRenderPixelRatio(renderPixelRatio);
    deckDebugStore.setMetrics(metrics);
  }

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

  function normalizeRenderPixelRatio(pixelRatio: number): number {
    return Number.isFinite(pixelRatio) && pixelRatio > 0
      ? pixelRatio
      : DEFAULT_RENDER_PIXEL_RATIO;
  }

  function setRenderPixelRatio(pixelRatio: number): void {
    const nextPixelRatio = normalizeRenderPixelRatio(pixelRatio);

    if (Math.abs(renderPixelRatio - nextPixelRatio) < 0.001) {
      return;
    }

    renderPixelRatio = nextPixelRatio;
    syncDeckDebugState(currentViewMode);

    if (currentViewMode === ViewMode.ORTHOGRAPHIC && deckInstance) {
      deckInstance.setProps({ useDevicePixels: nextPixelRatio });
      deckInstance.redraw('pageZoomPixelRatio');

      requestAnimationFrame(() => {
        if (deckInstance) {
          deckInstance.redraw('pageZoomPixelRatioFrame');
        }
      });

      return;
    }

    if (currentViewMode === ViewMode.MAPLIBRE && map) {
      map.setPixelRatio(nextPixelRatio);
      map.triggerRepaint();

      requestAnimationFrame(() => {
        map?.triggerRepaint();
      });
    }
  }

  function initializeOrthographic(container: HTMLDivElement): void {
    logger.info(
      'Initializing Deck.gl standalone render engine',
      LogCategory.MAP
    );

    containerRef = container;
    isMapLoaded = false;
    removeOrthographicFallbackCanvas();

    const canvasSize = {
      width: container.clientWidth || 800,
      height: container.clientHeight || 600
    };
    syncDeckDebugState(ViewMode.ORTHOGRAPHIC, canvasSize, true);

    if (!supportsWebGL2()) {
      ensureOrthographicFallbackCanvas(container);
      deckInstance = null;
      currentViewMode = ViewMode.ORTHOGRAPHIC;
      isMapLoaded = true;
      mapInstanceStore.setDeckInstance(null);
      mapInstanceStore.setMapLoaded(true);
      logger.warn(
        'WebGL2 unavailable: using static Deck.gl fallback canvas',
        LogCategory.MAP
      );
      onMapLoaded();
      return;
    }

    const handleViewStateChange = ({
      viewState,
      interactionState
    }: OrthographicViewStateChangeParams): OrthographicMainViewState => {
      // Deck.gl passes the individual view's state as a flat object
      // ({ target, zoom, … }), NOT nested under the view ID.
      const vs: OrthographicMainViewState =
        (viewState as unknown as DeckOrthographicViewStateMap).main ??
        (viewState as unknown as OrthographicMainViewState);

      const isUserInteraction =
        interactionState.isDragging ||
        interactionState.isPanning ||
        interactionState.isZooming;

      mapInstanceStore.updateDeckViewState(
        { target: vs.target, zoom: vs.zoom },
        isUserInteraction
      );

      if (onOrthographicViewStateChanged && isUserInteraction) {
        onOrthographicViewStateChanged(vs.target, vs.zoom);
      }

      onZoom();
      return viewState as unknown as OrthographicMainViewState;
    };
    const hoverHandler = createHoverHandler(getActiveVisualizations);
    const clickHandler = createClickHandler(getActiveVisualizations);

    const orthographicDeck = createDeckWithDeferredResizeObserver(
      () =>
        new Deck({
          parent: container,
          deviceProps: {
            type: DECK_DEVICE_TYPE,
            debugGPUTime: isDeckDebugEnabled()
          },
          useDevicePixels: renderPixelRatio,
          views: [ORTHOGRAPHIC_VIEW],
          initialViewState: {
            main: {
              target: [0, 0, 0],
              zoom: 0,
              minZoom: DEFAULT_ORTHOGRAPHIC_ZOOM_BOUNDS.minZoom,
              maxZoom: DEFAULT_ORTHOGRAPHIC_ZOOM_BOUNDS.maxZoom
            }
          },
          width: '100%',
          height: '100%',
          controller: { scrollZoom: false, doubleClickZoom: false },
          layers: [],
          onHover: hoverHandler,
          onClick: clickHandler,
          onViewStateChange: handleViewStateChange as DeckProps<
            [OrthographicView]
          >['onViewStateChange'],
          _onMetrics: isDeckDebugEnabled() ? handleDeckMetrics : null,
          onLoad: () => {
            // Ignore late callbacks from a stale deck instance during view switches.
            if (deckInstance !== orthographicDeck) {
              return;
            }

            isMapLoaded = true;
            mapInstanceStore.setMapLoaded(true);
            logger.success(
              'Deck.gl OrthographicView render engine ready',
              LogCategory.MAP
            );
            onMapLoaded();
          },
          onError: (error, layer) => {
            logger.error(
              'Deck.gl standalone render engine runtime error',
              LogCategory.MAP,
              {
                error,
                layerId: layer?.id
              }
            );
          },
          onResize: ({ width, height }) => {
            syncDeckDebugState(currentViewMode, { width, height });
          }
        })
    );

    deckInstance = orthographicDeck;
    currentViewMode = ViewMode.ORTHOGRAPHIC;
    mapInstanceStore.setDeckInstance(orthographicDeck);
    if (isDeckDebugEnabled()) {
      (window as unknown as Record<string, unknown>).__deck = orthographicDeck;
    }
  }

  let mapEventSubscriptions: Array<{ unsubscribe: () => void }> = [];

  function initializeMapLibre(
    container: HTMLDivElement,
    config: MapInitConfig = DEFAULT_CONFIG
  ): void {
    const style = basemapStyleStore.selectedStyleUrl;

    logger.info('Initializing MapLibre + Deck.gl overlay', LogCategory.MAP);

    containerRef = container;
    currentViewMode = ViewMode.MAPLIBRE;
    removeOrthographicFallbackCanvas();
    syncDeckDebugState(
      ViewMode.MAPLIBRE,
      {
        width: container.clientWidth || 800,
        height: container.clientHeight || 600
      },
      true
    );

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
      touchZoomRotate: true,
      pixelRatio: renderPixelRatio,
      maxCanvasSize: [maxRenderBufferSizePx, maxRenderBufferSizePx],
      canvasContextAttributes: { preserveDrawingBuffer: true },
      cancelPendingTileRequestsWhileZooming: true
    });

    map.on('load', () => {
      if (!map) return;

      const hoverHandler = createHoverHandler(getActiveVisualizations);
      const clickHandler = createClickHandler(getActiveVisualizations);

      deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: [],
        onHover: hoverHandler,
        onClick: clickHandler,
        _onMetrics: isDeckDebugEnabled() ? handleDeckMetrics : null
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
      if (isDeckDebugEnabled()) {
        (window as unknown as Record<string, unknown>).__maplibreMap = map;
        (window as unknown as Record<string, unknown>).__deck = deckOverlay;
      }

      onMapLoaded();

      requestAnimationFrame(() => {
        map?.resize();
      });
    });

    let errorFallbackApplied = false;
    map.on('error', (e) => {
      // Tile-loading errors (404, network) are common when switching styles
      // and are not actionable — suppress them once the map is loaded.
      if (isMapLoaded) return;

      logger.error(
        'MapLibre error, falling back to blank style',
        LogCategory.MAP,
        e
      );
      if (!errorFallbackApplied && map) {
        errorFallbackApplied = true;
        map.setStyle(
          getBasemapStyle(
            BasemapStyle.BLANK_WHITE
          ) as maplibregl.StyleSpecification
        );
      }
    });

    mapEventSubscriptions.push(
      map.on('resize', () => {
        const mapCanvas = map?.getCanvas();
        syncDeckDebugState(
          currentViewMode,
          mapCanvas
            ? {
                width: mapCanvas.clientWidth || mapCanvas.width,
                height: mapCanvas.clientHeight || mapCanvas.height
              }
            : null
        );
      }),
      map.on('zoom', onZoom),
      map.on('moveend', onMoveEnd),
      map.on('zoomend', onMoveEnd)
    );
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
    const overlayToClean = deckOverlay;
    const deckToFinalize = deckInstance;
    map = null;
    deckInstance = null;
    deckOverlay = null;
    isMapLoaded = false;

    for (const sub of mapEventSubscriptions) {
      try {
        sub.unsubscribe();
      } catch {
        // Ignore — subscription may already be detached
      }
    }
    mapEventSubscriptions = [];

    // Release GPU buffers before removing overlay/map
    if (overlayToClean) {
      try {
        overlayToClean.setProps({ layers: [] });
      } catch {
        // Ignore — overlay may already be detached
      }
    }
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
    mapInstanceStore.reset();
    if (isDeckDebugEnabled()) {
      deckDebugStore.clear();
    }
    logger.info('Map destroyed', LogCategory.MAP);
  }

  return {
    initialize,
    destroy,
    switchToMapLibreMode,
    switchToOrthographicMode,
    setRenderPixelRatio,
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
