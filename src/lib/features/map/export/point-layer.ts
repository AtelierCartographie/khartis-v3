import { SYMBOL_SDF_EXTENT } from '$lib/features/commons/constants/visualization.constants';
import {
  getBinaryAttribute,
  getBinaryData,
  getBinaryLength,
  getLayerNumber,
  readBinaryNumber,
  readBinaryTuple,
  readFeatureId
} from './binary-attributes';
import {
  SVG_DEFAULT_FILL_COLOR,
  SVG_DEFAULT_STROKE_COLOR,
  SVG_TRANSPARENT_COLOR
} from './constants';
import { getLayerId, getLayerProps } from './deck-layers';
import { resolveFeatureName } from './feature-names';
import {
  applyLayerOpacity,
  colorAttributes,
  normalizeSvgColor
} from './layer-colors';
import { escapeXml } from './svg-color';
import { fillAttributes } from './svg-patterns';
import { projectPosition } from './svg-projection';
import {
  clamp,
  createSvgIdDeduper,
  roundSvgCoord,
  roundSvgValue,
  sanitizeLocalizedSvgId,
  sanitizeSvgId
} from './svg-values';
import type { SvgColor, SvgDeckLayerLike, SvgProjectionContext } from './types';

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
  barWidth: number = 6,
  nameAttribute: string = ''
): string {
  const common = `${fillAttributes} ${strokeAttributes} stroke-width="${roundSvgValue(strokeWidth)}" ${nameAttribute}`;

  switch (Math.round(shape)) {
    case 1: {
      const half = radius * SQUARE_HALF_RATIO;
      return `<rect x="${roundSvgCoord(x - half)}" y="${roundSvgCoord(y - half)}" width="${roundSvgCoord(half * 2)}" height="${roundSvgCoord(half * 2)}" ${common} />`;
    }
    case 4: {
      const arm = radius * CROSS_ARM_RATIO;
      const half = radius * CROSS_HALF_THICKNESS_RATIO;
      return `<path d="M ${roundSvgCoord(x - half)} ${roundSvgCoord(y - arm)} L ${roundSvgCoord(x + half)} ${roundSvgCoord(y - arm)} L ${roundSvgCoord(x + half)} ${roundSvgCoord(y - half)} L ${roundSvgCoord(x + arm)} ${roundSvgCoord(y - half)} L ${roundSvgCoord(x + arm)} ${roundSvgCoord(y + half)} L ${roundSvgCoord(x + half)} ${roundSvgCoord(y + half)} L ${roundSvgCoord(x + half)} ${roundSvgCoord(y + arm)} L ${roundSvgCoord(x - half)} ${roundSvgCoord(y + arm)} L ${roundSvgCoord(x - half)} ${roundSvgCoord(y + half)} L ${roundSvgCoord(x - arm)} ${roundSvgCoord(y + half)} L ${roundSvgCoord(x - arm)} ${roundSvgCoord(y - half)} L ${roundSvgCoord(x - half)} ${roundSvgCoord(y - half)} Z" ${common} />`;
    }
    case 5:
      return `<path d="M ${roundSvgCoord(x)} ${roundSvgCoord(y - radius)} L ${roundSvgCoord(x + radius)} ${roundSvgCoord(y)} L ${roundSvgCoord(x)} ${roundSvgCoord(y + radius)} L ${roundSvgCoord(x - radius)} ${roundSvgCoord(y)} Z" ${common} />`;
    case 6:
      return `<path d="M ${roundSvgCoord(x)} ${roundSvgCoord(y - radius)} L ${roundSvgCoord(x + radius)} ${roundSvgCoord(y + radius)} L ${roundSvgCoord(x - radius)} ${roundSvgCoord(y + radius)} Z" ${common} />`;
    case 3: {
      const spikeHalfWidth = (barWidth * 1.5) / 2;
      return `<path d="M ${roundSvgCoord(x - spikeHalfWidth)} ${roundSvgCoord(y)} L ${roundSvgCoord(x)} ${roundSvgCoord(y - radius * 2)} L ${roundSvgCoord(x + spikeHalfWidth)} ${roundSvgCoord(y)} Z" ${common} />`;
    }
    case 7:
      return `<path d="M ${roundSvgCoord(x)} ${roundSvgCoord(y - radius)} L ${roundSvgCoord(x + radius * 0.22)} ${roundSvgCoord(y - radius * 0.22)} L ${roundSvgCoord(x + radius)} ${roundSvgCoord(y - radius * 0.15)} L ${roundSvgCoord(x + radius * 0.36)} ${roundSvgCoord(y + radius * 0.18)} L ${roundSvgCoord(x + radius * 0.58)} ${roundSvgCoord(y + radius)} L ${roundSvgCoord(x)} ${roundSvgCoord(y + radius * 0.5)} L ${roundSvgCoord(x - radius * 0.58)} ${roundSvgCoord(y + radius)} L ${roundSvgCoord(x - radius * 0.36)} ${roundSvgCoord(y + radius * 0.18)} L ${roundSvgCoord(x - radius)} ${roundSvgCoord(y - radius * 0.15)} L ${roundSvgCoord(x - radius * 0.22)} ${roundSvgCoord(y - radius * 0.22)} Z" ${common} />`;
    case 2: {
      const barHalfWidth = barWidth / 2;
      return `<rect x="${roundSvgCoord(x - barHalfWidth)}" y="${roundSvgCoord(y - radius * 2)}" width="${roundSvgCoord(barHalfWidth * 2)}" height="${roundSvgCoord(radius * 2)}" ${common} />`;
    }
    case 8: {
      const halfWidth = radius * RECTANGLE_HALF_WIDTH_RATIO;
      const halfHeight = radius * RECTANGLE_HALF_HEIGHT_RATIO;
      return `<rect x="${roundSvgCoord(x - halfWidth)}" y="${roundSvgCoord(y - halfHeight)}" width="${roundSvgCoord(halfWidth * 2)}" height="${roundSvgCoord(halfHeight * 2)}" ${common} />`;
    }
    case 0:
    default:
      return `<circle cx="${roundSvgCoord(x)}" cy="${roundSvgCoord(y)}" r="${roundSvgCoord(radius)}" ${common} />`;
  }
}

export function serializePointLayer(
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
  const layerId = getLayerId(layer, 0);
  const dedupeId = createSvgIdDeduper();
  const symbols: SvgPointSymbol[] = [];

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
                SVG_DEFAULT_FILL_COLOR
              )
            : normalizeSvgColor(props.getFillColor, SVG_DEFAULT_FILL_COLOR),
          layerOpacity
        )
      : normalizeSvgColor(SVG_TRANSPARENT_COLOR, SVG_TRANSPARENT_COLOR);
    const strokeColor = stroked
      ? applyLayerOpacity(
          strokeAttribute
            ? normalizeSvgColor(
                readBinaryTuple(strokeAttribute, index),
                SVG_DEFAULT_STROKE_COLOR
              )
            : normalizeSvgColor(props.getLineColor, SVG_DEFAULT_STROKE_COLOR),
          layerOpacity
        )
      : normalizeSvgColor(SVG_TRANSPARENT_COLOR, SVG_TRANSPARENT_COLOR);
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

    const featureId = readFeatureId(data.featureIds, index);
    const featureName =
      featureId !== null ? resolveFeatureName(data, layerId, featureId) : null;
    const nameAttribute = featureName
      ? `id="${escapeXml(dedupeId(sanitizeLocalizedSvgId(featureName)))}" data-name="${escapeXml(featureName)}"`
      : '';

    symbols.push({
      shape,
      x: projected[0],
      y: projected[1],
      radius,
      fillColor,
      strokeColor,
      strokeWidth,
      nameAttribute
    });
  }

  if (props.knockout === true) {
    return serializeKnockoutPointSymbols(symbols, barWidth, layerId);
  }

  return symbols
    .map((symbol) =>
      serializePointShape(
        symbol.shape,
        symbol.x,
        symbol.y,
        symbol.radius,
        fillAttributes(symbol.fillColor, null),
        colorAttributes('stroke', symbol.strokeColor),
        symbol.strokeWidth,
        barWidth,
        symbol.nameAttribute
      )
    )
    .join('');
}
interface SvgPointSymbol {
  shape: number;
  x: number;
  y: number;
  radius: number;
  fillColor: SvgColor;
  strokeColor: SvgColor;
  strokeWidth: number;
  nameAttribute: string;
}

function sharedOpacity(colors: SvgColor[]): number | null {
  const first = colors[0]?.opacity;
  if (first === undefined) return null;
  return colors.every((color) => Math.abs(color.opacity - first) < 1e-3)
    ? first
    : null;
}

// SVG has no knockout group. Painted opaque in drawing order, fills and strokes
// each show the topmost symbol's color; two masks, built in the same order,
// keep the pixels where the topmost symbol is a fill, respectively a stroke.
// The shared opacity then goes on each group, so the result matches the
// WebGL knockout exactly whenever fills, and strokes, share one opacity.
function serializeKnockoutPointSymbols(
  symbols: SvgPointSymbol[],
  barWidth: number,
  layerId: string
): string {
  if (symbols.length === 0) return '';

  const shapeOf = (
    symbol: SvgPointSymbol,
    fill: string,
    stroke: string,
    nameAttribute = ''
  ) =>
    serializePointShape(
      symbol.shape,
      symbol.x,
      symbol.y,
      symbol.radius,
      fill,
      stroke,
      symbol.strokeWidth,
      barWidth,
      nameAttribute
    );

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const symbol of symbols) {
    // Linear shapes rise two radii above their anchor.
    const reach = symbol.radius * 2 + symbol.strokeWidth;
    minX = Math.min(minX, symbol.x - reach);
    minY = Math.min(minY, symbol.y - reach);
    maxX = Math.max(maxX, symbol.x + reach);
    maxY = Math.max(maxY, symbol.y + reach);
  }
  const maskBounds = `maskUnits="userSpaceOnUse" x="${roundSvgCoord(minX)}" y="${roundSvgCoord(minY)}" width="${roundSvgCoord(maxX - minX)}" height="${roundSvgCoord(maxY - minY)}"`;

  const baseId = `khartis-knockout-${sanitizeSvgId(layerId)}`;
  const parts: string[] = [];
  const visibleFills = symbols.filter((symbol) => symbol.fillColor.opacity > 0);
  const visibleStrokes = symbols.filter(
    (symbol) => symbol.strokeColor.opacity > 0 && symbol.strokeWidth > 0
  );
  const namesOnStrokes = visibleStrokes.length > 0;

  if (visibleFills.length > 0) {
    const maskId = `${baseId}-fill-mask`;
    const groupOpacity = sharedOpacity(visibleFills.map((s) => s.fillColor));
    const fills = symbols
      .map((symbol) =>
        symbol.fillColor.opacity > 0
          ? shapeOf(
              symbol,
              fillAttributes(
                groupOpacity === null
                  ? symbol.fillColor
                  : { ...symbol.fillColor, opacity: 1 },
                null
              ),
              'stroke="none"',
              namesOnStrokes ? '' : symbol.nameAttribute
            )
          : ''
      )
      .join('');
    parts.push(
      `<mask id="${maskId}" ${maskBounds}>${symbols.map((symbol) => shapeOf(symbol, 'fill="#fff"', 'stroke="#000"')).join('')}</mask>`,
      `<g mask="url(#${maskId})"${groupOpacity !== null && groupOpacity < 1 ? ` opacity="${roundSvgValue(groupOpacity)}"` : ''}>${fills}</g>`
    );
  }

  if (namesOnStrokes) {
    const maskId = `${baseId}-stroke-mask`;
    const groupOpacity = sharedOpacity(
      visibleStrokes.map((s) => s.strokeColor)
    );
    const strokes = symbols
      .map((symbol) =>
        symbol.strokeColor.opacity > 0 && symbol.strokeWidth > 0
          ? shapeOf(
              symbol,
              'fill="none"',
              colorAttributes(
                'stroke',
                groupOpacity === null
                  ? symbol.strokeColor
                  : { ...symbol.strokeColor, opacity: 1 }
              ),
              symbol.nameAttribute
            )
          : ''
      )
      .join('');
    parts.push(
      `<mask id="${maskId}" ${maskBounds}>${symbols.map((symbol) => shapeOf(symbol, 'fill="#000"', 'stroke="#fff"')).join('')}</mask>`,
      `<g mask="url(#${maskId})"${groupOpacity !== null && groupOpacity < 1 ? ` opacity="${roundSvgValue(groupOpacity)}"` : ''}>${strokes}</g>`
    );
  }

  return parts.join('');
}
