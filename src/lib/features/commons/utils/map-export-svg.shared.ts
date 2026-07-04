import * as m from '$lib/paraglide/messages';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import type { Deck, View } from '@deck.gl/core';
import type { Map as MapLibreMap } from 'maplibre-gl';

export interface ExportOptions {
  width: number;
  height: number;
}

export interface RelativeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageExportGeometry {
  width: number;
  height: number;
  mapFrame: RelativeRect | null;
}

export type DeckInstance = Deck<View | View[] | null>;
export type RestoreExportRender = () => Promise<void>;
export interface FrozenCanvas {
  image: HTMLImageElement;
  restore: RestoreExportRender;
}

export interface SvgViewportLike {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  project(position: number[]): number[] | { x: number; y: number };
}

export interface SvgDeckLike {
  props?: Record<string, unknown>;
  setProps?: (props: Record<string, unknown>) => void;
  redraw?: (reason?: string) => void;
  getViewports?: () => SvgViewportLike[];
  layerManager?: {
    getLayers?: () => unknown[];
  };
  viewManager?: {
    getViewports?: () => SvgViewportLike[];
  };
}

export interface SvgDeckLayerLike {
  id?: string;
  props?: Record<string, unknown>;
  constructor?: {
    layerName?: string;
    name?: string;
  };
}

export interface BinaryAttributeLike {
  value?: ArrayLike<number>;
  size?: number;
  stride?: number;
  offset?: number;
  normalized?: boolean;
}

export interface BinaryLayerDataLike {
  length?: number;
  startIndices?: ArrayLike<number>;
  attributes?: Record<string, BinaryAttributeLike | undefined>;
}

export interface SvgProjectionContext {
  canvasRect: RelativeRect;
  viewport: SvgViewportLike;
}

export interface SvgColor {
  red: number;
  green: number;
  blue: number;
  opacity: number;
}

export interface GeoJsonGeometryLike {
  type?: string;
  coordinates?: unknown;
}

export interface GeoJsonFeatureLike {
  type?: string;
  geometry?: GeoJsonGeometryLike | null;
  properties?: Record<string, unknown> | null;
}

export interface StructuredSvgOptions {
  mapLibreBackgroundDataUrl?: string | null;
}

export const SVG_EXPORT_STYLE_PROPERTIES = [
  'color',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'text-anchor',
  'dominant-baseline',
  'opacity',
  'vector-effect'
] as const;

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  width: 1920,
  height: 1080
};
export const EXPORT_RENDER_TIMEOUT_MS = 10000;
export const PIXEL_RATIO_EPSILON = 0.001;
export const FROZEN_CANVAS_ATTRIBUTE = 'data-khartis-export-frozen-canvas';
export const SVG_MAP_FRAME_CLIP_ID = 'khartis-map-frame-clip';
export const EXPORT_PAGE_SELECTOR = '.page-container, .facets-page';
export const EXPORT_MAP_STAGE_SELECTOR = '.map-stage, .facets-map-stage';
export const EXPORT_MAP_SURFACE_SELECTOR = '.map-canvas, .shared-facets-canvas';
export const EXPORT_MAP_CANVAS_SELECTOR =
  '.map-canvas canvas, .shared-facets-canvas canvas, canvas';

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
  if (domNode.dataset?.khartisExportPlaceholder === 'true') return false;
  return true;
}

export function getFallbackDevicePixelRatio(): number {
  if (typeof window === 'undefined') {
    return 1;
  }

  return window.devicePixelRatio || 1;
}

export function resolveDeckPixelRatio(
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

export async function prerenderMapLibre(
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

export async function redrawDeckForExport(
  deck: DeckInstance,
  reason: string
): Promise<void> {
  deck.redraw(reason);
  await waitForNextFrame();
  deck.redraw(`${reason}Frame`);
  await waitForNextFrame();
}

export async function prerenderDeck(
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

export function usesInterleavedDeckOverlay(): boolean {
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

  const mapStage = pageContainer.querySelector(
    EXPORT_MAP_STAGE_SELECTOR
  ) as HTMLElement | null;
  const savedFilter = mapStage?.style.filter ?? '';
  if (mapStage) mapStage.style.filter = 'none';

  return () => {
    pageContainer.classList.remove('is-exporting-map');
    pageGrids.forEach((grid, index) => {
      grid.style.display = pageGridDisplays[index] ?? '';
    });
    exportPlaceholders.forEach((placeholder, index) => {
      placeholder.style.display = exportPlaceholderDisplays[index] ?? '';
    });
    if (mapStage) mapStage.style.filter = savedFilter;
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

export async function waitForImageDecode(
  image: HTMLImageElement
): Promise<void> {
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

export function createFrozenCanvas(
  canvas: HTMLCanvasElement
): FrozenCanvas | null {
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

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function isTransparentColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === '' ||
    normalized === 'transparent' ||
    normalized === 'rgba(0, 0, 0, 0)'
  );
}

export interface ParsedBoxShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
  opacity: number;
}

export function parseBoxShadow(value: string): ParsedBoxShadow | null {
  if (!value || value.trim().toLowerCase() === 'none') {
    return null;
  }

  const colorMatch = value.match(/rgba?\(([^)]+)\)|#[0-9a-fA-F]{3,8}/);
  if (!colorMatch) return null;

  const colorToken = colorMatch[0];
  const rest = value.replace(colorToken, '').trim();
  const numbers = rest
    .split(/\s+/)
    .map((token) => Number(token.replace(/px$/, '')))
    .filter((n) => Number.isFinite(n));

  if (numbers.length < 2) return null;

  const [offsetX, offsetY, blur = 0] = numbers;
  let color = colorToken;
  let opacity = 1;

  const rgbaMatch = colorToken.match(/rgba?\(([^)]+)\)/i);
  if (rgbaMatch) {
    const components = rgbaMatch[1]
      .split(',')
      .map((token) => Number(token.trim()));
    if (components.length >= 3) {
      const [r, g, b, a] = components;
      color = `rgb(${r}, ${g}, ${b})`;
      opacity = Number.isFinite(a) ? a : 1;
    }
  }

  return {
    offsetX,
    offsetY,
    blur,
    color,
    opacity: clamp(opacity, 0, 1)
  };
}

export function getRelativeRect(
  element: Element,
  container: HTMLElement
): RelativeRect {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  return {
    x: elementRect.left - containerRect.left,
    y: elementRect.top - containerRect.top,
    width: elementRect.width,
    height: elementRect.height
  };
}

export function resolvePageExportGeometry(
  pageContainer: HTMLElement
): PageExportGeometry {
  const pageRect = pageContainer.getBoundingClientRect();
  const computed = getComputedStyle(pageContainer);
  const mapStage = pageContainer.querySelector(
    EXPORT_MAP_STAGE_SELECTOR
  ) as HTMLElement | null;
  const mapFrame = mapStage ? getRelativeRect(mapStage, pageContainer) : null;
  const paddingRight = parseCssPixels(computed.paddingRight);
  const paddingBottom = parseCssPixels(computed.paddingBottom);
  const width = Math.max(
    1,
    pageContainer.offsetWidth,
    pageRect.width,
    mapFrame ? mapFrame.x + mapFrame.width + paddingRight : 0
  );
  const height = Math.max(
    1,
    pageContainer.offsetHeight,
    pageRect.height,
    mapFrame ? mapFrame.y + mapFrame.height + paddingBottom : 0
  );

  return { width, height, mapFrame };
}

export function roundSvgValue(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : '0';
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isNumberArrayLike(value: unknown): value is ArrayLike<number> {
  if (Array.isArray(value)) return true;
  if (ArrayBuffer.isView(value) && 'length' in value) return true;

  return (
    isRecord(value) &&
    typeof value.length === 'number' &&
    Number.isFinite(value.length)
  );
}

export function toNumberTuple(value: unknown, size?: number): number[] | null {
  if (!isNumberArrayLike(value)) return null;

  const tupleSize = Math.max(1, Math.floor(size ?? value.length));
  const output: number[] = [];

  for (let index = 0; index < tupleSize; index++) {
    const item = Number(value[index]);
    if (!Number.isFinite(item)) return null;
    output.push(item);
  }

  return output;
}

export function toFiniteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function sanitizeSvgId(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'layer';
}

export function parseCssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
