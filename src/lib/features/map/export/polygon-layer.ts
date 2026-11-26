import { DeckLayerId } from '$lib/features/map/constants/map.constants';
import {
  getBinaryAttribute,
  getBinaryData,
  getBinaryLength,
  getLayerNumber,
  readFeatureBinaryTuple,
  readFeatureId
} from './binary-attributes';
import { SVG_DEFAULT_FILL_COLOR } from './constants';
import { getLayerId, getLayerProps } from './deck-layers';
import { resolveFeatureName } from './feature-names';
import {
  applyLayerOpacity,
  normalizeSvgColor,
  svgColorKey
} from './layer-colors';
import { escapeXml } from './svg-color';
import { fillAttributes, resolveSvgPatternReference } from './svg-patterns';
import { buildProjectedPath, resolveStartIndices } from './svg-projection';
import { createSvgIdDeduper, sanitizeLocalizedSvgId } from './svg-values';
import type { SvgColor, SvgDeckLayerLike, SvgProjectionContext } from './types';

interface PolygonFeatureGroup {
  featureId: number | null;
  groupKey: string;
  paths: string[];
  fillColor: SvgColor;
}
export function serializePolygonLayer(
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
  const layerId = getLayerId(layer, 0);
  // The territory is stored one row per part; it stays one compound path.
  const mergesParts = layerId.startsWith(DeckLayerId.BASEMAP_TERRE);
  const groups: PolygonFeatureGroup[] = [];

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
            readFeatureBinaryTuple(fillAttribute, index, startIndices),
            SVG_DEFAULT_FILL_COLOR
          )
        : normalizeSvgColor(props.getFillColor, SVG_DEFAULT_FILL_COLOR),
      layerOpacity
    );
    if (fillColor.opacity <= 0) continue;

    const featureId = mergesParts
      ? null
      : readFeatureId(data.featureIds, index, startIndices);
    const groupKey =
      featureId !== null
        ? `feature:${featureId}`
        : `fill:${svgColorKey(fillColor)}`;
    const currentGroup = groups[groups.length - 1];

    if (currentGroup && currentGroup.groupKey === groupKey) {
      currentGroup.paths.push(path);
      continue;
    }

    groups.push({ featureId, groupKey, paths: [path], fillColor });
  }

  const dedupeId = createSvgIdDeduper();

  return groups
    .map((group) => {
      const featureName =
        group.featureId !== null
          ? resolveFeatureName(data, layerId, group.featureId)
          : null;
      const nameAttribute = featureName
        ? `id="${escapeXml(dedupeId(sanitizeLocalizedSvgId(featureName)))}" data-name="${escapeXml(featureName)}"`
        : '';

      const pattern = resolveSvgPatternReference(
        props,
        null,
        group.featureId ?? 0,
        group.fillColor
      );

      return `
        <path
          d="${group.paths.join(' ')}"
          ${fillAttributes(group.fillColor, pattern)}
          stroke="none"
          fill-rule="evenodd"
          ${nameAttribute}
        />
      `;
    })
    .join('');
}
