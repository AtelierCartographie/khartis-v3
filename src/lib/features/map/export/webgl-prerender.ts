import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import * as m from '$lib/paraglide/messages';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  EXPORT_MAP_CANVAS_SELECTOR,
  EXPORT_RENDER_TIMEOUT_MS,
  FROZEN_CANVAS_ATTRIBUTE,
  PIXEL_RATIO_EPSILON
} from './constants';
import type {
  DeckInstance,
  ExportOptions,
  FrozenCanvas,
  RestoreExportRender
} from './types';

export function getExportPixelRatio(
  pageContainer: HTMLElement,
  options: ExportOptions
): number {
  return Math.min(
    options.width / pageContainer.offsetWidth,
    options.height / pageContainer.offsetHeight
  );
}
export function getExportPixelRatioForSize(
  width: number,
  height: number,
  options: ExportOptions
): number {
  return Math.min(options.width / width, options.height / height);
}
export function exportFilter(domNode: HTMLElement): boolean {
  if (domNode.classList?.contains('page-grid')) return false;
  if (domNode.classList?.contains('view-mode-loader')) return false;
  return true;
}

function getFallbackDevicePixelRatio(): number {
  if (typeof window === 'undefined') {
    return 1;
  }

  return window.devicePixelRatio || 1;
}

function resolveDeckPixelRatio(
  value: DeckInstance['props']['useDevicePixels']
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (value === false) {
    return 1;
  }

  return getFallbackDevicePixelRatio();
}

export async function waitForMapRender(map: MapLibreMap): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(m.error_map_render_timeout())),
      EXPORT_RENDER_TIMEOUT_MS
    );

    map.once('render', () => {
      clearTimeout(timeout);
      resolve();
    });
    map.triggerRepaint();
  });
}

async function prerenderMapLibre(
  map: MapLibreMap,
  pixelRatio: number
): Promise<RestoreExportRender> {
  const currentRatio = map.getPixelRatio();
  const scale = Math.max(pixelRatio, currentRatio);

  if (scale <= currentRatio + PIXEL_RATIO_EPSILON) return async () => {};

  map.setPixelRatio(scale);
  await waitForMapRender(map);

  return async () => {
    map.setPixelRatio(currentRatio);
    await waitForMapRender(map);
  };
}

async function redrawDeckForExport(
  deck: DeckInstance,
  reason: string
): Promise<void> {
  deck.redraw(reason);
  await waitForNextFrame();
  deck.redraw(`${reason}Frame`);
  await waitForNextFrame();
}

async function prerenderDeck(
  deck: DeckInstance,
  pixelRatio: number
): Promise<RestoreExportRender> {
  const currentUseDevicePixels = deck.props.useDevicePixels;
  const currentRatio = resolveDeckPixelRatio(currentUseDevicePixels);
  const scale = Math.max(pixelRatio, currentRatio);

  if (scale <= currentRatio + PIXEL_RATIO_EPSILON) return async () => {};

  deck.setProps({ useDevicePixels: scale });
  await redrawDeckForExport(deck, 'exportPixelRatio');

  return async () => {
    deck.setProps({ useDevicePixels: currentUseDevicePixels });
    await redrawDeckForExport(deck, 'restoreExportPixelRatio');
  };
}

function usesInterleavedDeckOverlay(): boolean {
  return mapInstanceStore.deckOverlay !== null;
}

export async function prerenderWebgl(
  pixelRatio: number
): Promise<RestoreExportRender> {
  const restorers: RestoreExportRender[] = [];
  const map = mapInstanceStore.map;
  const deck = mapInstanceStore.deckInstance;
  const interleaved = usesInterleavedDeckOverlay();

  if (map && !interleaved) {
    restorers.push(await prerenderMapLibre(map, pixelRatio));
  }

  if (deck) {
    restorers.push(await prerenderDeck(deck, pixelRatio));
  }

  return async () => {
    for (const restore of restorers.reverse()) {
      await restore();
    }
  };
}
export function mutateDomForExport(pageContainer: HTMLElement): () => void {
  pageContainer.classList.add('is-exporting-map');

  const pageGrids = Array.from(
    pageContainer.querySelectorAll<HTMLElement>('.page-grid')
  );
  const pageGridDisplays = pageGrids.map((grid) => grid.style.display);
  pageGrids.forEach((grid) => {
    grid.style.display = 'none';
  });

  const exportPlaceholders = Array.from(
    pageContainer.querySelectorAll<HTMLElement>(
      '[data-khartis-export-placeholder="true"]'
    )
  );
  const exportPlaceholderDisplays = exportPlaceholders.map(
    (placeholder) => placeholder.style.display
  );
  exportPlaceholders.forEach((placeholder) => {
    placeholder.style.display = 'none';
  });

  return () => {
    pageContainer.classList.remove('is-exporting-map');
    pageGrids.forEach((grid, index) => {
      grid.style.display = pageGridDisplays[index] ?? '';
    });
    exportPlaceholders.forEach((placeholder, index) => {
      placeholder.style.display = exportPlaceholderDisplays[index] ?? '';
    });
  };
}
export function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

async function waitForImageDecode(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === 'function') {
    await image.decode().catch(() => undefined);
    return;
  }

  if (image.complete) return;

  await new Promise<void>((resolve) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  });
}

function createFrozenCanvas(canvas: HTMLCanvasElement): FrozenCanvas | null {
  const parent = canvas.parentElement;
  if (!parent) return null;

  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch {
    return null;
  }

  if (!dataUrl || dataUrl === 'data:,') return null;

  const parentRect = parent.getBoundingClientRect();
  const parentPosition = parent.style.position;
  const parentComputedPosition = getComputedStyle(parent).position;
  const canvasVisibility = canvas.style.visibility;
  const canvasStyles = getComputedStyle(canvas);
  const image = document.createElement('img');

  image.src = dataUrl;
  image.alt = '';
  image.setAttribute(FROZEN_CANVAS_ATTRIBUTE, 'true');
  image.style.position = 'absolute';
  image.style.left = `${canvasRect.left - parentRect.left}px`;
  image.style.top = `${canvasRect.top - parentRect.top}px`;
  image.style.width = `${canvasRect.width}px`;
  image.style.height = `${canvasRect.height}px`;
  image.style.pointerEvents = 'none';
  image.style.objectFit = 'fill';
  image.style.transform = canvasStyles.transform;
  image.style.transformOrigin = canvasStyles.transformOrigin;
  image.style.zIndex =
    canvasStyles.zIndex === 'auto' ? '0' : canvasStyles.zIndex;

  if (parentComputedPosition === 'static') {
    parent.style.position = 'relative';
  }

  canvas.style.visibility = 'hidden';
  parent.appendChild(image);

  return {
    image,
    restore: async () => {
      canvas.style.visibility = canvasVisibility;
      parent.style.position = parentPosition;
      image.remove();
    }
  };
}

export async function freezeCanvasesForExport(
  pageContainer: HTMLElement
): Promise<RestoreExportRender> {
  const canvases = Array.from(
    new Set(
      pageContainer.querySelectorAll<HTMLCanvasElement>(
        EXPORT_MAP_CANVAS_SELECTOR
      )
    )
  );
  const frozenCanvases = canvases
    .map((canvas) => createFrozenCanvas(canvas))
    .filter((frozenCanvas): frozenCanvas is FrozenCanvas =>
      Boolean(frozenCanvas)
    );

  await Promise.all(
    frozenCanvases.map((frozenCanvas) => waitForImageDecode(frozenCanvas.image))
  );

  return async () => {
    for (const frozenCanvas of frozenCanvases.reverse()) {
      await frozenCanvas.restore();
    }
  };
}
export function resolveMapCanvas(
  pageContainer: HTMLElement
): HTMLCanvasElement | null {
  return (
    mapInstanceStore.getMapCanvas() ??
    (pageContainer.querySelector(
      EXPORT_MAP_CANVAS_SELECTOR
    ) as HTMLCanvasElement | null)
  );
}
