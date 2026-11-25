import {
  getLayerNumber,
  resolveAccessorNumber,
  resolveAccessorValue
} from './binary-attributes';
import {
  SVG_DEFAULT_FILL_COLOR,
  SVG_DEFAULT_STROKE_COLOR,
  SVG_TRANSPARENT_COLOR
} from './constants';
import { getLayerProps } from './deck-layers';
import {
  applyLayerOpacity,
  colorAttributes,
  normalizeSvgColor
} from './layer-colors';
import { fillAttributes, resolveSvgPatternReference } from './svg-patterns';
import { projectPosition } from './svg-projection';
import { isRecord, roundSvgCoord, roundSvgValue } from './svg-values';
import type {
  GeoJsonFeatureLike,
  GeoJsonGeometryLike,
  SvgDeckLayerLike,
  SvgProjectionContext
} from './types';

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
      `${index === 0 ? 'M' : 'L'} ${roundSvgCoord(projected[0])} ${roundSvgCoord(projected[1])}`
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
      SVG_DEFAULT_FILL_COLOR
    ),
    layerOpacity
  );
  const pattern = resolveSvgPatternReference(
    props,
    feature,
    featureIndex,
    fillColor
  );
  const lineColor = applyLayerOpacity(
    normalizeSvgColor(
      resolveAccessorValue(props.getLineColor, feature, featureIndex),
      SVG_DEFAULT_STROKE_COLOR
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

    return `<circle cx="${roundSvgCoord(projected[0])}" cy="${roundSvgCoord(projected[1])}" r="${roundSvgCoord(radius)}" ${fillAttributes(fillColor, pattern)} ${colorAttributes('stroke', lineColor)} stroke-width="${roundSvgValue(lineWidth)}" />`;
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
    const polygonFillColor =
      props.filled === false
        ? normalizeSvgColor(SVG_TRANSPARENT_COLOR, SVG_TRANSPARENT_COLOR)
        : fillColor;
    const polygonLineColor =
      props.stroked === false
        ? normalizeSvgColor(SVG_TRANSPARENT_COLOR, SVG_TRANSPARENT_COLOR)
        : lineColor;
    const polygonPattern = resolveSvgPatternReference(
      props,
      feature,
      featureIndex,
      polygonFillColor
    );
    const path = geometry.coordinates
      .map((ring) => buildCoordinatePath(ring, layer, context, true))
      .filter(Boolean)
      .join(' ');
    const hasFill = polygonFillColor.opacity > 0;
    const hasStroke = polygonLineColor.opacity > 0 && lineWidth > 0;
    if (!path || (!hasFill && !hasStroke)) return '';

    const stroke = hasStroke
      ? `${colorAttributes('stroke', polygonLineColor)} stroke-width="${roundSvgValue(lineWidth)}"`
      : 'stroke="none"';

    return `<path d="${path}" ${fillAttributes(polygonFillColor, polygonPattern)} ${stroke} fill-rule="evenodd" />`;
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

export function serializeGeoJsonLayer(
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
