import {
  measureTextWidth,
  computeTextLines
} from '$lib/features/commons/utils/text-measure.utils';
import { resolveTextHaloWidthPx } from '$lib/features/map/layers/text-character-set';
import {
  getLayerNumber,
  resolveAccessorNumber,
  resolveAccessorValue
} from './binary-attributes';
import { SVG_DEFAULT_STROKE_COLOR, SVG_TRANSPARENT_COLOR } from './constants';
import { getLayerProps } from './deck-layers';
import {
  applyLayerOpacity,
  colorAttributes,
  normalizeSvgColor,
  resolveAccessorTuple,
  svgColorKey
} from './layer-colors';
import { escapeXml } from './svg-color';
import { projectPosition } from './svg-projection';
import {
  roundSvgCoord,
  roundSvgValue,
  toFiniteNumber,
  toNumberTuple
} from './svg-values';
import type {
  RelativeRect,
  SvgColor,
  SvgDeckLayerLike,
  SvgProjectionContext
} from './types';

function textAnchorToSvg(value: unknown): string {
  const anchor = String(value ?? 'middle');
  if (anchor === 'start' || anchor === 'end' || anchor === 'middle') {
    return anchor;
  }

  return 'middle';
}

function normalizeTextPadding(value: unknown): [number, number] {
  const tuple = toNumberTuple(value, 2);
  if (tuple) return [tuple[0], tuple[1]];

  const padding = toFiniteNumber(value, 0);
  return [padding, padding];
}

const TEXT_CENTRAL_BASELINE_OFFSET_EM = 0.35;
const TEXT_TOP_ASCENT_OFFSET_EM = 0.8;
const TEXT_BOTTOM_DESCENT_OFFSET_EM = 0.2;

function computeFirstBaselineY(
  y: number,
  lineCount: number,
  lineHeightPx: number,
  fontSize: number,
  baseline: 'top' | 'center' | 'bottom'
): number {
  if (baseline === 'top') {
    return y + fontSize * TEXT_TOP_ASCENT_OFFSET_EM;
  }

  if (baseline === 'bottom') {
    const lastBaselineY = y - fontSize * TEXT_BOTTOM_DESCENT_OFFSET_EM;
    return lastBaselineY - (lineCount - 1) * lineHeightPx;
  }

  return (
    y -
    ((lineCount - 1) * lineHeightPx) / 2 +
    fontSize * TEXT_CENTRAL_BASELINE_OFFSET_EM
  );
}

function resolveTextBaselineMode(value: unknown): 'top' | 'center' | 'bottom' {
  const baseline = String(value ?? 'center');
  if (baseline === 'top') return 'top';
  if (baseline === 'bottom') return 'bottom';
  return 'center';
}

function estimateTextBox(
  lines: string[],
  x: number,
  firstBaselineY: number,
  fontSize: number,
  lineHeightPx: number,
  fontFamily: string,
  fontWeight: string,
  anchor: string,
  padding: [number, number]
): RelativeRect {
  const textWidth = Math.max(
    ...lines.map((line) =>
      measureTextWidth(line, fontSize, fontFamily, fontWeight)
    ),
    1
  );
  const width = textWidth + padding[0] * 2;
  const height = lines.length * lineHeightPx + padding[1] * 2;
  const left =
    anchor === 'start'
      ? x - padding[0]
      : anchor === 'end'
        ? x - width + padding[0]
        : x - width / 2;
  const top =
    firstBaselineY - fontSize * TEXT_TOP_ASCENT_OFFSET_EM - padding[1];

  return {
    x: left,
    y: top,
    width,
    height
  };
}

function buildTspans(lines: string[], x: number, lineHeightPx: number): string {
  return lines
    .map(
      (line, lineIndex) =>
        `<tspan x="${roundSvgCoord(x)}" dy="${roundSvgValue(lineIndex === 0 ? 0 : lineHeightPx)}">${escapeXml(line)}</tspan>`
    )
    .join('');
}

function buildTextElement(
  lines: string[],
  x: number,
  firstBaselineY: number,
  lineHeightPx: number,
  attributes: string
): string {
  return `
    <text
      x="${roundSvgCoord(x)}"
      y="${roundSvgCoord(firstBaselineY)}"
      ${attributes}
    >${buildTspans(lines, x, lineHeightPx)}</text>
  `;
}

function findCommonValue<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  return values.every((value) => value === values[0]) ? values[0] : null;
}

interface PendingTextElement {
  lines: string[];
  x: number;
  firstBaselineY: number;
  lineHeightPx: number;
  size: number;
  anchor: string;
  fillColor: SvgColor;
  strokeColor: SvgColor | null;
  strokeWidth: number;
}

function buildTextElementMarkup(
  element: PendingTextElement,
  hoistSize: boolean,
  hoistAnchor: boolean,
  hoistFill: boolean
): string {
  // Illustrator drops `stroke-opacity` on text: a halo, whose fill and
  // stroke share one colour, carries its opacity on the element instead.
  const strokeColor = element.strokeColor;
  const sharedOpacity =
    strokeColor &&
    Math.abs(strokeColor.opacity - element.fillColor.opacity) < 1e-3 &&
    strokeColor.opacity < 1
      ? strokeColor.opacity
      : null;
  const fillColor =
    sharedOpacity === null
      ? element.fillColor
      : { ...element.fillColor, opacity: 1 };
  const attributes = [
    sharedOpacity === null ? '' : `opacity="${roundSvgValue(sharedOpacity)}"`,
    hoistFill ? '' : colorAttributes('fill', fillColor),
    strokeColor
      ? `${colorAttributes('stroke', sharedOpacity === null ? strokeColor : { ...strokeColor, opacity: 1 })} stroke-width="${roundSvgValue(element.strokeWidth)}" stroke-linejoin="round"`
      : 'stroke="none"',
    hoistSize ? '' : `font-size="${roundSvgValue(element.size)}"`,
    hoistAnchor ? '' : `text-anchor="${escapeXml(element.anchor)}"`
  ]
    .filter(Boolean)
    .join('\n          ');

  return buildTextElement(
    element.lines,
    element.x,
    element.firstBaselineY,
    element.lineHeightPx,
    attributes
  );
}

export function serializeTextLayer(
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
  const sizeScale = getLayerNumber(props, 'sizeScale', 1);
  const maxWidthMultiplier = getLayerNumber(props, 'maxWidth', -1);
  const backgroundEnabled = props.background === true;
  const backgroundPadding = normalizeTextPadding(props.backgroundPadding);
  const outlineWidth = getLayerNumber(props, 'outlineWidth', 0);
  const rectParts: string[] = [];
  const textElements: PendingTextElement[] = [];

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
    const baseSize = Math.max(
      1,
      resolveAccessorNumber(props.getSize, datum, index, 12)
    );
    const size = baseSize * sizeScale;
    const x = projected[0] + (pixelOffset[0] ?? 0);
    const y = projected[1] + (pixelOffset[1] ?? 0);
    const color = applyLayerOpacity(
      normalizeSvgColor(
        resolveAccessorValue(props.getColor, datum, index),
        SVG_DEFAULT_STROKE_COLOR
      ),
      layerOpacity
    );
    if (color.opacity <= 0) return;

    const anchor = textAnchorToSvg(
      resolveAccessorValue(props.getTextAnchor, datum, index)
    );
    const baseline = resolveTextBaselineMode(
      resolveAccessorValue(props.getAlignmentBaseline, datum, index)
    );
    const lineHeightPx = lineHeight * size;
    const maxWidthPx = maxWidthMultiplier > 0 ? maxWidthMultiplier * size : -1;
    const lines = computeTextLines(
      text,
      size,
      maxWidthPx,
      fontFamily,
      fontWeight
    );
    const firstBaselineY = computeFirstBaselineY(
      y,
      lines.length,
      lineHeightPx,
      size,
      baseline
    );
    const haloWidthPx = resolveTextHaloWidthPx(outlineWidth, baseSize);
    const haloColor = normalizeSvgColor(
      props.outlineColor,
      [255, 255, 255, 255]
    );
    const backgroundColor = backgroundEnabled
      ? normalizeSvgColor(
          resolveAccessorValue(props.getBackgroundColor, datum, index),
          [255, 255, 255, 0]
        )
      : normalizeSvgColor(SVG_TRANSPARENT_COLOR, SVG_TRANSPARENT_COLOR);
    const borderWidth = backgroundEnabled
      ? resolveAccessorNumber(props.getBorderWidth, datum, index, 0)
      : 0;
    const borderColor = backgroundEnabled
      ? normalizeSvgColor(
          resolveAccessorValue(props.getBorderColor, datum, index),
          SVG_TRANSPARENT_COLOR
        )
      : normalizeSvgColor(SVG_TRANSPARENT_COLOR, SVG_TRANSPARENT_COLOR);

    if (
      backgroundColor.opacity > 0 ||
      (borderColor.opacity > 0 && borderWidth > 0)
    ) {
      const box = estimateTextBox(
        lines,
        x,
        firstBaselineY,
        size,
        lineHeightPx,
        fontFamily,
        fontWeight,
        anchor,
        backgroundPadding
      );
      const radius = getLayerNumber(props, 'backgroundBorderRadius', 0);
      rectParts.push(`
        <rect
          x="${roundSvgCoord(box.x)}"
          y="${roundSvgCoord(box.y)}"
          width="${roundSvgCoord(box.width)}"
          height="${roundSvgCoord(box.height)}"
          rx="${roundSvgValue(radius)}"
          ry="${roundSvgValue(radius)}"
          ${colorAttributes('fill', backgroundColor)}
          ${borderColor.opacity > 0 && borderWidth > 0 ? colorAttributes('stroke', borderColor) : 'stroke="none"'}
          stroke-width="${roundSvgValue(borderWidth)}"
        />
      `);
    }

    if (haloWidthPx > 0 && haloColor.opacity > 0) {
      textElements.push({
        lines,
        x,
        firstBaselineY,
        lineHeightPx,
        size,
        anchor,
        fillColor: haloColor,
        strokeColor: haloColor,
        strokeWidth: 2 * haloWidthPx * sizeScale
      });
    }

    textElements.push({
      lines,
      x,
      firstBaselineY,
      lineHeightPx,
      size,
      anchor,
      fillColor: color,
      strokeColor: null,
      strokeWidth: 0
    });
  });

  const hoistSize = findCommonValue(textElements.map((el) => el.size)) !== null;
  const hoistAnchor =
    findCommonValue(textElements.map((el) => el.anchor)) !== null;
  const hoistFill =
    textElements.every((el) => el.strokeColor === null) &&
    findCommonValue(textElements.map((el) => svgColorKey(el.fillColor))) !==
      null;
  const textParts = textElements.map((element) =>
    buildTextElementMarkup(element, hoistSize, hoistAnchor, hoistFill)
  );
  const groupAttributes = [
    `font-family="${escapeXml(fontFamily)}"`,
    `font-weight="${escapeXml(fontWeight)}"`,
    hoistSize && textElements[0]
      ? `font-size="${roundSvgValue(textElements[0].size)}"`
      : '',
    hoistAnchor && textElements[0]
      ? `text-anchor="${escapeXml(textElements[0].anchor)}"`
      : '',
    hoistFill && textElements[0]
      ? colorAttributes('fill', textElements[0].fillColor)
      : ''
  ]
    .filter(Boolean)
    .join(' ');
  const parts = [...rectParts, ...textParts];
  if (parts.length === 0) return '';

  return `<g ${groupAttributes}>${parts.join('')}</g>`;
}
export function serializeLabelLeaderLayer(
  layer: SvgDeckLayerLike,
  context: SvgProjectionContext
): string {
  const props = getLayerProps(layer);
  if (!Array.isArray(props.data)) return '';

  const layerOpacity = getLayerNumber(props, 'opacity', 1);
  const widthScale = getLayerNumber(props, 'widthScale', 1);
  const pathsByStroke = new Map<
    string,
    { color: SvgColor; width: number; commands: string[] }
  >();
  let previousEnd: [number, number] | null = null;
  let previousStrokeKey: string | null = null;

  props.data.forEach((datum, index) => {
    const anchor = projectPosition(
      resolveAccessorTuple(props.getSourcePosition, datum, index, [0, 0]),
      layer,
      context
    );
    if (!anchor) return;

    const [sourceX, sourceY] = resolveAccessorTuple(
      props.getSourcePixelOffset,
      datum,
      index,
      [0, 0]
    );
    const [targetX, targetY] = resolveAccessorTuple(
      props.getTargetPixelOffset,
      datum,
      index,
      [0, 0]
    );
    const start: [number, number] = [anchor[0] + sourceX, anchor[1] + sourceY];
    const end: [number, number] = [anchor[0] + targetX, anchor[1] + targetY];
    const color = applyLayerOpacity(
      normalizeSvgColor(
        resolveAccessorValue(props.getColor, datum, index),
        SVG_DEFAULT_STROKE_COLOR
      ),
      layerOpacity
    );
    if (color.opacity <= 0) return;

    const width =
      resolveAccessorNumber(props.getWidth, datum, index, 1) * widthScale;
    const strokeKey = `${svgColorKey(color)}|${width}`;
    const group = pathsByStroke.get(strokeKey) ?? {
      color,
      width,
      commands: []
    };
    pathsByStroke.set(strokeKey, group);

    // An elbow leader comes as consecutive segments sharing an end.
    const continuesPath =
      previousStrokeKey === strokeKey &&
      previousEnd !== null &&
      previousEnd[0] === start[0] &&
      previousEnd[1] === start[1];
    group.commands.push(
      `${continuesPath ? '' : `M${roundSvgCoord(start[0])} ${roundSvgCoord(start[1])} `}L${roundSvgCoord(end[0])} ${roundSvgCoord(end[1])}`
    );
    previousEnd = end;
    previousStrokeKey = strokeKey;
  });

  return [...pathsByStroke.values()]
    .map(
      (group) => `
      <path
        d="${group.commands.join(' ')}"
        fill="none"
        ${colorAttributes('stroke', group.color)}
        stroke-width="${roundSvgValue(group.width)}"
        stroke-linecap="butt"
        stroke-linejoin="miter"
      />
    `
    )
    .join('');
}
