import {
  getBinaryAttribute,
  getBinaryData,
  getBinaryLength,
  getLayerNumber,
  readFeatureBinaryTuple
} from './binary-attributes';
import { SVG_DEFAULT_STROKE_COLOR } from './constants';
import { getLayerProps } from './deck-layers';
import {
  applyLayerOpacity,
  colorAttributes,
  normalizeSvgColor,
  svgColorKey
} from './layer-colors';
import { buildProjectedPath, resolveStartIndices } from './svg-projection';
import { roundSvgValue, toFiniteNumber, toNumberTuple } from './svg-values';
import type { SvgColor, SvgDeckLayerLike, SvgProjectionContext } from './types';

interface PathStrokeGroup {
  groupKey: string;
  paths: string[];
  color: SvgColor;
  width: number;
  dashAttribute: string;
}

function toSvgDashAttribute(value: unknown): string {
  const dashArray = toNumberTuple(value, 2);
  return dashArray
    ? `stroke-dasharray="${roundSvgValue(dashArray[0])} ${roundSvgValue(dashArray[1])}"`
    : '';
}

export function serializePathLayer(
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
  const dashArrayAttribute = getBinaryAttribute(data, 'getDashArray');
  const layerOpacity = getLayerNumber(props, 'opacity', 1);
  const widthScale = getLayerNumber(
    props,
    'widthScale',
    getLayerNumber(props, 'lineWidthScale', 1)
  );
  const widthMinPixels = getLayerNumber(props, 'widthMinPixels', 0);
  const layerDashAttribute = toSvgDashAttribute(props.getDashArray);
  const groups: PathStrokeGroup[] = [];

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
            readFeatureBinaryTuple(colorAttribute, index, startIndices),
            SVG_DEFAULT_STROKE_COLOR
          )
        : normalizeSvgColor(
            props.getColor ?? props.getLineColor,
            SVG_DEFAULT_STROKE_COLOR
          ),
      layerOpacity
    );
    if (color.opacity <= 0) continue;

    const featureWidthTuple = widthAttribute
      ? readFeatureBinaryTuple(widthAttribute, index, startIndices)
      : null;
    const width = Math.max(
      widthMinPixels,
      toFiniteNumber(
        featureWidthTuple?.[0],
        getLayerNumber(props, 'getWidth', 1)
      ) * widthScale
    );

    const dashAttribute = dashArrayAttribute
      ? toSvgDashAttribute(
          readFeatureBinaryTuple(dashArrayAttribute, index, startIndices)
        )
      : layerDashAttribute;
    const groupKey = `${svgColorKey(color)}|${width}|${dashAttribute}`;
    const currentGroup = groups[groups.length - 1];

    if (currentGroup && currentGroup.groupKey === groupKey) {
      currentGroup.paths.push(path);
      continue;
    }

    groups.push({ groupKey, paths: [path], color, width, dashAttribute });
  }

  return groups
    .map(
      (group) => `
      <path
        d="${group.paths.join(' ')}"
        fill="none"
        ${colorAttributes('stroke', group.color)}
        stroke-width="${roundSvgValue(group.width)}"
        stroke-linecap="${props.capRounded === false ? 'butt' : 'round'}"
        stroke-linejoin="${props.jointRounded === false ? 'miter' : 'round'}"
        ${group.dashAttribute}
      />
    `
    )
    .join('');
}
