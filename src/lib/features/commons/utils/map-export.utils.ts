import * as m from '$lib/paraglide/messages';
import { globalActions } from '$lib/features/commons/stores/global.svelte';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';
import { toCanvas as htmlToImageCanvas } from 'html-to-image';
import type { Deck, View } from '@deck.gl/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { motif } from '@ateliercartographie/motif.js';
import type { PatternOptions } from '@ateliercartographie/motif.js';
import {
  isValidPatternId,
  PATTERN_TYPE_MAP,
  type PatternName
} from '$lib/features/map/layers/pattern-texture';
import { SYMBOL_SDF_EXTENT } from '$lib/features/commons/constants/visualization.constants';

interface ExportOptions {
  width: number;
  height: number;
}

interface RelativeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageExportGeometry {
  width: number;
  height: number;
  mapFrame: RelativeRect | null;
}

type DeckInstance = Deck<View | View[] | null>;
type RestoreExportRender = () => Promise<void>;
interface FrozenCanvas {
  image: HTMLImageElement;
  restore: RestoreExportRender;
}

interface SvgViewportLike {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  project(position: number[]): number[] | { x: number; y: number };
}

interface SvgDeckLike {
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

interface SvgDeckLayerLike {
  id?: string;
  props?: Record<string, unknown>;
  constructor?: {
    layerName?: string;
    name?: string;
  };
}

interface BinaryAttributeLike {
  value?: ArrayLike<number>;
  size?: number;
  stride?: number;
  offset?: number;
  normalized?: boolean;
}

interface BinaryLayerDataLike {
  length?: number;
  startIndices?: ArrayLike<number>;
  attributes?: Record<string, BinaryAttributeLike | undefined>;
}

interface SvgProjectionContext {
  canvasRect: RelativeRect;
  viewport: SvgViewportLike;
}

interface SvgColor {
  red: number;
  green: number;
  blue: number;
  opacity: number;
}

interface GeoJsonGeometryLike {
  type?: string;
  coordinates?: unknown;
}

interface GeoJsonFeatureLike {
  type?: string;
  geometry?: GeoJsonGeometryLike | null;
  properties?: Record<string, unknown> | null;
}

interface StructuredSvgOptions {
  mapLibreBackgroundDataUrl?: string | null;
}

const SVG_EXPORT_STYLE_PROPERTIES = [
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

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  width: 1920,
  height: 1080
};
const EXPORT_RENDER_TIMEOUT_MS = 10000;
const PIXEL_RATIO_EPSILON = 0.001;
const FROZEN_CANVAS_ATTRIBUTE = 'data-khartis-export-frozen-canvas';
const SVG_MAP_FRAME_CLIP_ID = 'khartis-map-frame-clip';
const EXPORT_PAGE_SELECTOR = '.page-container, .facets-page';
const EXPORT_MAP_STAGE_SELECTOR = '.map-stage, .facets-map-stage';
const EXPORT_MAP_SURFACE_SELECTOR = '.map-canvas, .shared-facets-canvas';
const EXPORT_MAP_CANVAS_SELECTOR =
  '.map-canvas canvas, .shared-facets-canvas canvas, canvas';

interface SvgPatternDefinition {
  defsHtml: string;
  patternUrl: string;
}

const svgPatternDefsCache = new Map<string, SvgPatternDefinition>();

function getExportPixelRatio(
  pageContainer: HTMLElement,
  options: ExportOptions
): number {
  return Math.min(
    options.width / pageContainer.offsetWidth,
    options.height / pageContainer.offsetHeight
  );
}

function getExportPixelRatioForSize(
  width: number,
  height: number,
  options: ExportOptions
): number {
  return Math.min(options.width / width, options.height / height);
}

function exportFilter(domNode: HTMLElement): boolean {
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

async function waitForMapRender(map: MapLibreMap): Promise<void> {
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

async function prerenderWebgl(
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

function mutateDomForExport(pageContainer: HTMLElement): () => void {
  pageContainer.classList.add('is-exporting-map');

  const pageGrids = Array.from(
    pageContainer.querySelectorAll<HTMLElement>('.page-grid')
  );
  const pageGridDisplays = pageGrids.map((grid) => grid.style.display);
  pageGrids.forEach((grid) => {
    grid.style.display = 'none';
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
    if (mapStage) mapStage.style.filter = savedFilter;
  };
}

function waitForNextFrame(): Promise<void> {
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

async function freezeCanvasesForExport(
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

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isTransparentColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === '' ||
    normalized === 'transparent' ||
    normalized === 'rgba(0, 0, 0, 0)'
  );
}

interface ParsedBoxShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
  opacity: number;
}

function parseBoxShadow(value: string): ParsedBoxShadow | null {
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

function getRelativeRect(
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

function resolvePageExportGeometry(
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

function roundSvgValue(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : '0';
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumberArrayLike(value: unknown): value is ArrayLike<number> {
  if (Array.isArray(value)) return true;
  if (ArrayBuffer.isView(value) && 'length' in value) return true;

  return (
    isRecord(value) &&
    typeof value.length === 'number' &&
    Number.isFinite(value.length)
  );
}

function toNumberTuple(value: unknown, size?: number): number[] | null {
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

function toFiniteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function sanitizeSvgId(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'layer';
}

function getLayerProps(layer: SvgDeckLayerLike): Record<string, unknown> {
  return isRecord(layer.props) ? layer.props : {};
}

function getLayerId(layer: SvgDeckLayerLike, index: number): string {
  const props = getLayerProps(layer);
  const id = typeof layer.id === 'string' ? layer.id : props.id;

  return typeof id === 'string' && id.trim() ? id : `deck-layer-${index + 1}`;
}

function getLayerTypeName(layer: SvgDeckLayerLike): string {
  return layer.constructor?.layerName ?? layer.constructor?.name ?? 'DeckLayer';
}

function isDeckLayerLike(value: unknown): value is SvgDeckLayerLike {
  return isRecord(value) && isRecord(value.props);
}

function isDeckLike(value: unknown): value is SvgDeckLike {
  if (!isRecord(value)) return false;

  return (
    typeof value.getViewports === 'function' ||
    isRecord(value.layerManager) ||
    isRecord(value.viewManager)
  );
}

function resolveActiveDeckForSvg(): SvgDeckLike | null {
  const standaloneDeck = mapInstanceStore.deckInstance as unknown;
  if (isDeckLike(standaloneDeck)) {
    return standaloneDeck;
  }

  const map = mapInstanceStore.map as unknown;
  if (isRecord(map) && isDeckLike(map.__deck)) {
    return map.__deck;
  }

  const overlay = mapInstanceStore.deckOverlay as unknown;
  if (isRecord(overlay) && isDeckLike(overlay._deck)) {
    return overlay._deck;
  }

  return null;
}

function resolveDeckLayers(deck: SvgDeckLike): SvgDeckLayerLike[] {
  const layerManager = isRecord(deck.layerManager) ? deck.layerManager : null;
  const managedLayers =
    typeof layerManager?.getLayers === 'function'
      ? layerManager.getLayers()
      : null;
  const propLayers = Array.isArray(deck.props?.layers)
    ? deck.props.layers
    : null;

  return (managedLayers ?? propLayers ?? []).filter(isDeckLayerLike);
}

function resolveDeckViewports(deck: SvgDeckLike): SvgViewportLike[] {
  const viewports =
    typeof deck.getViewports === 'function'
      ? deck.getViewports()
      : typeof deck.viewManager?.getViewports === 'function'
        ? deck.viewManager.getViewports()
        : [];

  return viewports.filter(
    (viewport): viewport is SvgViewportLike =>
      Boolean(viewport) && typeof viewport.project === 'function'
  );
}

function getViewportNumber(
  viewport: SvgViewportLike,
  key: 'x' | 'y' | 'width' | 'height',
  fallback: number
): number {
  const value = viewport[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getViewportId(viewport: SvgViewportLike, index: number): string {
  return typeof viewport.id === 'string' && viewport.id.trim()
    ? viewport.id
    : `viewport-${index + 1}`;
}

function shouldRenderLayerInViewport(
  deck: SvgDeckLike,
  layer: SvgDeckLayerLike,
  viewport: SvgViewportLike
): boolean {
  const layerFilter = deck.props?.layerFilter;
  if (typeof layerFilter !== 'function') {
    return true;
  }

  try {
    return (
      layerFilter({
        layer,
        viewport,
        isPicking: false,
        renderPass: 'screen'
      }) !== false
    );
  } catch {
    return true;
  }
}

function getBinaryData(
  props: Record<string, unknown>
): BinaryLayerDataLike | null {
  const data = props.data;
  return isRecord(data) ? (data as BinaryLayerDataLike) : null;
}

function getBinaryAttribute(
  data: BinaryLayerDataLike | null,
  name: string
): BinaryAttributeLike | null {
  const attribute = data?.attributes?.[name];
  if (!attribute || !isNumberArrayLike(attribute.value)) return null;

  const size = Math.max(1, Math.floor(attribute.size ?? 1));
  return { ...attribute, size };
}

function getBinaryLength(
  data: BinaryLayerDataLike,
  attribute: BinaryAttributeLike
): number {
  if (Number.isFinite(data.length) && (data.length ?? 0) > 0) {
    return Math.floor(data.length ?? 0);
  }

  const size = Math.max(1, Math.floor(attribute.size ?? 1));
  const stride = Math.max(size, Math.floor(attribute.stride ?? size));

  return Math.floor((attribute.value?.length ?? 0) / stride);
}

function readBinaryTuple(
  attribute: BinaryAttributeLike | null,
  index: number
): number[] | null {
  if (!attribute?.value) return null;

  const size = Math.max(1, Math.floor(attribute.size ?? 1));
  const stride = Math.max(size, Math.floor(attribute.stride ?? size));
  const offset = Math.max(0, Math.floor(attribute.offset ?? 0));
  const start = offset + index * stride;
  const output: number[] = [];

  for (let itemIndex = 0; itemIndex < size; itemIndex++) {
    const value = Number(attribute.value[start + itemIndex]);
    if (!Number.isFinite(value)) return null;
    output.push(value);
  }

  return output;
}

function readBinaryNumber(
  attribute: BinaryAttributeLike | null,
  index: number,
  fallback: number
): number {
  const tuple = readBinaryTuple(attribute, index);
  return tuple ? toFiniteNumber(tuple[0], fallback) : fallback;
}

function getLayerNumber(
  props: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  return toFiniteNumber(props[key], fallback);
}

function resolveAccessorValue(
  accessor: unknown,
  datum: unknown,
  index: number
): unknown {
  if (typeof accessor !== 'function') {
    return accessor;
  }

  try {
    return (accessor as (item: unknown, info?: { index: number }) => unknown)(
      datum,
      { index }
    );
  } catch {
    return undefined;
  }
}

function resolveAccessorNumber(
  accessor: unknown,
  datum: unknown,
  index: number,
  fallback: number
): number {
  return toFiniteNumber(resolveAccessorValue(accessor, datum, index), fallback);
}

function stripDefsWrapper(defsHtml: string): string {
  return defsHtml.replace(/^\s*<defs[^>]*>/i, '').replace(/<\/defs>\s*$/i, '');
}

function buildSvgPatternCacheKey(
  patternId: PatternName,
  params: { angle?: number; size: number; scale: number }
): string {
  return JSON.stringify({
    patternId,
    angle: params.angle,
    size: params.size,
    scale: params.scale
  });
}

function generateSvgPatternDefinition(
  patternId: PatternName,
  params: { angle?: number; size: number; scale: number }
): SvgPatternDefinition | null {
  const config = PATTERN_TYPE_MAP[patternId];
  if (!config) return null;

  const tile = motif({
    type: config.type as PatternOptions['type'],
    angle: params.angle ?? config.angle,
    fill: '#000000',
    background: 'transparent',
    size: Math.round((params.size / params.scale) * 100),
    scale: params.scale / 10,
    patchSize: true
  });

  return {
    defsHtml: stripDefsWrapper(tile.defs.outerHTML),
    patternUrl: tile.url
  };
}

function resolveSvgPatternReference(
  props: Record<string, unknown>,
  datum: unknown,
  index: number
): SvgPatternDefinition | null {
  const rawPatternId =
    props.khartisPatternId ??
    resolveAccessorValue(props.getFillPattern, datum, index);
  const patternId = String(rawPatternId ?? '');
  if (!isValidPatternId(patternId)) {
    return null;
  }

  const fallbackAngle = PATTERN_TYPE_MAP[patternId]?.angle;
  const size = Math.max(1, toFiniteNumber(props.khartisPatternSize, 4));
  const scale = Math.max(
    1,
    toFiniteNumber(
      props.khartisPatternScale,
      resolveAccessorNumber(props.getFillPatternScale, datum, index, 200) / 25
    )
  );
  const angle = toFiniteNumber(
    props.khartisPatternAngle,
    resolveAccessorNumber(
      props.getFillPatternRotation,
      datum,
      index,
      fallbackAngle ?? 0
    )
  );
  const cacheKey = buildSvgPatternCacheKey(patternId, {
    angle,
    size,
    scale
  });
  const cached = svgPatternDefsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const generated = generateSvgPatternDefinition(patternId, {
    angle,
    size,
    scale
  });
  if (!generated) {
    return null;
  }

  svgPatternDefsCache.set(cacheKey, generated);
  return generated;
}

function fillAttributes(
  color: SvgColor,
  pattern?: SvgPatternDefinition | null
): string {
  if (color.opacity <= 0) {
    return 'fill="none"';
  }

  if (!pattern) {
    return colorAttributes('fill', color);
  }

  return `fill="${escapeXml(pattern.patternUrl)}" fill-opacity="${roundSvgValue(color.opacity)}"`;
}

function resolveAccessorTuple(
  accessor: unknown,
  datum: unknown,
  index: number,
  fallback: number[]
): number[] {
  return (
    toNumberTuple(
      resolveAccessorValue(accessor, datum, index),
      fallback.length
    ) ?? fallback
  );
}

function normalizeSvgColor(value: unknown, fallback: number[]): SvgColor {
  const tuple = toNumberTuple(value, 4) ?? fallback;
  const red = toFiniteNumber(tuple[0], fallback[0] ?? 0);
  const green = toFiniteNumber(tuple[1], fallback[1] ?? 0);
  const blue = toFiniteNumber(tuple[2], fallback[2] ?? 0);
  const alpha = toFiniteNumber(tuple[3], fallback[3] ?? 255);
  const normalizedColor =
    red >= 0 &&
    red <= 1 &&
    green >= 0 &&
    green <= 1 &&
    blue >= 0 &&
    blue <= 1 &&
    alpha >= 0 &&
    alpha <= 1;

  return {
    red: Math.round(clamp(normalizedColor ? red * 255 : red, 0, 255)),
    green: Math.round(clamp(normalizedColor ? green * 255 : green, 0, 255)),
    blue: Math.round(clamp(normalizedColor ? blue * 255 : blue, 0, 255)),
    opacity: clamp(normalizedColor ? alpha : alpha / 255, 0, 1)
  };
}

function applyLayerOpacity(color: SvgColor, layerOpacity: number): SvgColor {
  return {
    ...color,
    opacity: clamp(color.opacity * layerOpacity, 0, 1)
  };
}

function colorAttributes(
  attribute: 'fill' | 'stroke',
  color: SvgColor
): string {
  if (color.opacity <= 0) {
    return `${attribute}="none"`;
  }

  const value = `rgb(${color.red}, ${color.green}, ${color.blue})`;
  const opacityName = `${attribute}-opacity`;

  return `${attribute}="${escapeXml(value)}" ${opacityName}="${roundSvgValue(color.opacity)}"`;
}

function transformByModelMatrix(
  position: number[],
  modelMatrix: unknown
): number[] {
  if (!modelMatrix) return position;

  const x = position[0] ?? 0;
  const y = position[1] ?? 0;
  const z = position[2] ?? 0;

  if (isRecord(modelMatrix)) {
    const transformAsPoint = modelMatrix.transformAsPoint;
    if (typeof transformAsPoint === 'function') {
      const transformed = transformAsPoint.call(modelMatrix, [x, y, z]);
      const tuple = toNumberTuple(transformed, 3);
      if (tuple) return tuple;
    }

    const transform = modelMatrix.transform;
    if (typeof transform === 'function') {
      const transformed = transform.call(modelMatrix, [x, y, z]);
      const tuple = toNumberTuple(transformed, 3);
      if (tuple) return tuple;
    }

    const elements = modelMatrix.elements;
    if (isNumberArrayLike(elements) && elements.length >= 16) {
      return multiplyMatrixPosition(elements, x, y, z);
    }
  }

  if (isNumberArrayLike(modelMatrix) && modelMatrix.length >= 16) {
    return multiplyMatrixPosition(modelMatrix, x, y, z);
  }

  return position;
}

function multiplyMatrixPosition(
  matrix: ArrayLike<number>,
  x: number,
  y: number,
  z: number
): number[] {
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + (matrix[15] ?? 1);
  const divisor = Number.isFinite(w) && w !== 0 ? w : 1;

  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / divisor,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / divisor,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / divisor
  ];
}

function projectPosition(
  position: number[],
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext
): [number, number] | null {
  const props = getLayerProps(layer);
  const transformed = transformByModelMatrix(position, props.modelMatrix);
  let projected: number[] | { x: number; y: number };

  try {
    projected = context.viewport.project(transformed);
  } catch {
    return null;
  }

  const tuple = isNumberArrayLike(projected)
    ? toNumberTuple(projected, 2)
    : isRecord(projected)
      ? [Number(projected.x), Number(projected.y)]
      : null;

  if (!tuple || !Number.isFinite(tuple[0]) || !Number.isFinite(tuple[1])) {
    return null;
  }

  return [context.canvasRect.x + tuple[0], context.canvasRect.y + tuple[1]];
}

function buildLayerGroup(
  layer: SvgDeckLayerLike,
  index: number,
  content: string,
  idSuffix: string = ''
): string {
  if (!content.trim()) return '';

  const layerId = getLayerId(layer, index);
  const layerType = getLayerTypeName(layer);
  const safeSuffix = idSuffix ? `-${sanitizeSvgId(idSuffix)}` : '';

  return `
    <g
      id="khartis-deck-layer-${escapeXml(sanitizeSvgId(layerId))}${escapeXml(safeSuffix)}"
      data-khartis-layer-id="${escapeXml(layerId)}"
      data-khartis-layer-type="${escapeXml(layerType)}"
    >
      ${content}
    </g>
  `;
}

function buildProjectedPath(
  positionAttribute: BinaryAttributeLike,
  start: number,
  end: number,
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext,
  close: boolean,
  vertexValidAttribute?: BinaryAttributeLike | null
): string {
  const commands: string[] = [];
  let isSubpathOpen = false;

  for (let vertexIndex = start; vertexIndex < end; vertexIndex++) {
    const position = readBinaryTuple(positionAttribute, vertexIndex);
    if (!position) continue;

    const projected = projectPosition(position, layer, context);
    if (!projected) continue;

    commands.push(
      `${isSubpathOpen ? 'L' : 'M'} ${roundSvgValue(projected[0])} ${roundSvgValue(projected[1])}`
    );
    isSubpathOpen = true;

    const isRingEnd =
      close &&
      vertexValidAttribute &&
      readBinaryNumber(vertexValidAttribute, vertexIndex, 1) === 0;
    if (isRingEnd) {
      commands.push('Z');
      isSubpathOpen = false;
    }
  }

  if (close && isSubpathOpen) {
    commands.push('Z');
  }

  return commands.join(' ');
}

function resolveStartIndices(
  data: BinaryLayerDataLike
): ArrayLike<number> | null {
  return isNumberArrayLike(data.startIndices) && data.startIndices.length >= 2
    ? data.startIndices
    : null;
}

// Mirrors of the MultiShapeLayer SDF proportions (multi-shape-layer.ts,
// getDistance), converted to attribute-radius units (SDF unit ÷ extent).
const SQUARE_HALF_RATIO = 0.6 / SYMBOL_SDF_EXTENT;
const CROSS_ARM_RATIO = 0.7 / SYMBOL_SDF_EXTENT;
const CROSS_HALF_THICKNESS_RATIO = CROSS_ARM_RATIO / 3;
const RECTANGLE_HALF_WIDTH_RATIO = 0.9 / SYMBOL_SDF_EXTENT;
const RECTANGLE_HALF_HEIGHT_RATIO = 0.27 / SYMBOL_SDF_EXTENT;

function serializePointShape(
  shape: number,
  x: number,
  y: number,
  radius: number,
  fillAttributes: string,
  strokeAttributes: string,
  strokeWidth: number,
  barWidth: number = 6
): string {
  const common = `${fillAttributes} ${strokeAttributes} stroke-width="${roundSvgValue(strokeWidth)}"`;

  switch (Math.round(shape)) {
    case 1: {
      const half = radius * SQUARE_HALF_RATIO;
      return `<rect x="${roundSvgValue(x - half)}" y="${roundSvgValue(y - half)}" width="${roundSvgValue(half * 2)}" height="${roundSvgValue(half * 2)}" ${common} />`;
    }
    case 4: {
      const arm = radius * CROSS_ARM_RATIO;
      const half = radius * CROSS_HALF_THICKNESS_RATIO;
      return `<path d="M ${roundSvgValue(x - half)} ${roundSvgValue(y - arm)} L ${roundSvgValue(x + half)} ${roundSvgValue(y - arm)} L ${roundSvgValue(x + half)} ${roundSvgValue(y - half)} L ${roundSvgValue(x + arm)} ${roundSvgValue(y - half)} L ${roundSvgValue(x + arm)} ${roundSvgValue(y + half)} L ${roundSvgValue(x + half)} ${roundSvgValue(y + half)} L ${roundSvgValue(x + half)} ${roundSvgValue(y + arm)} L ${roundSvgValue(x - half)} ${roundSvgValue(y + arm)} L ${roundSvgValue(x - half)} ${roundSvgValue(y + half)} L ${roundSvgValue(x - arm)} ${roundSvgValue(y + half)} L ${roundSvgValue(x - arm)} ${roundSvgValue(y - half)} L ${roundSvgValue(x - half)} ${roundSvgValue(y - half)} Z" ${common} />`;
    }
    case 5:
      return `<path d="M ${roundSvgValue(x)} ${roundSvgValue(y - radius)} L ${roundSvgValue(x + radius)} ${roundSvgValue(y)} L ${roundSvgValue(x)} ${roundSvgValue(y + radius)} L ${roundSvgValue(x - radius)} ${roundSvgValue(y)} Z" ${common} />`;
    case 6:
      return `<path d="M ${roundSvgValue(x)} ${roundSvgValue(y - radius)} L ${roundSvgValue(x + radius)} ${roundSvgValue(y + radius)} L ${roundSvgValue(x - radius)} ${roundSvgValue(y + radius)} Z" ${common} />`;
    case 3: {
      const spikeHalfWidth = (barWidth * 1.5) / 2;
      return `<path d="M ${roundSvgValue(x - spikeHalfWidth)} ${roundSvgValue(y)} L ${roundSvgValue(x)} ${roundSvgValue(y - radius * 2)} L ${roundSvgValue(x + spikeHalfWidth)} ${roundSvgValue(y)} Z" ${common} />`;
    }
    case 7:
      return `<path d="M ${roundSvgValue(x)} ${roundSvgValue(y - radius)} L ${roundSvgValue(x + radius * 0.22)} ${roundSvgValue(y - radius * 0.22)} L ${roundSvgValue(x + radius)} ${roundSvgValue(y - radius * 0.15)} L ${roundSvgValue(x + radius * 0.36)} ${roundSvgValue(y + radius * 0.18)} L ${roundSvgValue(x + radius * 0.58)} ${roundSvgValue(y + radius)} L ${roundSvgValue(x)} ${roundSvgValue(y + radius * 0.5)} L ${roundSvgValue(x - radius * 0.58)} ${roundSvgValue(y + radius)} L ${roundSvgValue(x - radius * 0.36)} ${roundSvgValue(y + radius * 0.18)} L ${roundSvgValue(x - radius)} ${roundSvgValue(y - radius * 0.15)} L ${roundSvgValue(x - radius * 0.22)} ${roundSvgValue(y - radius * 0.22)} Z" ${common} />`;
    case 2: {
      const barHalfWidth = barWidth / 2;
      return `<rect x="${roundSvgValue(x - barHalfWidth)}" y="${roundSvgValue(y - radius * 2)}" width="${roundSvgValue(barHalfWidth * 2)}" height="${roundSvgValue(radius * 2)}" ${common} />`;
    }
    case 8: {
      const halfWidth = radius * RECTANGLE_HALF_WIDTH_RATIO;
      const halfHeight = radius * RECTANGLE_HALF_HEIGHT_RATIO;
      return `<rect x="${roundSvgValue(x - halfWidth)}" y="${roundSvgValue(y - halfHeight)}" width="${roundSvgValue(halfWidth * 2)}" height="${roundSvgValue(halfHeight * 2)}" ${common} />`;
    }
    case 0:
    default:
      return `<circle cx="${roundSvgValue(x)}" cy="${roundSvgValue(y)}" r="${roundSvgValue(radius)}" ${common} />`;
  }
}

function serializePointLayer(
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext
): string {
  const props = getLayerProps(layer);
  const data = getBinaryData(props);
  const positionAttribute = getBinaryAttribute(data, 'getPosition');
  if (!data || !positionAttribute) return '';

  const length = getBinaryLength(data, positionAttribute);
  const fillAttribute =
    getBinaryAttribute(data, 'getFillColor') ??
    getBinaryAttribute(data, 'getColor');
  const strokeAttribute =
    getBinaryAttribute(data, 'getLineColor') ??
    getBinaryAttribute(data, 'getStrokeColor');
  const radiusAttribute = getBinaryAttribute(data, 'getRadius');
  const shapeAttribute = getBinaryAttribute(data, 'getShape');
  const lineWidthAttribute = getBinaryAttribute(data, 'getLineWidth');
  const layerOpacity = getLayerNumber(props, 'opacity', 1);
  const radiusScale = getLayerNumber(props, 'radiusScale', 1);
  const radiusMinPixels = getLayerNumber(props, 'radiusMinPixels', 0);
  const radiusMaxPixels = getLayerNumber(
    props,
    'radiusMaxPixels',
    Number.POSITIVE_INFINITY
  );
  const filled = props.filled !== false;
  const stroked = props.stroked === true || Boolean(strokeAttribute);
  const lineWidthScale = getLayerNumber(props, 'lineWidthScale', 1);
  const barWidth = getLayerNumber(props, 'barWidth', 6);
  const parts: string[] = [];

  for (let index = 0; index < length; index++) {
    const position = readBinaryTuple(positionAttribute, index);
    if (!position) continue;

    const projected = projectPosition(position, layer, context);
    if (!projected) continue;

    const rawRadius = radiusAttribute
      ? readBinaryNumber(radiusAttribute, index, 1)
      : getLayerNumber(props, 'getRadius', 1);
    const radius = clamp(
      Math.max(0, rawRadius * radiusScale),
      radiusMinPixels,
      radiusMaxPixels
    );
    if (radius <= 0) continue;

    const fillColor = filled
      ? applyLayerOpacity(
          fillAttribute
            ? normalizeSvgColor(
                readBinaryTuple(fillAttribute, index),
                [0, 0, 0, 255]
              )
            : normalizeSvgColor(props.getFillColor, [0, 0, 0, 255]),
          layerOpacity
        )
      : normalizeSvgColor([0, 0, 0, 0], [0, 0, 0, 0]);
    const strokeColor = stroked
      ? applyLayerOpacity(
          strokeAttribute
            ? normalizeSvgColor(
                readBinaryTuple(strokeAttribute, index),
                [0, 0, 0, 255]
              )
            : normalizeSvgColor(props.getLineColor, [0, 0, 0, 255]),
          layerOpacity
        )
      : normalizeSvgColor([0, 0, 0, 0], [0, 0, 0, 0]);
    const strokeWidth = stroked
      ? Math.max(
          0,
          readBinaryNumber(
            lineWidthAttribute,
            index,
            getLayerNumber(props, 'getLineWidth', 1)
          ) * lineWidthScale
        )
      : 0;
    const shape = readBinaryNumber(
      shapeAttribute,
      index,
      getLayerNumber(props, 'getShape', 0)
    );

    if (fillColor.opacity <= 0 && strokeColor.opacity <= 0) continue;

    parts.push(
      serializePointShape(
        shape,
        projected[0],
        projected[1],
        radius,
        colorAttributes('fill', fillColor),
        colorAttributes('stroke', strokeColor),
        strokeWidth,
        barWidth
      )
    );
  }

  return parts.join('');
}

function serializePathLayer(
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext
): string {
  const props = getLayerProps(layer);
  const data = getBinaryData(props);
  const pathAttribute = getBinaryAttribute(data, 'getPath');
  const startIndices = data ? resolveStartIndices(data) : null;
  if (!data || !pathAttribute || !startIndices) return '';

  const length = Math.min(
    getBinaryLength(data, pathAttribute),
    startIndices.length - 1
  );
  const colorAttribute =
    getBinaryAttribute(data, 'getColor') ??
    getBinaryAttribute(data, 'getLineColor');
  const widthAttribute = getBinaryAttribute(data, 'getWidth');
  const layerOpacity = getLayerNumber(props, 'opacity', 1);
  const widthScale = getLayerNumber(
    props,
    'widthScale',
    getLayerNumber(props, 'lineWidthScale', 1)
  );
  const widthMinPixels = getLayerNumber(props, 'widthMinPixels', 0);
  const dashArray = toNumberTuple(props.getDashArray, 2);
  const dashAttribute = dashArray
    ? `stroke-dasharray="${roundSvgValue(dashArray[0])} ${roundSvgValue(dashArray[1])}"`
    : '';
  const parts: string[] = [];

  for (let index = 0; index < length; index++) {
    const start = Math.floor(Number(startIndices[index]));
    const end = Math.floor(Number(startIndices[index + 1]));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }

    const path = buildProjectedPath(
      pathAttribute,
      start,
      end,
      layer,
      context,
      false
    );
    if (!path) continue;

    const color = applyLayerOpacity(
      colorAttribute
        ? normalizeSvgColor(
            readBinaryTuple(colorAttribute, index),
            [0, 0, 0, 255]
          )
        : normalizeSvgColor(
            props.getColor ?? props.getLineColor,
            [0, 0, 0, 255]
          ),
      layerOpacity
    );
    if (color.opacity <= 0) continue;

    const width = Math.max(
      widthMinPixels,
      readBinaryNumber(
        widthAttribute,
        index,
        getLayerNumber(props, 'getWidth', 1)
      ) * widthScale
    );

    parts.push(`
      <path
        d="${path}"
        fill="none"
        ${colorAttributes('stroke', color)}
        stroke-width="${roundSvgValue(width)}"
        stroke-linecap="${escapeXml(String(props.lineCap ?? 'round'))}"
        stroke-linejoin="${escapeXml(String(props.lineJoin ?? 'round'))}"
        ${dashAttribute}
      />
    `);
  }

  return parts.join('');
}

function serializePolygonLayer(
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext
): string {
  const props = getLayerProps(layer);
  const data = getBinaryData(props);
  const polygonAttribute = getBinaryAttribute(data, 'getPolygon');
  const startIndices = data ? resolveStartIndices(data) : null;
  if (!data || !polygonAttribute || !startIndices) return '';

  const length = Math.min(
    getBinaryLength(data, polygonAttribute),
    startIndices.length - 1
  );
  const fillAttribute = getBinaryAttribute(data, 'getFillColor');
  const vertexValidAttribute =
    getBinaryAttribute(data, 'instanceVertexValid') ??
    getBinaryAttribute(data, 'vertexValid');
  const layerOpacity = getLayerNumber(props, 'opacity', 1);
  const parts: string[] = [];

  for (let index = 0; index < length; index++) {
    const start = Math.floor(Number(startIndices[index]));
    const end = Math.floor(Number(startIndices[index + 1]));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }

    const path = buildProjectedPath(
      polygonAttribute,
      start,
      end,
      layer,
      context,
      true,
      vertexValidAttribute
    );
    if (!path) continue;

    const fillColor = applyLayerOpacity(
      fillAttribute
        ? normalizeSvgColor(
            readBinaryTuple(fillAttribute, index),
            [141, 141, 141, 255]
          )
        : normalizeSvgColor(props.getFillColor, [141, 141, 141, 255]),
      layerOpacity
    );
    if (fillColor.opacity <= 0) continue;

    parts.push(`
      <path
        d="${path}"
        ${colorAttributes('fill', fillColor)}
        stroke="none"
        fill-rule="evenodd"
      />
    `);
  }

  return parts.join('');
}

function isGeoJsonFeature(value: unknown): value is GeoJsonFeatureLike {
  return isRecord(value) && value.type === 'Feature';
}

function collectGeoJsonFeatures(data: unknown): GeoJsonFeatureLike[] {
  if (
    isRecord(data) &&
    data.type === 'FeatureCollection' &&
    Array.isArray(data.features)
  ) {
    return data.features.filter(isGeoJsonFeature);
  }

  if (Array.isArray(data)) {
    return data.filter(isGeoJsonFeature);
  }

  if (isGeoJsonFeature(data)) {
    return [data];
  }

  if (isRecord(data) && typeof data.type === 'string') {
    return [
      {
        type: 'Feature',
        geometry: data as GeoJsonGeometryLike,
        properties: null
      }
    ];
  }

  return [];
}

function isCoordinate(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  );
}

function buildCoordinatePath(
  coordinates: unknown,
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext,
  close: boolean
): string {
  if (!Array.isArray(coordinates)) return '';

  const commands: string[] = [];
  coordinates.forEach((coordinate, index) => {
    if (!isCoordinate(coordinate)) return;

    const projected = projectPosition(
      [
        Number(coordinate[0]),
        Number(coordinate[1]),
        Number(coordinate[2] ?? 0)
      ],
      layer,
      context
    );
    if (!projected) return;

    commands.push(
      `${index === 0 ? 'M' : 'L'} ${roundSvgValue(projected[0])} ${roundSvgValue(projected[1])}`
    );
  });

  if (close && commands.length > 0) {
    commands.push('Z');
  }

  return commands.join(' ');
}

function serializeGeoJsonGeometry(
  geometry: GeoJsonGeometryLike | null | undefined,
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext,
  feature: GeoJsonFeatureLike,
  featureIndex: number
): string {
  if (!geometry?.type) return '';

  const props = getLayerProps(layer);
  const layerOpacity = getLayerNumber(props, 'opacity', 1);
  const fillColor = applyLayerOpacity(
    normalizeSvgColor(
      resolveAccessorValue(props.getFillColor, feature, featureIndex),
      [141, 141, 141, 255]
    ),
    layerOpacity
  );
  const pattern = resolveSvgPatternReference(props, feature, featureIndex);
  const lineColor = applyLayerOpacity(
    normalizeSvgColor(
      resolveAccessorValue(props.getLineColor, feature, featureIndex),
      [0, 0, 0, 255]
    ),
    layerOpacity
  );
  const radius = Math.max(
    0,
    resolveAccessorNumber(props.getPointRadius, feature, featureIndex, 4) *
      getLayerNumber(
        props,
        'pointRadiusScale',
        getLayerNumber(props, 'radiusScale', 1)
      )
  );
  const lineWidth = Math.max(
    0,
    resolveAccessorNumber(props.getLineWidth, feature, featureIndex, 1) *
      getLayerNumber(props, 'lineWidthScale', 1)
  );

  if (
    geometry.type === 'Point' &&
    isCoordinate(geometry.coordinates) &&
    radius > 0
  ) {
    const projected = projectPosition(
      [
        Number(geometry.coordinates[0]),
        Number(geometry.coordinates[1]),
        Number(geometry.coordinates[2] ?? 0)
      ],
      layer,
      context
    );
    if (!projected) return '';

    return `<circle cx="${roundSvgValue(projected[0])}" cy="${roundSvgValue(projected[1])}" r="${roundSvgValue(radius)}" ${fillAttributes(fillColor, pattern)} ${colorAttributes('stroke', lineColor)} stroke-width="${roundSvgValue(lineWidth)}" />`;
  }

  if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .map((coordinate) =>
        serializeGeoJsonGeometry(
          { type: 'Point', coordinates: coordinate },
          layer,
          context,
          feature,
          featureIndex
        )
      )
      .join('');
  }

  if (geometry.type === 'LineString') {
    const path = buildCoordinatePath(
      geometry.coordinates,
      layer,
      context,
      false
    );
    if (!path || lineColor.opacity <= 0) return '';

    return `<path d="${path}" fill="none" ${colorAttributes('stroke', lineColor)} stroke-width="${roundSvgValue(lineWidth)}" stroke-linecap="round" stroke-linejoin="round" />`;
  }

  if (
    geometry.type === 'MultiLineString' &&
    Array.isArray(geometry.coordinates)
  ) {
    return geometry.coordinates
      .map((line) =>
        serializeGeoJsonGeometry(
          { type: 'LineString', coordinates: line },
          layer,
          context,
          feature,
          featureIndex
        )
      )
      .join('');
  }

  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const path = geometry.coordinates
      .map((ring) => buildCoordinatePath(ring, layer, context, true))
      .filter(Boolean)
      .join(' ');
    if (!path || fillColor.opacity <= 0) return '';

    const stroke =
      lineColor.opacity > 0 && lineWidth > 0
        ? `${colorAttributes('stroke', lineColor)} stroke-width="${roundSvgValue(lineWidth)}"`
        : 'stroke="none"';

    return `<path d="${path}" ${fillAttributes(fillColor, pattern)} ${stroke} fill-rule="evenodd" />`;
  }

  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .map((polygon) =>
        serializeGeoJsonGeometry(
          { type: 'Polygon', coordinates: polygon },
          layer,
          context,
          feature,
          featureIndex
        )
      )
      .join('');
  }

  return '';
}

function serializeGeoJsonLayer(
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext
): string {
  const props = getLayerProps(layer);
  return collectGeoJsonFeatures(props.data)
    .map((feature, index) =>
      serializeGeoJsonGeometry(feature.geometry, layer, context, feature, index)
    )
    .join('');
}

function textAnchorToSvg(value: unknown): string {
  const anchor = String(value ?? 'middle');
  if (anchor === 'start' || anchor === 'end' || anchor === 'middle') {
    return anchor;
  }

  return 'middle';
}

function baselineToSvg(value: unknown): string {
  const baseline = String(value ?? 'center');
  if (baseline === 'top') return 'text-before-edge';
  if (baseline === 'bottom') return 'text-after-edge';
  return 'central';
}

function normalizeTextPadding(value: unknown): [number, number] {
  const tuple = toNumberTuple(value, 2);
  if (tuple) return [tuple[0], tuple[1]];

  const padding = toFiniteNumber(value, 0);
  return [padding, padding];
}

function estimateTextBox(
  text: string,
  x: number,
  y: number,
  size: number,
  anchor: string,
  padding: [number, number]
): RelativeRect {
  const lines = text.split('\n');
  const textWidth =
    Math.max(...lines.map((line) => line.length), 1) * size * 0.58;
  const width = textWidth + padding[0] * 2;
  const height = lines.length * size * 1.2 + padding[1] * 2;
  const left =
    anchor === 'start'
      ? x - padding[0]
      : anchor === 'end'
        ? x - width + padding[0]
        : x - width / 2;

  return {
    x: left,
    y: y - height / 2,
    width,
    height
  };
}

function serializeTextLayer(
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext
): string {
  const props = getLayerProps(layer);
  if (!Array.isArray(props.data)) return '';

  const layerOpacity = getLayerNumber(props, 'opacity', 1);
  const fontFamily =
    typeof props.fontFamily === 'string' ? props.fontFamily : 'sans-serif';
  const fontWeight = String(props.fontWeight ?? '400');
  const lineHeight = getLayerNumber(props, 'lineHeight', 1.2);
  const backgroundEnabled = props.background === true;
  const backgroundPadding = normalizeTextPadding(props.backgroundPadding);
  const parts: string[] = [];

  props.data.forEach((datum, index) => {
    const position = resolveAccessorTuple(
      props.getPosition,
      datum,
      index,
      [0, 0]
    );
    const projected = projectPosition(position, layer, context);
    if (!projected) return;

    const text = String(
      resolveAccessorValue(props.getText, datum, index) ?? ''
    );
    if (!text) return;

    const pixelOffset = resolveAccessorTuple(
      props.getPixelOffset,
      datum,
      index,
      [0, 0]
    );
    const size = Math.max(
      1,
      resolveAccessorNumber(props.getSize, datum, index, 12)
    );
    const x = projected[0] + (pixelOffset[0] ?? 0);
    const y = projected[1] + (pixelOffset[1] ?? 0);
    const color = applyLayerOpacity(
      normalizeSvgColor(
        resolveAccessorValue(props.getColor, datum, index),
        [0, 0, 0, 255]
      ),
      layerOpacity
    );
    if (color.opacity <= 0) return;

    const anchor = textAnchorToSvg(
      resolveAccessorValue(props.getTextAnchor, datum, index)
    );
    const baseline = baselineToSvg(
      resolveAccessorValue(props.getAlignmentBaseline, datum, index)
    );
    const outlineWidth = getLayerNumber(props, 'outlineWidth', 0);
    const outlineColor = normalizeSvgColor(
      props.outlineColor,
      [255, 255, 255, 255]
    );
    const backgroundColor = backgroundEnabled
      ? normalizeSvgColor(
          resolveAccessorValue(props.getBackgroundColor, datum, index),
          [255, 255, 255, 0]
        )
      : normalizeSvgColor([0, 0, 0, 0], [0, 0, 0, 0]);
    const borderWidth = backgroundEnabled
      ? resolveAccessorNumber(props.getBorderWidth, datum, index, 0)
      : 0;
    const borderColor = backgroundEnabled
      ? normalizeSvgColor(
          resolveAccessorValue(props.getBorderColor, datum, index),
          [0, 0, 0, 0]
        )
      : normalizeSvgColor([0, 0, 0, 0], [0, 0, 0, 0]);

    if (
      backgroundColor.opacity > 0 ||
      (borderColor.opacity > 0 && borderWidth > 0)
    ) {
      const box = estimateTextBox(text, x, y, size, anchor, backgroundPadding);
      const radius = getLayerNumber(props, 'backgroundBorderRadius', 0);
      parts.push(`
        <rect
          x="${roundSvgValue(box.x)}"
          y="${roundSvgValue(box.y)}"
          width="${roundSvgValue(box.width)}"
          height="${roundSvgValue(box.height)}"
          rx="${roundSvgValue(radius)}"
          ry="${roundSvgValue(radius)}"
          ${colorAttributes('fill', backgroundColor)}
          ${borderColor.opacity > 0 && borderWidth > 0 ? colorAttributes('stroke', borderColor) : 'stroke="none"'}
          stroke-width="${roundSvgValue(borderWidth)}"
        />
      `);
    }

    const stroke =
      outlineWidth > 0 && outlineColor.opacity > 0
        ? `${colorAttributes('stroke', outlineColor)} stroke-width="${roundSvgValue(outlineWidth * 2)}" paint-order="stroke fill"`
        : 'stroke="none"';

    parts.push(`
      <text
        x="${roundSvgValue(x)}"
        y="${roundSvgValue(y)}"
        ${colorAttributes('fill', color)}
        ${stroke}
        font-family="${escapeXml(fontFamily)}"
        font-size="${roundSvgValue(size)}"
        font-weight="${escapeXml(fontWeight)}"
        line-height="${roundSvgValue(lineHeight)}"
        text-anchor="${escapeXml(anchor)}"
        dominant-baseline="${escapeXml(baseline)}"
      >${escapeXml(text)}</text>
    `);
  });

  return parts.join('');
}

function serializeDeckLayer(
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext
): string {
  const props = getLayerProps(layer);
  if (props.visible === false) return '';

  const layerTypeName = getLayerTypeName(layer);

  if (
    layerTypeName.includes('ScatterplotLayer') ||
    layerTypeName.includes('MultiShapeLayer')
  ) {
    return serializePointLayer(layer, context);
  }

  if (layerTypeName.includes('PathLayer')) {
    return serializePathLayer(layer, context);
  }

  if (layerTypeName.includes('SolidPolygonLayer')) {
    return serializePolygonLayer(layer, context);
  }

  if (layerTypeName.includes('GeoJsonLayer')) {
    return serializeGeoJsonLayer(layer, context);
  }

  if (layerTypeName.includes('TextLayer')) {
    return serializeTextLayer(layer, context);
  }

  return '';
}

function buildDeckVisualizationLayer(
  pageContainer: HTMLElement,
  mapCanvas: HTMLCanvasElement
): string {
  const deck = resolveActiveDeckForSvg();
  const viewports = deck ? resolveDeckViewports(deck) : [];
  if (!deck || viewports.length === 0) return '';

  const canvasRect = getRelativeRect(mapCanvas, pageContainer);
  const layers = resolveDeckLayers(deck);

  if (viewports.length === 1) {
    const context: SvgProjectionContext = {
      canvasRect,
      viewport: viewports[0]
    };

    return layers
      .map((layer, index) =>
        buildLayerGroup(layer, index, serializeDeckLayer(layer, context))
      )
      .filter(Boolean)
      .join('');
  }

  return viewports
    .map((viewport, viewportIndex) => {
      const viewportId = getViewportId(viewport, viewportIndex);
      const viewportRect: RelativeRect = {
        x: canvasRect.x + getViewportNumber(viewport, 'x', 0),
        y: canvasRect.y + getViewportNumber(viewport, 'y', 0),
        width: getViewportNumber(viewport, 'width', canvasRect.width),
        height: getViewportNumber(viewport, 'height', canvasRect.height)
      };
      const context: SvgProjectionContext = {
        canvasRect: viewportRect,
        viewport
      };
      const content = layers
        .map((layer, layerIndex) =>
          shouldRenderLayerInViewport(deck, layer, viewport)
            ? buildLayerGroup(
                layer,
                layerIndex,
                serializeDeckLayer(layer, context),
                viewportId
              )
            : ''
        )
        .filter(Boolean)
        .join('');

      if (!content) {
        return '';
      }

      const clipId = `khartis-deck-viewport-${sanitizeSvgId(viewportId)}-clip`;

      return `
        <clipPath id="${escapeXml(clipId)}">
          <rect
            x="${roundSvgValue(viewportRect.x)}"
            y="${roundSvgValue(viewportRect.y)}"
            width="${roundSvgValue(viewportRect.width)}"
            height="${roundSvgValue(viewportRect.height)}"
          />
        </clipPath>
        <g
          id="khartis-deck-viewport-${escapeXml(sanitizeSvgId(viewportId))}"
          data-khartis-viewport-id="${escapeXml(viewportId)}"
          clip-path="url(#${escapeXml(clipId)})"
        >
          ${content}
        </g>
      `;
    })
    .filter(Boolean)
    .join('');
}

function buildMapCanvasImageLayer(
  pageContainer: HTMLElement,
  mapCanvas: HTMLCanvasElement,
  canvasDataUrl: string,
  exportMode: string
): string {
  const canvasRect = getRelativeRect(mapCanvas, pageContainer);

  if (!canvasDataUrl || canvasDataUrl === 'data:,') {
    return '';
  }

  return `
    <image
      x="${roundSvgValue(canvasRect.x)}"
      y="${roundSvgValue(canvasRect.y)}"
      width="${roundSvgValue(canvasRect.width)}"
      height="${roundSvgValue(canvasRect.height)}"
      href="${escapeXml(canvasDataUrl)}"
      preserveAspectRatio="none"
      data-khartis-export-mode="${escapeXml(exportMode)}"
    />
  `;
}

function buildCanvasVisualizationFallback(
  pageContainer: HTMLElement,
  mapCanvas: HTMLCanvasElement
): string {
  let canvasDataUrl: string;

  try {
    canvasDataUrl = mapCanvas.toDataURL('image/png');
  } catch {
    return '';
  }

  return buildMapCanvasImageLayer(
    pageContainer,
    mapCanvas,
    canvasDataUrl,
    'raster-fallback'
  );
}

function buildMapLibreBackgroundLayer(
  pageContainer: HTMLElement,
  mapCanvas: HTMLCanvasElement,
  dataUrl: string | null | undefined
): string {
  if (!dataUrl) return '';

  return buildMapCanvasImageLayer(
    pageContainer,
    mapCanvas,
    dataUrl,
    'maplibre-background'
  );
}

async function captureMapLibreBackgroundForSvg(
  pageContainer: HTMLElement
): Promise<string | null> {
  const map = mapInstanceStore.map;
  if (!map || typeof map.once !== 'function') return null;

  const mapCanvas = resolveMapCanvas(pageContainer);
  if (!mapCanvas) return null;

  const deck = resolveActiveDeckForSvg();
  const overlay = mapInstanceStore.deckOverlay as unknown;
  const previousLayers = deck?.props?.layers;
  const layers = Array.isArray(previousLayers)
    ? previousLayers
    : deck
      ? resolveDeckLayers(deck)
      : [];
  const overlaySetProps =
    isRecord(overlay) && typeof overlay.setProps === 'function'
      ? (overlay.setProps as (props: Record<string, unknown>) => void).bind(
          overlay
        )
      : null;
  const deckSetProps =
    deck && typeof deck.setProps === 'function'
      ? deck.setProps.bind(deck)
      : null;
  const setLayers = overlaySetProps ?? deckSetProps;

  if (!setLayers || layers.length === 0) {
    return null;
  }

  try {
    setLayers({ layers: [] });
    await waitForMapRender(map);
    return mapCanvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    try {
      setLayers({ layers });
      await waitForMapRender(map);
    } catch {
      // Keep SVG export usable even if the temporary background capture fails.
    }
  }
}

function parseCssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSvgComputedStyle(element: SVGElement): string {
  const computed = getComputedStyle(element);

  return SVG_EXPORT_STYLE_PROPERTIES.map((property) => {
    if (property !== 'color' && element.hasAttribute(property)) {
      return '';
    }

    const value = computed.getPropertyValue(property).trim();
    return value ? `${property}: ${value}` : '';
  })
    .filter(Boolean)
    .join('; ');
}

function inlineSvgComputedStyles(source: SVGElement, clone: SVGElement): void {
  const computedStyle = getSvgComputedStyle(source);
  const existingStyle = clone.getAttribute('style')?.trim();
  const style = [existingStyle, computedStyle].filter(Boolean).join('; ');

  if (style) {
    clone.setAttribute('style', style);
  }

  const sourceChildren = Array.from(source.children).filter(
    (child): child is SVGElement => child instanceof SVGElement
  );
  const cloneChildren = Array.from(clone.children).filter(
    (child): child is SVGElement => child instanceof SVGElement
  );

  sourceChildren.forEach((sourceChild, index) => {
    const cloneChild = cloneChildren[index];
    if (cloneChild) {
      inlineSvgComputedStyles(sourceChild, cloneChild);
    }
  });
}

function serializeSvgNode(
  element: SVGElement,
  position?: Partial<RelativeRect>
): string {
  const clone = element.cloneNode(true) as SVGElement;
  inlineSvgComputedStyles(element, clone);

  if (position?.x !== undefined) {
    clone.setAttribute('x', roundSvgValue(position.x));
  }
  if (position?.y !== undefined) {
    clone.setAttribute('y', roundSvgValue(position.y));
  }
  if (position?.width !== undefined) {
    clone.setAttribute('width', roundSvgValue(position.width));
  }
  if (position?.height !== undefined) {
    clone.setAttribute('height', roundSvgValue(position.height));
  }

  return new XMLSerializer().serializeToString(clone);
}

let dropShadowFilterCounter = 0;

function buildDropShadowFilter(shadow: ParsedBoxShadow): {
  id: string;
  markup: string;
} {
  dropShadowFilterCounter += 1;
  const id = `khartis-drop-shadow-${dropShadowFilterCounter}`;
  const markup = `
    <filter
      id="${id}"
      x="-20%"
      y="-20%"
      width="140%"
      height="140%"
    >
      <feDropShadow
        dx="${roundSvgValue(shadow.offsetX)}"
        dy="${roundSvgValue(shadow.offsetY)}"
        stdDeviation="${roundSvgValue(shadow.blur / 2)}"
        flood-color="${escapeXml(shadow.color)}"
        flood-opacity="${roundSvgValue(shadow.opacity)}"
      />
    </filter>
  `;
  return { id, markup };
}

function buildElementBackgroundRect(
  element: HTMLElement,
  width: number,
  height: number
): string {
  const styles = getComputedStyle(element);
  const backgroundColor = styles.backgroundColor;
  const borderWidth = Math.max(
    parseCssPixels(styles.borderTopWidth),
    parseCssPixels(styles.borderRightWidth),
    parseCssPixels(styles.borderBottomWidth),
    parseCssPixels(styles.borderLeftWidth)
  );
  const hasBorder =
    borderWidth > 0 &&
    styles.borderStyle !== 'none' &&
    !isTransparentColor(styles.borderColor);

  if (isTransparentColor(backgroundColor) && !hasBorder) {
    return '';
  }

  const radius = parseCssPixels(styles.borderTopLeftRadius);
  const fill = isTransparentColor(backgroundColor) ? 'none' : backgroundColor;
  const strokeAttributes = hasBorder
    ? `stroke="${escapeXml(styles.borderColor)}" stroke-width="${roundSvgValue(borderWidth)}"`
    : 'stroke="none"';
  const shadow = parseBoxShadow(styles.boxShadow);
  const filter = shadow ? buildDropShadowFilter(shadow) : null;

  return `
    ${filter ? filter.markup : ''}
    <rect
      x="0"
      y="0"
      width="${roundSvgValue(width)}"
      height="${roundSvgValue(height)}"
      rx="${roundSvgValue(radius)}"
      ry="${roundSvgValue(radius)}"
      fill="${escapeXml(fill)}"
      ${strokeAttributes}
      opacity="${escapeXml(styles.opacity || '1')}"
      ${filter ? `filter="url(#${filter.id})"` : ''}
    />
  `;
}

function resolveLineHeight(computed: CSSStyleDeclaration): number {
  const lineHeight = parseCssPixels(computed.lineHeight);
  if (lineHeight > 0) return lineHeight;

  const fontSize = parseCssPixels(computed.fontSize);
  return fontSize > 0 ? fontSize * 1.2 : 12;
}

function resolveTextAnchor(textAlign: string): string {
  if (textAlign === 'center') return 'middle';
  if (textAlign === 'right' || textAlign === 'end') return 'end';
  return 'start';
}

function resolveAlignedTextX(
  rect: RelativeRect,
  computed: CSSStyleDeclaration
): number {
  const leftPadding = parseCssPixels(computed.paddingLeft);
  const rightPadding = parseCssPixels(computed.paddingRight);
  const textAlign = computed.textAlign;

  if (textAlign === 'center') {
    return rect.x + leftPadding + (rect.width - leftPadding - rightPadding) / 2;
  }

  if (textAlign === 'right' || textAlign === 'end') {
    return rect.x + rect.width - rightPadding;
  }

  return rect.x + leftPadding;
}

interface NativeTextLine {
  text: string;
  x: number;
  y: number;
}

function collectTextNodes(element: HTMLElement): Text[] {
  const showText = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
  const walker = document.createTreeWalker(element, showText);
  const textNodes: Text[] = [];
  let node = walker.nextNode();

  while (node) {
    if (node instanceof Text) {
      textNodes.push(node);
    }
    node = walker.nextNode();
  }

  return textNodes;
}

function findNativeTextLine(
  lines: NativeTextLine[],
  y: number
): NativeTextLine | null {
  return lines.find((line) => Math.abs(line.y - y) < 1.5) ?? null;
}

function collectNativeTextLinesFromRanges(
  element: HTMLElement,
  coordinateContainer: HTMLElement
): NativeTextLine[] {
  if (typeof document.createRange !== 'function') return [];

  const containerRect = coordinateContainer.getBoundingClientRect();
  const lines: NativeTextLine[] = [];
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return [];
  let lastLine: NativeTextLine | null = null;

  try {
    for (const textNode of collectTextNodes(element)) {
      const text = textNode.textContent ?? '';

      for (let index = 0; index < text.length; index++) {
        const character = text[index] ?? '';
        if (character === '\n') {
          lastLine = null;
          continue;
        }

        range.setStart(textNode, index);
        range.setEnd(textNode, index + 1);
        const charRect = Array.from(range.getClientRects()).find(
          (rect) => rect.width > 0 || rect.height > 0
        );

        if (!charRect) {
          if (lastLine) {
            lastLine.text += character;
          }
          continue;
        }

        const x = charRect.left - containerRect.left;
        const y = charRect.top - containerRect.top;
        const existingLine = findNativeTextLine(lines, y);
        const line =
          existingLine ??
          ({
            text: '',
            x,
            y
          } satisfies NativeTextLine);

        if (!existingLine) {
          lines.push(line);
        }

        line.text += character;
        line.x = Math.min(line.x, x);
        lastLine = line;
      }
    }
  } finally {
    if (typeof range.detach === 'function') {
      range.detach();
    }
  }

  return lines
    .map((line) => ({ ...line, text: line.text.trimEnd() }))
    .filter((line) => line.text.trim().length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function buildFallbackNativeTextLines(
  text: string,
  rect: RelativeRect,
  computed: CSSStyleDeclaration
): NativeTextLine[] {
  const lineHeight = resolveLineHeight(computed);
  const topPadding = parseCssPixels(computed.paddingTop);
  const x = resolveAlignedTextX(rect, computed);

  return text.split('\n').map((line, index) => ({
    text: line.trimEnd(),
    x,
    y: rect.y + topPadding + lineHeight * index
  }));
}

function buildNativeTextLayer(
  element: HTMLElement,
  rect: RelativeRect,
  id: string,
  coordinateContainer: HTMLElement
): string {
  const text = element.textContent?.trim() ?? '';
  if (!text || rect.width <= 0 || rect.height <= 0) {
    return '';
  }

  const computed = getComputedStyle(element);
  const fontSize = parseCssPixels(computed.fontSize);
  const lineHeight = resolveLineHeight(computed);
  const textAnchor = resolveTextAnchor(computed.textAlign);
  const rangeLines = collectNativeTextLinesFromRanges(
    element,
    coordinateContainer
  );
  const lines =
    rangeLines.length > 0
      ? rangeLines
      : buildFallbackNativeTextLines(text, rect, computed);
  const background = buildElementBackgroundRect(
    element,
    rect.width,
    rect.height
  );
  const transform = `translate(${roundSvgValue(rect.x)}, ${roundSvgValue(rect.y)})`;
  const textDecoration =
    computed.textDecorationLine && computed.textDecorationLine !== 'none'
      ? `text-decoration="${escapeXml(computed.textDecorationLine)}"`
      : '';
  const letterSpacing =
    computed.letterSpacing && computed.letterSpacing !== 'normal'
      ? `letter-spacing="${escapeXml(computed.letterSpacing)}"`
      : '';

  return `
    <g id="${escapeXml(id)}" transform="${transform}">
      ${background}
      ${lines
        .map(
          (line) => `
            <text
              x="${roundSvgValue(line.x - rect.x)}"
              y="${roundSvgValue(line.y - rect.y)}"
              fill="${escapeXml(computed.color)}"
              opacity="${escapeXml(computed.opacity || '1')}"
              font-family="${escapeXml(computed.fontFamily)}"
              font-size="${roundSvgValue(fontSize)}"
              font-style="${escapeXml(computed.fontStyle)}"
              font-weight="${escapeXml(computed.fontWeight)}"
              dominant-baseline="text-before-edge"
              text-anchor="${escapeXml(rangeLines.length > 0 ? 'start' : textAnchor)}"
              line-height="${roundSvgValue(lineHeight)}"
              xml:space="preserve"
              ${letterSpacing}
              ${textDecoration}
            >${escapeXml(line.text)}</text>
          `
        )
        .join('')}
    </g>
  `;
}

function buildImageLayer(
  image: HTMLImageElement,
  rect: RelativeRect,
  id: string
): string {
  const href = image.currentSrc || image.src;
  if (!href || rect.width <= 0 || rect.height <= 0) {
    return '';
  }

  const computed = getComputedStyle(image);

  return `
    <g id="${escapeXml(id)}">
      <image
        x="${roundSvgValue(rect.x)}"
        y="${roundSvgValue(rect.y)}"
        width="${roundSvgValue(rect.width)}"
        height="${roundSvgValue(rect.height)}"
        href="${escapeXml(href)}"
        opacity="${escapeXml(computed.opacity || '1')}"
        preserveAspectRatio="none"
      />
    </g>
  `;
}

function buildLegendLayer(pageContainer: HTMLElement): string {
  const legendContainer = pageContainer.querySelector(
    '.legend-container'
  ) as HTMLElement | null;
  if (!legendContainer) {
    return '';
  }

  const legendRect = getRelativeRect(legendContainer, pageContainer);
  if (legendRect.width <= 0 || legendRect.height <= 0) {
    return '';
  }

  const styles = getComputedStyle(legendContainer);
  const parts: string[] = [];
  const shadow = parseBoxShadow(styles.boxShadow);
  const filter = shadow ? buildDropShadowFilter(shadow) : null;

  if (filter) {
    parts.push(filter.markup);
  }

  if (!isTransparentColor(styles.backgroundColor)) {
    parts.push(`
      <rect
        x="0"
        y="0"
        width="${roundSvgValue(legendRect.width)}"
        height="${roundSvgValue(legendRect.height)}"
        fill="${escapeXml(styles.backgroundColor)}"
        ${filter ? `filter="url(#${filter.id})"` : ''}
      />
    `);
  }

  const legendSvgs = legendContainer.querySelectorAll<SVGSVGElement>('svg');
  legendSvgs.forEach((svg, index) => {
    const svgRect = getRelativeRect(svg, legendContainer);
    parts.push(
      serializeSvgNode(svg, {
        x: svgRect.x,
        y: svgRect.y,
        width: svgRect.width,
        height: svgRect.height
      }).replace('<svg', `<svg id="khartis-legend-segment-${index + 1}"`)
    );
  });

  if (parts.length === 0) {
    const legendItem = legendContainer.querySelector('.legend-item');
    if (legendItem instanceof HTMLElement) {
      parts.push(
        buildNativeTextLayer(
          legendItem,
          {
            x: 0,
            y: 0,
            width: legendRect.width,
            height: legendRect.height
          },
          'khartis-legend-text',
          legendContainer
        )
      );
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return `
    <g
      id="khartis-layer-legend"
      transform="translate(${roundSvgValue(legendRect.x)}, ${roundSvgValue(legendRect.y)})"
    >
      ${parts.join('')}
    </g>
  `;
}

function getGeoIndicationId(element: HTMLElement, index: number): string {
  if (element.classList.contains('scale-bar')) {
    return 'scale';
  }

  if (element.classList.contains('north-arrow')) {
    return 'orientation';
  }

  if (element.classList.contains('inset-map-panel')) {
    return 'inset-map';
  }

  return `item-${index + 1}`;
}

function buildGeoIndicationsLayer(pageContainer: HTMLElement): string {
  const geoItems = pageContainer.querySelectorAll<HTMLElement>(
    '.geo-indications-overlay .scale-bar, .geo-indications-overlay .north-arrow, .geo-indications-overlay .inset-map-panel'
  );

  if (geoItems.length === 0) {
    return '';
  }

  const parts: string[] = [];

  geoItems.forEach((item, index) => {
    const itemRect = getRelativeRect(item, pageContainer);
    if (itemRect.width <= 0 || itemRect.height <= 0) {
      return;
    }

    const itemParts = [
      buildElementBackgroundRect(item, itemRect.width, itemRect.height)
    ];

    const svgs = item.querySelectorAll<SVGSVGElement>('svg');
    svgs.forEach((svg, svgIndex) => {
      const svgRect = getRelativeRect(svg, item);
      itemParts.push(
        serializeSvgNode(svg, {
          x: svgRect.x,
          y: svgRect.y,
          width: svgRect.width,
          height: svgRect.height
        }).replace(
          '<svg',
          `<svg id="khartis-geo-indication-${getGeoIndicationId(item, index)}-${svgIndex + 1}"`
        )
      );
    });

    const itemMarkup = itemParts.filter(Boolean).join('');
    if (!itemMarkup) {
      return;
    }

    parts.push(`
      <g
        id="khartis-geo-indication-${getGeoIndicationId(item, index)}"
        transform="translate(${roundSvgValue(itemRect.x)}, ${roundSvgValue(itemRect.y)})"
      >
        ${itemMarkup}
      </g>
    `);
  });

  if (parts.length === 0) {
    return '';
  }

  return `
    <g id="khartis-layer-geo-indications">
      ${parts.join('')}
    </g>
  `;
}

function buildAnnotationLayer(pageContainer: HTMLElement): string {
  const annotationItems = pageContainer.querySelectorAll<HTMLElement>(
    '.annotation-overlay .annotation-item'
  );

  if (annotationItems.length === 0) {
    return '';
  }

  const parts: string[] = [];

  annotationItems.forEach((item, index) => {
    const role = item.dataset.annotationRole || item.dataset.annotationType;
    const id = `khartis-annotation-${role ?? 'item'}-${index + 1}`;
    const textElement = item.querySelector('.annotation-text');
    if (textElement instanceof HTMLElement) {
      parts.push(
        buildNativeTextLayer(
          textElement,
          getRelativeRect(item, pageContainer),
          id,
          pageContainer
        )
      );
      return;
    }

    const svgElement = item.querySelector('svg');
    if (svgElement instanceof SVGElement) {
      const svgRect = getRelativeRect(svgElement, pageContainer);
      parts.push(`
        <g id="${escapeXml(id)}">
          ${serializeSvgNode(svgElement, {
            x: svgRect.x,
            y: svgRect.y,
            width: svgRect.width,
            height: svgRect.height
          })}
        </g>
      `);
      return;
    }

    const imageElement = item.querySelector('img');
    if (imageElement instanceof HTMLImageElement) {
      parts.push(
        buildImageLayer(
          imageElement,
          getRelativeRect(imageElement, pageContainer),
          id
        )
      );
    }
  });

  if (parts.length === 0) {
    return '';
  }

  return `
    <g id="khartis-layer-annotations">
      ${parts.join('')}
    </g>
  `;
}

function buildVisualizationLayer(
  pageContainer: HTMLElement,
  structuredOptions: StructuredSvgOptions = {},
  geometry: PageExportGeometry = resolvePageExportGeometry(pageContainer)
): string {
  const mapCanvas = resolveMapCanvas(pageContainer);

  if (!mapCanvas) {
    return '';
  }

  const deckLayer = buildDeckVisualizationLayer(pageContainer, mapCanvas);
  const parts = [
    deckLayer
      ? buildMapLibreBackgroundLayer(
          pageContainer,
          mapCanvas,
          structuredOptions.mapLibreBackgroundDataUrl
        )
      : '',
    deckLayer || buildCanvasVisualizationFallback(pageContainer, mapCanvas)
  ].filter(Boolean);

  if (parts.length === 0) {
    return '';
  }

  return `
    <g
      id="khartis-layer-visualizations"
      ${geometry.mapFrame ? `clip-path="url(#${SVG_MAP_FRAME_CLIP_ID})"` : ''}
    >
      ${parts.join('')}
    </g>
  `;
}

function resolveMapCanvas(
  pageContainer: HTMLElement
): HTMLCanvasElement | null {
  return (
    mapInstanceStore.getMapCanvas() ??
    (pageContainer.querySelector(
      EXPORT_MAP_CANVAS_SELECTOR
    ) as HTMLCanvasElement | null)
  );
}

function resolveElementBackgroundColor(
  element: HTMLElement,
  fallback: string
): string {
  const backgroundColor = getComputedStyle(element).backgroundColor;

  return isTransparentColor(backgroundColor) ? fallback : backgroundColor;
}

function buildPageLayer(
  pageContainer: HTMLElement,
  geometry: PageExportGeometry
): string {
  const pageBackgroundColor = resolveElementBackgroundColor(
    pageContainer,
    '#ffffff'
  );
  const parts = [
    `
      <rect
        id="khartis-page-background"
        x="0"
        y="0"
        width="${roundSvgValue(geometry.width)}"
        height="${roundSvgValue(geometry.height)}"
        fill="${escapeXml(pageBackgroundColor)}"
      />
    `
  ];

  const mapStage = pageContainer.querySelector(
    EXPORT_MAP_STAGE_SELECTOR
  ) as HTMLElement | null;
  const mapSurface =
    (mapStage?.querySelector(
      EXPORT_MAP_SURFACE_SELECTOR
    ) as HTMLElement | null) ?? mapStage;
  const mapBackgroundColor = mapSurface
    ? resolveElementBackgroundColor(mapSurface, '')
    : '';

  if (
    geometry.mapFrame &&
    mapBackgroundColor &&
    mapBackgroundColor !== pageBackgroundColor
  ) {
    parts.push(`
      <rect
        id="khartis-map-frame-background"
        x="${roundSvgValue(geometry.mapFrame.x)}"
        y="${roundSvgValue(geometry.mapFrame.y)}"
        width="${roundSvgValue(geometry.mapFrame.width)}"
        height="${roundSvgValue(geometry.mapFrame.height)}"
        fill="${escapeXml(mapBackgroundColor)}"
      />
    `);
  }

  return `
    <g id="khartis-layer-page">
      ${parts.join('')}
    </g>
  `;
}

function buildSvgDefinitions(geometry: PageExportGeometry): string {
  const definitions: string[] = [];

  if (geometry.mapFrame) {
    definitions.push(`
      <clipPath id="${SVG_MAP_FRAME_CLIP_ID}">
        <rect
          x="${roundSvgValue(geometry.mapFrame.x)}"
          y="${roundSvgValue(geometry.mapFrame.y)}"
          width="${roundSvgValue(geometry.mapFrame.width)}"
          height="${roundSvgValue(geometry.mapFrame.height)}"
        />
      </clipPath>
    `);
  }

  definitions.push(
    ...Array.from(svgPatternDefsCache.values()).map((entry) => entry.defsHtml)
  );

  if (definitions.length === 0) {
    return '';
  }

  return `
    <defs>
      ${definitions.join('\n')}
    </defs>
  `;
}

function buildStructuredSvgMarkup(
  pageContainer: HTMLElement,
  options: ExportOptions,
  structuredOptions: StructuredSvgOptions = {},
  geometry: PageExportGeometry = resolvePageExportGeometry(pageContainer)
): string {
  svgPatternDefsCache.clear();
  dropShadowFilterCounter = 0;
  const layers = [
    buildVisualizationLayer(pageContainer, structuredOptions, geometry),
    buildLegendLayer(pageContainer),
    buildGeoIndicationsLayer(pageContainer),
    buildAnnotationLayer(pageContainer)
  ].filter(Boolean);

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${roundSvgValue(options.width)}"
      height="${roundSvgValue(options.height)}"
      viewBox="0 0 ${roundSvgValue(geometry.width)} ${roundSvgValue(geometry.height)}"
      preserveAspectRatio="xMidYMid meet"
    >
      ${buildSvgDefinitions(geometry)}
      ${buildPageLayer(pageContainer, geometry)}
      ${layers.join('')}
    </svg>
  `.trim();
}

export async function exportMapToSvg(
  options: Partial<ExportOptions> = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  await fontAssetsStore.ensureLoaded();

  const pageContainer = document.querySelector(
    EXPORT_PAGE_SELECTOR
  ) as HTMLElement | null;
  if (!pageContainer) {
    return Promise.reject(new Error(m.export_map_not_loaded()));
  }

  let restoreRatio: RestoreExportRender = async () => {};
  let restoreDom = (): void => {};
  let shouldRestoreExportMode = false;

  try {
    restoreDom = mutateDomForExport(pageContainer);
    globalActions.setMapExporting(true);
    shouldRestoreExportMode = true;
    await waitForNextFrame();

    const pageGeometry = resolvePageExportGeometry(pageContainer);
    const pixelRatio = getExportPixelRatioForSize(
      pageGeometry.width,
      pageGeometry.height,
      opts
    );

    restoreRatio = await prerenderWebgl(pixelRatio);
    await waitForNextFrame();

    const mapLibreBackgroundDataUrl =
      await captureMapLibreBackgroundForSvg(pageContainer);
    const markup = buildStructuredSvgMarkup(
      pageContainer,
      {
        width: Math.max(1, Math.round(pageGeometry.width * pixelRatio)),
        height: Math.max(1, Math.round(pageGeometry.height * pixelRatio))
      },
      { mapLibreBackgroundDataUrl },
      pageGeometry
    );

    return new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  } finally {
    await restoreRatio();
    if (shouldRestoreExportMode) {
      globalActions.setMapExporting(false);
    }
    restoreDom();
    await waitForNextFrame();
  }
}

export async function exportMapToJpg(
  options: Partial<ExportOptions> = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  await fontAssetsStore.ensureLoaded();

  const pageContainer = document.querySelector(
    EXPORT_PAGE_SELECTOR
  ) as HTMLElement | null;
  if (!pageContainer) {
    return Promise.reject(new Error(m.export_map_not_loaded()));
  }

  let restoreRatio: RestoreExportRender = async () => {};
  let restoreDom = (): void => {};
  let restoreFrozenCanvases: RestoreExportRender = async () => {};
  let shouldRestoreExportMode = false;

  const pageCanvas = await (async (): Promise<HTMLCanvasElement | null> => {
    try {
      restoreDom = mutateDomForExport(pageContainer);
      globalActions.setMapExporting(true);
      shouldRestoreExportMode = true;
      await waitForNextFrame();

      const pagePixelRatio = getExportPixelRatio(pageContainer, opts);
      restoreRatio = await prerenderWebgl(pagePixelRatio);
      await waitForNextFrame();
      restoreFrozenCanvases = await freezeCanvasesForExport(pageContainer);
      await waitForNextFrame();

      return await htmlToImageCanvas(pageContainer, {
        pixelRatio: pagePixelRatio,
        backgroundColor: '#ffffff',
        style: { boxShadow: 'none' },
        filter: exportFilter
      });
    } finally {
      await restoreFrozenCanvases();
      await restoreRatio();
      if (shouldRestoreExportMode) {
        globalActions.setMapExporting(false);
      }
      restoreDom();
      await waitForNextFrame();
    }
  })();

  if (!pageCanvas) {
    return Promise.reject(new Error(m.error_capture_page_failed()));
  }

  const offscreen = new OffscreenCanvas(opts.width, opts.height);
  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error(m.error_export_canvas_context_failed()));
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, opts.width, opts.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    pageCanvas,
    Math.round((opts.width - pageCanvas.width) / 2),
    Math.round((opts.height - pageCanvas.height) / 2)
  );

  return offscreen.convertToBlob({ type: 'image/jpeg', quality: 1.0 });
}
