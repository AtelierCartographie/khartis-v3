import type { Deck, View } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  persistenceRegistry,
  type SavePriorityType
} from '$lib/features/project-management/core/persistence-registry';
import type { SerializedMapViewState } from '$lib/types/serialization.types';
import {
  clampOrthographicZoomLevel,
  clampMapZoomLevel,
  DEFAULT_MAP_BASE_ZOOM,
  nudgeMapZoomLevel,
  nudgeOrthographicZoomLevel,
  ORTHOGRAPHIC_MAP_BASE_ZOOM,
  resolveMapZoomBounds,
  resolveMapZoomLevel,
  resolveOrthographicZoomBounds,
  resolveOrthographicZoomLevel,
  resolveOrthographicZoomPercent,
  resolveMapZoomPercent
} from '$lib/features/map/utils/map-zoom.utils';
import {
  get_bbox_center,
  get_max_scale
} from '$lib/features/map/core/projscreen';

type DeckInstance = Deck<View | View[] | null>;
export type ViewportFitMode = 'auto' | 'manual';
export type ViewportFitReason =
  | 'dataset'
  | 'basemap'
  | 'projection'
  | 'reset'
  | 'restore';

interface DeckViewState {
  target: [number, number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
}

const DEFAULT_DECK_VIEW_STATE: DeckViewState = {
  target: [0, 0, 0],
  zoom: ORTHOGRAPHIC_MAP_BASE_ZOOM,
  ...resolveOrthographicZoomBounds()
};

export interface ProjectionContext {
  referenceBbox: [number, number, number, number] | null;
  canvasSize: { width: number; height: number };
  fitPaddingPx: number;
  renderScale?: number;
  isProjectedCoordinates: boolean;
}

export interface VisibleMapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

let projectionContextGetter: () => ProjectionContext = () => ({
  referenceBbox: null,
  canvasSize: { width: 0, height: 0 },
  fitPaddingPx: 0,
  renderScale: 1,
  isProjectedCoordinates: false
});

export function injectProjectionContext(getter: () => ProjectionContext): void {
  projectionContextGetter = getter;
}

function normalizeTarget(t: number[]): [number, number, number] {
  return [t[0] ?? 0, t[1] ?? 0, t[2] ?? 0];
}

function worldToData(target: number[]): [number, number, number] {
  const t = normalizeTarget(target);
  const ctx = projectionContextGetter();
  if (!ctx.referenceBbox) return t;
  const [cx, cy] = get_bbox_center(ctx.referenceBbox);
  const scale =
    get_max_scale(ctx.canvasSize, ctx.referenceBbox, ctx.fitPaddingPx) *
    (ctx.renderScale ?? 1);
  if (scale === 0) return t;
  const yDirection = ctx.isProjectedCoordinates ? -1 : 1;
  return [t[0] / scale + cx, (t[1] * yDirection) / scale + cy, 0];
}

function dataToWorld(target: number[]): [number, number, number] {
  const t = normalizeTarget(target);
  const ctx = projectionContextGetter();
  if (!ctx.referenceBbox) return t;
  const [cx, cy] = get_bbox_center(ctx.referenceBbox);
  const scale =
    get_max_scale(ctx.canvasSize, ctx.referenceBbox, ctx.fitPaddingPx) *
    (ctx.renderScale ?? 1);
  const yDirection = ctx.isProjectedCoordinates ? -1 : 1;
  return [scale * (t[0] - cx), yDirection * scale * (t[1] - cy), 0];
}

function isPlausibleSerializedTarget(
  target: [number, number, number],
  bbox: [number, number, number, number]
): boolean {
  const [x, y] = normalizeTarget(target);
  const [minX, minY, maxX, maxY] = bbox;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const zeroIsWithinBbox = 0 >= minX && 0 <= maxX && 0 >= minY && 0 <= maxY;

  if (x === 0 && y === 0 && !zeroIsWithinBbox) {
    return false;
  }

  return (
    x >= minX - width &&
    x <= maxX + width &&
    y >= minY - height &&
    y <= maxY + height
  );
}

interface PendingViewState {
  zoom: number;

  target: [number, number, number];
}

interface PendingMapLibreViewState {
  zoom: number;
  center: [number, number];
  baseZoom: number;
}

type SerializedViewState = SerializedMapViewState;

export interface SynchronizedViewportController {
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (zoom: number) => void;
  resetZoom: () => void;
}

export interface OrthographicViewStateAdapter {
  applyViewState: (viewState: DeckViewState) => void;
}

function createMapInstanceStore() {
  const state = $state<{
    map: MapLibreMap | null;
    deckOverlay: MapboxOverlay | null;
    deckInstance: DeckInstance | null;
    isMapLoaded: boolean;
    zoomLevel: number;
    baseZoomLevel: number;
    deckViewState: DeckViewState;
    viewportFitMode: ViewportFitMode;
    viewportFitReason: ViewportFitReason | null;
  }>({
    map: null,
    deckOverlay: null,
    deckInstance: null,
    isMapLoaded: false,
    zoomLevel: 100,
    baseZoomLevel: DEFAULT_MAP_BASE_ZOOM,
    deckViewState: { ...DEFAULT_DECK_VIEW_STATE },
    viewportFitMode: 'auto',
    viewportFitReason: null
  });

  let pendingOrthographicRestore: PendingViewState | null = null;
  let pendingMapLibreRestore: PendingMapLibreViewState | null = null;
  let lastSerializedViewState: SerializedViewState | null = null;
  let synchronizedViewportController: SynchronizedViewportController | null =
    null;
  let orthographicViewStateAdapter: OrthographicViewStateAdapter | null = null;

  function buildSerializedViewState(): SerializedViewState | null {
    if (state.map && state.isMapLoaded) {
      const center = state.map.getCenter();
      const zoom = state.map.getZoom();
      const serialized = {
        zoom,
        center: [center.lng, center.lat] as [number, number],
        baseZoom: state.baseZoomLevel
      } satisfies SerializedViewState;

      lastSerializedViewState = serialized;
      return serialized;
    }

    const worldTarget = normalizeTarget(state.deckViewState.target);
    const ctx = projectionContextGetter();

    if (!ctx.referenceBbox) {
      return lastSerializedViewState;
    }

    const scale = get_max_scale(
      ctx.canvasSize,
      ctx.referenceBbox,
      ctx.fitPaddingPx
    );
    if (scale === 0) {
      return lastSerializedViewState;
    }

    const serialized = {
      zoom: state.deckViewState.zoom,
      target: worldToData(worldTarget)
    } satisfies SerializedViewState;

    lastSerializedViewState = serialized;
    return serialized;
  }

  function applyMapZoomBounds(): void {
    if (!state.map) {
      return;
    }

    const { minZoom, maxZoom } = resolveMapZoomBounds(state.baseZoomLevel);
    const getMaxZoom = state.map.getMaxZoom?.bind(state.map);
    const currentMaxZoom =
      typeof getMaxZoom === 'function' ? getMaxZoom() : maxZoom;
    if (typeof state.map.setMaxZoom === 'function') {
      state.map.setMaxZoom(Math.max(currentMaxZoom, maxZoom));
    }
    state.map.setMinZoom(minZoom);
    state.map.setMaxZoom(maxZoom);

    const currentZoom = state.map.getZoom();
    const clampedZoom = clampMapZoomLevel(state.baseZoomLevel, currentZoom);

    if (Math.abs(currentZoom - clampedZoom) > 1e-6) {
      state.map.setZoom(clampedZoom);
    }
  }

  function setMapInstance(map: MapLibreMap | null) {
    state.map = map;
    applyMapZoomBounds();
    updateZoomFromMap();
  }

  function setDeckOverlay(overlay: MapboxOverlay | null) {
    state.deckOverlay = overlay;
  }

  function setDeckInstance(instance: DeckInstance | null) {
    state.deckInstance = instance;
    if (instance === null) {
      orthographicViewStateAdapter = null;
    }
  }

  function setMapLoaded(loaded: boolean) {
    state.isMapLoaded = loaded;
  }

  function getMapCanvas(): HTMLCanvasElement | null {
    return state.map?.getCanvas() ?? null;
  }

  function getDeckMapBounds() {
    if (!state.deckInstance || !state.isMapLoaded) return null;
    const ctx = projectionContextGetter();
    if (!ctx.referenceBbox) return null;
    if (ctx.canvasSize.width <= 0 || ctx.canvasSize.height <= 0) return null;

    const zoomScale = Math.pow(2, state.deckViewState.zoom);
    if (!Number.isFinite(zoomScale) || zoomScale <= 0) return null;

    const target = normalizeTarget(state.deckViewState.target);
    const halfWidth = ctx.canvasSize.width / zoomScale / 2;
    const halfHeight = ctx.canvasSize.height / zoomScale / 2;
    const corners = [
      worldToData([target[0] - halfWidth, target[1] - halfHeight, 0]),
      worldToData([target[0] + halfWidth, target[1] - halfHeight, 0]),
      worldToData([target[0] + halfWidth, target[1] + halfHeight, 0]),
      worldToData([target[0] - halfWidth, target[1] + halfHeight, 0])
    ];
    const xs = corners.map((corner) => corner[0]);
    const ys = corners.map((corner) => corner[1]);

    if (
      xs.some((value) => !Number.isFinite(value)) ||
      ys.some((value) => !Number.isFinite(value))
    ) {
      return null;
    }

    return {
      north: Math.max(...ys),
      south: Math.min(...ys),
      east: Math.max(...xs),
      west: Math.min(...xs)
    } satisfies VisibleMapBounds;
  }

  function getMapBounds() {
    if (state.map) {
      const bounds = state.map.getBounds();
      return {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      } satisfies VisibleMapBounds;
    }

    return getDeckMapBounds();
  }

  /**
   * Project an orthographic data-space point (lon/lat, or projected pixel coords
   * when a render projection is active) to the on-screen position inside the map
   * area, expressed in LOGICAL (unscaled) pixels relative to the map-area
   * top-left. This is the inverse-free companion of `getDeckMapBounds`: it
   * composes the same `dataToWorld` mapping with the deck OrthographicView
   * (flipY:false) pan/zoom, so an annotation anchored here tracks the basemap as
   * the deck viewState changes. Returns `null` when no reference is available.
   */
  function projectDataToViewportPx(
    dataX: number,
    dataY: number
  ): { x: number; y: number } | null {
    if (!state.deckInstance || !state.isMapLoaded) return null;
    const ctx = projectionContextGetter();
    if (!ctx.referenceBbox) return null;
    if (ctx.canvasSize.width <= 0 || ctx.canvasSize.height <= 0) return null;

    const renderScale = ctx.renderScale ?? 1;
    if (renderScale <= 0) return null;

    const zoomScale = Math.pow(2, state.deckViewState.zoom);
    if (!Number.isFinite(zoomScale) || zoomScale <= 0) return null;

    const world = dataToWorld([dataX, dataY, 0]);
    if (!Number.isFinite(world[0]) || !Number.isFinite(world[1])) return null;

    const target = normalizeTarget(state.deckViewState.target);
    // Scaled-device-px viewport center (OrthographicView places target there).
    // The view is created with flipY:false, so world +y points UP the screen.
    const centerXScaled = (ctx.canvasSize.width * renderScale) / 2;
    const centerYScaled = (ctx.canvasSize.height * renderScale) / 2;
    const screenXScaled = (world[0] - target[0]) * zoomScale + centerXScaled;
    const screenYScaled = centerYScaled - (world[1] - target[1]) * zoomScale;

    if (!Number.isFinite(screenXScaled) || !Number.isFinite(screenYScaled)) {
      return null;
    }

    // Convert scaled device px back to logical (unscaled) map-area px so the
    // overlay can apply its own pageScale exactly once.
    return {
      x: screenXScaled / renderScale,
      y: screenYScaled / renderScale
    };
  }

  /**
   * Inverse of `projectDataToViewportPx`: map a logical (unscaled) map-area
   * pixel position back to orthographic data-space coordinates (lon/lat or
   * projected pixels, matching `dataToWorld`'s input space). Returns `null` when
   * no reference is available.
   */
  function unprojectViewportPxToData(
    viewportX: number,
    viewportY: number
  ): { x: number; y: number } | null {
    if (!state.deckInstance || !state.isMapLoaded) return null;
    const ctx = projectionContextGetter();
    if (!ctx.referenceBbox) return null;
    if (ctx.canvasSize.width <= 0 || ctx.canvasSize.height <= 0) return null;

    const renderScale = ctx.renderScale ?? 1;
    if (renderScale <= 0) return null;

    const zoomScale = Math.pow(2, state.deckViewState.zoom);
    if (!Number.isFinite(zoomScale) || zoomScale <= 0) return null;

    const target = normalizeTarget(state.deckViewState.target);
    const centerXScaled = (ctx.canvasSize.width * renderScale) / 2;
    const centerYScaled = (ctx.canvasSize.height * renderScale) / 2;
    const screenXScaled = viewportX * renderScale;
    const screenYScaled = viewportY * renderScale;
    const worldX = (screenXScaled - centerXScaled) / zoomScale + target[0];
    const worldY = (centerYScaled - screenYScaled) / zoomScale + target[1];

    const data = worldToData([worldX, worldY, 0]);
    if (!Number.isFinite(data[0]) || !Number.isFinite(data[1])) return null;

    return { x: data[0], y: data[1] };
  }

  function getMapZoom(): number {
    return state.map?.getZoom() ?? 0;
  }

  function getMapCenter(): { lng: number; lat: number } | null {
    const center = state.map?.getCenter();
    return center ? { lng: center.lng, lat: center.lat } : null;
  }

  function setBaseZoomLevel(zoom: number) {
    state.baseZoomLevel = Number.isFinite(zoom) ? zoom : DEFAULT_MAP_BASE_ZOOM;
    applyMapZoomBounds();
    applyDeckZoomBounds();
    updateZoomFromMap();
  }

  function resolveDeckViewState(
    nextViewState: Partial<DeckViewState> = {}
  ): DeckViewState {
    const bounds = resolveOrthographicZoomBounds();
    const nextZoom = nextViewState.zoom ?? state.deckViewState.zoom;

    return {
      ...state.deckViewState,
      ...nextViewState,
      ...bounds,
      zoom: clampOrthographicZoomLevel(nextZoom)
    };
  }

  function applyDeckZoomBounds(): void {
    state.deckViewState = resolveDeckViewState();
  }

  function markViewportAutoFit(reason: ViewportFitReason): void {
    state.viewportFitMode = 'auto';
    state.viewportFitReason = reason;
  }

  function markViewportManual(): void {
    state.viewportFitMode = 'manual';
    state.viewportFitReason = null;
  }

  function updateZoomFromMap() {
    if (state.map) {
      state.zoomLevel = Math.round(
        resolveMapZoomPercent(state.baseZoomLevel, state.map.getZoom())
      );
      return;
    }

    if (state.deckInstance) {
      const deckZoom = state.deckViewState.zoom;
      const percent = resolveOrthographicZoomPercent(deckZoom);
      state.zoomLevel = Math.round(percent);
    }
  }

  function updateDeckViewState(
    viewState: Partial<DeckViewState>,
    fromUserInteraction = false
  ) {
    state.deckViewState = resolveDeckViewState(viewState);
    updateZoomFromMap();
    if (fromUserInteraction) {
      markViewportManual();
      pendingOrthographicRestore = null;
      persistenceRegistry.notifyChange('mapViewState');
      applyDeckViewState();
    }
  }

  function applyDeckViewState(): void {
    if (!state.deckInstance) {
      return;
    }

    const nextViewState = { ...state.deckViewState };

    if (orthographicViewStateAdapter) {
      orthographicViewStateAdapter.applyViewState(nextViewState);
      return;
    }

    const deck = state.deckInstance;
    const setProps = deck.setProps.bind(deck) as (props: {
      viewState?: Record<string, DeckViewState>;
      initialViewState?: Record<string, DeckViewState>;
    }) => void;
    setProps({
      viewState: { main: nextViewState },
      initialViewState: { main: nextViewState }
    });
  }

  function consumePendingRestore(): void {
    pendingOrthographicRestore = null;
    persistenceRegistry.notifyChange('mapViewState', 'immediate');
  }

  function persistCurrentMapLibreViewState(
    priority: SavePriorityType = 'debounced'
  ): void {
    if (!state.map || !state.isMapLoaded) {
      return;
    }

    pendingMapLibreRestore = null;
    buildSerializedViewState();
    persistenceRegistry.notifyChange('mapViewState', priority);
  }

  function applyPendingMapLibreRestore(): boolean {
    if (!state.map || !state.isMapLoaded || !pendingMapLibreRestore) {
      return false;
    }

    const restore = pendingMapLibreRestore;
    pendingMapLibreRestore = null;
    state.baseZoomLevel =
      Number.isFinite(restore.baseZoom) && restore.baseZoom > 0
        ? restore.baseZoom
        : restore.zoom;
    applyMapZoomBounds();
    state.map.jumpTo({
      center: restore.center,
      zoom: restore.zoom
    });
    markViewportManual();
    lastSerializedViewState = restore;
    updateZoomFromMap();
    return true;
  }

  function setSynchronizedViewportController(
    controller: SynchronizedViewportController | null
  ): void {
    synchronizedViewportController = controller;
  }

  function setOrthographicViewStateAdapter(
    adapter: OrthographicViewStateAdapter | null
  ): void {
    orthographicViewStateAdapter = adapter;
  }

  function zoomInLocal() {
    if (state.map) {
      markViewportManual();
      pendingMapLibreRestore = null;
      state.map.setZoom(
        nudgeMapZoomLevel(state.baseZoomLevel, state.map.getZoom(), 1)
      );
      return;
    }

    if (state.deckInstance) {
      markViewportManual();
      pendingOrthographicRestore = null;
      const newZoom = clampOrthographicZoomLevel(
        nudgeOrthographicZoomLevel(state.deckViewState.zoom, 1)
      );
      state.deckViewState = resolveDeckViewState({ zoom: newZoom });
      applyDeckViewState();
      updateZoomFromMap();
      consumePendingRestore();
    }
  }

  function zoomIn() {
    if (synchronizedViewportController) {
      synchronizedViewportController.zoomIn();
      return;
    }

    zoomInLocal();
  }

  function zoomOutLocal() {
    if (state.map) {
      markViewportManual();
      pendingMapLibreRestore = null;
      state.map.setZoom(
        nudgeMapZoomLevel(state.baseZoomLevel, state.map.getZoom(), -1)
      );
      return;
    }

    if (state.deckInstance) {
      markViewportManual();
      pendingOrthographicRestore = null;
      const newZoom = clampOrthographicZoomLevel(
        nudgeOrthographicZoomLevel(state.deckViewState.zoom, -1)
      );
      state.deckViewState = resolveDeckViewState({ zoom: newZoom });
      applyDeckViewState();
      updateZoomFromMap();
      consumePendingRestore();
    }
  }

  function zoomOut() {
    if (synchronizedViewportController) {
      synchronizedViewportController.zoomOut();
      return;
    }

    zoomOutLocal();
  }

  function setZoomLocal(zoom: number) {
    if (state.map) {
      markViewportManual();
      pendingMapLibreRestore = null;
      state.map.setZoom(clampMapZoomLevel(state.baseZoomLevel, zoom));
      return;
    }

    if (state.deckInstance) {
      markViewportManual();
      pendingOrthographicRestore = null;
      state.deckViewState = resolveDeckViewState({ zoom });
      applyDeckViewState();
      updateZoomFromMap();
      consumePendingRestore();
    }
  }

  function setZoom(zoom: number) {
    if (synchronizedViewportController) {
      synchronizedViewportController.setZoom(zoom);
      return;
    }

    setZoomLocal(zoom);
  }

  function setZoomPercent(percent: number) {
    const zoom = state.map
      ? resolveMapZoomLevel(state.baseZoomLevel, percent)
      : resolveOrthographicZoomLevel(percent);
    setZoom(zoom);
  }

  function centerOnDataPoint(dataLon: number, dataLat: number): void {
    if (state.map) {
      markViewportManual();
      pendingMapLibreRestore = null;
      state.map.jumpTo({ center: [dataLon, dataLat] });
      persistenceRegistry.notifyChange('mapViewState');
      return;
    }
    if (!state.deckInstance || !state.isMapLoaded) return;
    state.deckViewState = {
      ...state.deckViewState,
      target: dataToWorld([dataLon, dataLat, 0])
    };
    markViewportManual();
    pendingOrthographicRestore = null;
    applyDeckViewState();
    updateZoomFromMap();
    persistenceRegistry.notifyChange('mapViewState');
  }

  function resetZoomLocal() {
    if (state.map) {
      markViewportManual();
      pendingMapLibreRestore = null;
      state.map.setZoom(state.baseZoomLevel);
      return;
    }

    if (state.deckInstance) {
      markViewportManual();
      pendingOrthographicRestore = null;
      state.deckViewState = resolveDeckViewState({
        zoom: ORTHOGRAPHIC_MAP_BASE_ZOOM,
        target: [0, 0, 0]
      });
      applyDeckViewState();
      updateZoomFromMap();
      consumePendingRestore();
    }
  }

  function resetZoom() {
    if (synchronizedViewportController) {
      synchronizedViewportController.resetZoom();
      return;
    }

    resetZoomLocal();
  }

  function fitToOrthographicBounds(
    reason: ViewportFitReason | null = null
  ): void {
    if (!state.deckInstance || !state.isMapLoaded) return;

    let restoredViewApplied = false;

    if (pendingOrthographicRestore) {
      const ctx = projectionContextGetter();
      if (!ctx.referenceBbox) {
        return;
      }

      if (
        !isPlausibleSerializedTarget(
          pendingOrthographicRestore.target,
          ctx.referenceBbox
        )
      ) {
        pendingOrthographicRestore = null;
        lastSerializedViewState = null;
      } else {
        const scale =
          get_max_scale(ctx.canvasSize, ctx.referenceBbox, ctx.fitPaddingPx) *
          (ctx.renderScale ?? 1);
        if (scale === 0) {
          return;
        }

        state.deckViewState = resolveDeckViewState({
          target: dataToWorld(pendingOrthographicRestore.target),
          zoom: pendingOrthographicRestore.zoom
        });
        markViewportManual();
        restoredViewApplied = true;
      }
    }

    if (!restoredViewApplied) {
      state.deckViewState = resolveDeckViewState({
        target: [0, 0, 0],
        zoom: ORTHOGRAPHIC_MAP_BASE_ZOOM
      });
      if (reason) {
        markViewportAutoFit(reason);
      }
    }

    applyDeckViewState();
    updateZoomFromMap();
    buildSerializedViewState();
    persistenceRegistry.notifyChange('mapViewState');
  }

  function restoreFromSerialized(data: SerializedViewState | null): void {
    pendingOrthographicRestore = null;
    pendingMapLibreRestore = null;

    if (!data || typeof data !== 'object') {
      return;
    }

    const zoom =
      typeof data.zoom === 'number' && Number.isFinite(data.zoom)
        ? data.zoom
        : null;

    if (zoom == null) return;

    if (
      'center' in data &&
      Array.isArray(data.center) &&
      data.center.length >= 2 &&
      typeof data.center[0] === 'number' &&
      Number.isFinite(data.center[0]) &&
      typeof data.center[1] === 'number' &&
      Number.isFinite(data.center[1])
    ) {
      pendingMapLibreRestore = {
        zoom,
        center: [data.center[0], data.center[1]],
        baseZoom:
          typeof data.baseZoom === 'number' && Number.isFinite(data.baseZoom)
            ? data.baseZoom
            : zoom
      };
      lastSerializedViewState = pendingMapLibreRestore;
      return;
    }

    const raw = 'target' in data ? data.target : undefined;
    const hasValidXY =
      Array.isArray(raw) &&
      raw.length >= 2 &&
      typeof raw[0] === 'number' &&
      Number.isFinite(raw[0]) &&
      typeof raw[1] === 'number' &&
      Number.isFinite(raw[1]);
    const target: [number, number, number] = hasValidXY
      ? [raw[0], raw[1], 0]
      : [0, 0, 0];

    pendingOrthographicRestore = { zoom, target };
    lastSerializedViewState = pendingOrthographicRestore;
  }

  function clearPersistedViewState(): void {
    pendingOrthographicRestore = null;
    pendingMapLibreRestore = null;
    lastSerializedViewState = null;
    state.deckViewState = { ...DEFAULT_DECK_VIEW_STATE };
    state.viewportFitMode = 'auto';
    state.viewportFitReason = null;

    if (state.deckInstance && state.isMapLoaded && !state.map) {
      applyDeckViewState();
    }

    updateZoomFromMap();
  }

  function reset() {
    state.map = null;
    state.deckOverlay = null;
    state.deckInstance = null;
    state.isMapLoaded = false;
    state.zoomLevel = 100;
    state.baseZoomLevel = DEFAULT_MAP_BASE_ZOOM;
    state.deckViewState = { ...DEFAULT_DECK_VIEW_STATE };
    state.viewportFitMode = 'auto';
    state.viewportFitReason = null;
    synchronizedViewportController = null;
    orthographicViewStateAdapter = null;

    lastSerializedViewState = null;
  }

  return {
    get map() {
      return state.map;
    },
    get deckOverlay() {
      return state.deckOverlay;
    },
    get deckInstance() {
      return state.deckInstance;
    },
    get isMapLoaded() {
      return state.isMapLoaded;
    },
    get hasPendingRestore() {
      return (
        pendingOrthographicRestore !== null || pendingMapLibreRestore !== null
      );
    },
    get hasPendingOrthographicRestore() {
      return pendingOrthographicRestore !== null;
    },
    get hasPendingMapLibreRestore() {
      return pendingMapLibreRestore !== null;
    },
    get currentZoom(): number {
      if (state.map) {
        return state.map.getZoom();
      }
      return state.deckViewState.zoom;
    },
    get zoomLevel() {
      return state.zoomLevel;
    },
    get baseZoomLevel() {
      return state.baseZoomLevel;
    },
    get deckViewState() {
      return state.deckViewState;
    },
    get isViewportAutoFitManaged() {
      return state.viewportFitMode === 'auto';
    },
    get viewportFitMode() {
      return state.viewportFitMode;
    },
    get viewportFitReason() {
      return state.viewportFitReason;
    },
    setSynchronizedViewportController,
    setOrthographicViewStateAdapter,
    setMapInstance,
    setDeckOverlay,
    setDeckInstance,
    setMapLoaded,
    getMapCanvas,
    getDeckMapBounds,
    getMapBounds,
    projectDataToViewportPx,
    unprojectViewportPxToData,
    getMapZoom,
    getMapCenter,
    setBaseZoomLevel,
    updateZoomFromMap,
    markViewportAutoFit,
    markViewportManual,
    updateDeckViewState,
    buildSerializedViewState,
    persistCurrentMapLibreViewState,
    applyPendingMapLibreRestore,
    zoomInLocal,
    zoomIn,
    zoomOutLocal,
    zoomOut,
    setZoomLocal,
    setZoom,
    setZoomPercent,
    resetZoomLocal,
    resetZoom,
    centerOnDataPoint,
    fitToOrthographicBounds,
    restoreFromSerialized,
    clearPersistedViewState,
    reset
  };
}

export const mapInstanceStore = createMapInstanceStore();

persistenceRegistry.register({
  key: 'mapViewState',
  serialize: () => mapInstanceStore.buildSerializedViewState(),
  deserialize: (data: unknown) =>
    mapInstanceStore.restoreFromSerialized(
      data as SerializedMapViewState | null
    ),
  reset: () => mapInstanceStore.clearPersistedViewState(),
  priority: 'debounced'
});
