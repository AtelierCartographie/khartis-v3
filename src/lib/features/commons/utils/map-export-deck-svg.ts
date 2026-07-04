import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { motif } from '@ateliercartographie/motif.js';
import type { PatternOptions } from '@ateliercartographie/motif.js';
import {
  isValidPatternId,
  PATTERN_TYPE_MAP,
  type PatternName
} from '$lib/features/map/layers/pattern-texture';
import {
  SHAPE_ORDINAL,
  ShapeType,
  SYMBOL_SDF_EXTENT
} from '$lib/features/commons/constants/visualization.constants';
import { LogCategory, logger } from './logger';
import {
  clamp,
  escapeXml,
  getRelativeRect,
  isNumberArrayLike,
  isRecord,
  resolveMapCanvas,
  roundSvgValue,
  sanitizeSvgId,
  toFiniteNumber,
  toNumberTuple,
  waitForMapRender,
  type BinaryAttributeLike,
  type BinaryLayerDataLike,
  type GeoJsonFeatureLike,
  type GeoJsonGeometryLike,
  type RelativeRect,
  type SvgColor,
  type SvgDeckLayerLike,
  type SvgDeckLike,
  type SvgProjectionContext,
  type SvgViewportLike
} from './map-export-svg.shared';

interface SvgPatternDefinition {
  defsHtml: string;
  patternUrl: string;
}

const SVG_PATTERN_FILL_COLOR = '#000000';
const SVG_PATTERN_MOTIF_SIZE_FACTOR = 100;
const SVG_PATTERN_MOTIF_SCALE_DIVISOR = 10;
const SVG_PATTERN_DEFAULT_SIZE = 4;
const SVG_PATTERN_DEFAULT_ACCESSOR_SCALE = 200;
const SVG_PATTERN_ACCESSOR_SCALE_DIVISOR = 25;
const SVG_PATTERN_MIN_SIZE = 1;
const SVG_PATTERN_MIN_SCALE = 1;
const DEFAULT_SYMBOL_BAR_WIDTH = 6;
const SPIKE_BAR_WIDTH_RATIO = 1.5;
const TEXT_AVERAGE_CHAR_WIDTH_RATIO = 0.58;
const TEXT_LINE_HEIGHT_RATIO = 1.2;
const DEFAULT_TEXT_SIZE_PX = 12;

const svgPatternDefsCache = new Map<string, SvgPatternDefinition>();

export function resetSvgPatternDefinitions(): void {
  svgPatternDefsCache.clear();
}

export function getSvgPatternDefinitions(): string[] {
  return Array.from(svgPatternDefsCache.values()).map(
    (entry) => entry.defsHtml
  );
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
    fill: SVG_PATTERN_FILL_COLOR,
    background: 'transparent',
    size: Math.round(
      (params.size / params.scale) * SVG_PATTERN_MOTIF_SIZE_FACTOR
    ),
    scale: params.scale / SVG_PATTERN_MOTIF_SCALE_DIVISOR,
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
  const size = Math.max(
    SVG_PATTERN_MIN_SIZE,
    toFiniteNumber(props.khartisPatternSize, SVG_PATTERN_DEFAULT_SIZE)
  );
  const scale = Math.max(
    SVG_PATTERN_MIN_SCALE,
    toFiniteNumber(
      props.khartisPatternScale,
      resolveAccessorNumber(
        props.getFillPatternScale,
        datum,
        index,
        SVG_PATTERN_DEFAULT_ACCESSOR_SCALE
      ) / SVG_PATTERN_ACCESSOR_SCALE_DIVISOR
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
  barWidth: number = DEFAULT_SYMBOL_BAR_WIDTH
): string {
  const common = `${fillAttributes} ${strokeAttributes} stroke-width="${roundSvgValue(strokeWidth)}"`;

  switch (Math.round(shape)) {
    case SHAPE_ORDINAL[ShapeType.SQUARE]: {
      const half = radius * SQUARE_HALF_RATIO;
      return `<rect x="${roundSvgValue(x - half)}" y="${roundSvgValue(y - half)}" width="${roundSvgValue(half * 2)}" height="${roundSvgValue(half * 2)}" ${common} />`;
    }
    case SHAPE_ORDINAL[ShapeType.CROSS]: {
      const arm = radius * CROSS_ARM_RATIO;
      const half = radius * CROSS_HALF_THICKNESS_RATIO;
      return `<path d="M ${roundSvgValue(x - half)} ${roundSvgValue(y - arm)} L ${roundSvgValue(x + half)} ${roundSvgValue(y - arm)} L ${roundSvgValue(x + half)} ${roundSvgValue(y - half)} L ${roundSvgValue(x + arm)} ${roundSvgValue(y - half)} L ${roundSvgValue(x + arm)} ${roundSvgValue(y + half)} L ${roundSvgValue(x + half)} ${roundSvgValue(y + half)} L ${roundSvgValue(x + half)} ${roundSvgValue(y + arm)} L ${roundSvgValue(x - half)} ${roundSvgValue(y + arm)} L ${roundSvgValue(x - half)} ${roundSvgValue(y + half)} L ${roundSvgValue(x - arm)} ${roundSvgValue(y + half)} L ${roundSvgValue(x - arm)} ${roundSvgValue(y - half)} L ${roundSvgValue(x - half)} ${roundSvgValue(y - half)} Z" ${common} />`;
    }
    case SHAPE_ORDINAL[ShapeType.DIAMOND]:
      return `<path d="M ${roundSvgValue(x)} ${roundSvgValue(y - radius)} L ${roundSvgValue(x + radius)} ${roundSvgValue(y)} L ${roundSvgValue(x)} ${roundSvgValue(y + radius)} L ${roundSvgValue(x - radius)} ${roundSvgValue(y)} Z" ${common} />`;
    case SHAPE_ORDINAL[ShapeType.TRIANGLE]:
      return `<path d="M ${roundSvgValue(x)} ${roundSvgValue(y - radius)} L ${roundSvgValue(x + radius)} ${roundSvgValue(y + radius)} L ${roundSvgValue(x - radius)} ${roundSvgValue(y + radius)} Z" ${common} />`;
    case SHAPE_ORDINAL[ShapeType.SPIKE]: {
      const spikeHalfWidth = (barWidth * SPIKE_BAR_WIDTH_RATIO) / 2;
      return `<path d="M ${roundSvgValue(x - spikeHalfWidth)} ${roundSvgValue(y)} L ${roundSvgValue(x)} ${roundSvgValue(y - radius * 2)} L ${roundSvgValue(x + spikeHalfWidth)} ${roundSvgValue(y)} Z" ${common} />`;
    }
    case SHAPE_ORDINAL[ShapeType.STAR]:
      return `<path d="M ${roundSvgValue(x)} ${roundSvgValue(y - radius)} L ${roundSvgValue(x + radius * 0.22)} ${roundSvgValue(y - radius * 0.22)} L ${roundSvgValue(x + radius)} ${roundSvgValue(y - radius * 0.15)} L ${roundSvgValue(x + radius * 0.36)} ${roundSvgValue(y + radius * 0.18)} L ${roundSvgValue(x + radius * 0.58)} ${roundSvgValue(y + radius)} L ${roundSvgValue(x)} ${roundSvgValue(y + radius * 0.5)} L ${roundSvgValue(x - radius * 0.58)} ${roundSvgValue(y + radius)} L ${roundSvgValue(x - radius * 0.36)} ${roundSvgValue(y + radius * 0.18)} L ${roundSvgValue(x - radius)} ${roundSvgValue(y - radius * 0.15)} L ${roundSvgValue(x - radius * 0.22)} ${roundSvgValue(y - radius * 0.22)} Z" ${common} />`;
    case SHAPE_ORDINAL[ShapeType.BAR]: {
      const barHalfWidth = barWidth / 2;
      return `<rect x="${roundSvgValue(x - barHalfWidth)}" y="${roundSvgValue(y - radius * 2)}" width="${roundSvgValue(barHalfWidth * 2)}" height="${roundSvgValue(radius * 2)}" ${common} />`;
    }
    case SHAPE_ORDINAL[ShapeType.RECTANGLE]: {
      const halfWidth = radius * RECTANGLE_HALF_WIDTH_RATIO;
      const halfHeight = radius * RECTANGLE_HALF_HEIGHT_RATIO;
      return `<rect x="${roundSvgValue(x - halfWidth)}" y="${roundSvgValue(y - halfHeight)}" width="${roundSvgValue(halfWidth * 2)}" height="${roundSvgValue(halfHeight * 2)}" ${common} />`;
    }
    case SHAPE_ORDINAL[ShapeType.CIRCLE]:
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
    Math.max(...lines.map((line) => line.length), 1) *
    size *
    TEXT_AVERAGE_CHAR_WIDTH_RATIO;
  const width = textWidth + padding[0] * 2;
  const height = lines.length * size * TEXT_LINE_HEIGHT_RATIO + padding[1] * 2;
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
  const lineHeight = getLayerNumber(
    props,
    'lineHeight',
    TEXT_LINE_HEIGHT_RATIO
  );
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
      resolveAccessorNumber(props.getSize, datum, index, DEFAULT_TEXT_SIZE_PX)
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

export function buildDeckVisualizationLayer(
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

export function buildCanvasVisualizationFallback(
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

export function buildMapLibreBackgroundLayer(
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

export async function captureMapLibreBackgroundForSvg(
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
  } catch (error) {
    logger.warn(
      'Failed to capture MapLibre background for SVG export',
      LogCategory.EXPORT,
      {
        error,
        flow: 'svg_export_maplibre_background',
        extra: {
          layerCount: layers.length,
          canvasWidth: mapCanvas.width,
          canvasHeight: mapCanvas.height
        }
      }
    );
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
