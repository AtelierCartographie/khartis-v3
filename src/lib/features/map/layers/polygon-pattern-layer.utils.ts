import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { FeatureCollection } from 'geojson';
import {
  createPolygonFillColorAttribute,
  type BinaryPolygonData
} from 'geoarrow-deck-stream';

import { mapPatternTypeToPatternId } from '$lib/features/commons/components/palette-popover/palette.constants';
import {
  PATTERN_OVERLAY_OPACITY,
  type PatternParams
} from '$lib/features/commons/constants/pattern.constants';
import {
  getPrimitiveClassification,
  PrimitiveFilterType
} from '$lib/features/commons/stores/visualization.store.svelte';
import type { getPolygonPrimitive } from '$lib/features/commons/stores/visualization.store.svelte';

import { createCompatibleSolidPolygonLayerProps } from '../utils/solid-polygon-layer-props.utils';
import type { DeckDataRow, LayerContext } from '../types';
import {
  getPatternAtlasForPattern,
  isValidPatternId,
  resolvePatternTilePx,
  PATTERN_TYPE_MAP,
  type PatternName
} from './pattern-texture';
import { RotatableFillStyleExtension } from './rotatable-fill-style-extension';

export const POLYGON_PATTERN_FILL_COLOR: [number, number, number, number] = [
  0, 0, 0, 255
];
export const TRANSPARENT_POLYGON_PATTERN_FILL_COLOR: [
  number,
  number,
  number,
  number
] = [0, 0, 0, 0];
export const THEMATIC_OVERLAY_PARAMETERS = {
  depthCompare: 'always' as const
} as const;

const DEFAULT_MISSING_DATA_PATTERN_ID: PatternName = 'diagonal';

let fillStyleExtensionInstance: RotatableFillStyleExtension | null = null;

function getFillStyleExtension(): RotatableFillStyleExtension {
  if (!fillStyleExtensionInstance) {
    fillStyleExtensionInstance = new RotatableFillStyleExtension({
      pattern: true
    });
  }
  return fillStyleExtensionInstance;
}

type PolygonPatternProps = {
  extensions: RotatableFillStyleExtension[];
  fillPatternAtlas: HTMLCanvasElement;
  fillPatternMapping: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >;
  fillPatternMask: boolean;
  getFillPattern: () => string;
  getFillPatternScale: number;
  getFillPatternRotation: number;
  khartisPatternId: string;
  khartisPatternSize: number;
  khartisPatternScale: number;
  khartisPatternAngle: number;
};

function createPatternProps(
  patternId: PatternName,
  patternParams?: PatternParams
): PolygonPatternProps | null {
  const { atlas, mapping } = getPatternAtlasForPattern(
    patternId,
    patternParams
  );
  if (Object.keys(mapping).length === 0) {
    return null;
  }
  const patternScaleValue = Math.max(1, patternParams?.scale ?? 8);
  const patternSizeValue = Math.max(1, patternParams?.size ?? 4);
  // The shader consumes getFillPatternScale as "tile size in screen pixels".
  // Atlas frames are devicePixelRatio-scaled canvas pixels, so use the design
  // tile size instead — it keeps the motif identical across screen densities
  // and matches the CSS previews, the legend, and the SVG export.
  const patternScale = resolvePatternTilePx(patternParams);
  const patternRotation =
    patternParams?.angle ?? PATTERN_TYPE_MAP[patternId]?.angle ?? 0;

  return {
    extensions: [getFillStyleExtension()],
    fillPatternAtlas: atlas,
    fillPatternMapping: mapping,
    fillPatternMask: true,
    getFillPattern: () => patternId,
    getFillPatternScale: patternScale,
    getFillPatternRotation: patternRotation,
    khartisPatternId: patternId,
    khartisPatternSize: patternSizeValue,
    khartisPatternScale: patternScaleValue,
    khartisPatternAngle: patternRotation
  };
}

export function buildPatternProps(
  ctx: LayerContext
): PolygonPatternProps | null {
  const patternId = ctx.viz
    ? getPrimitiveClassification(ctx.viz, PrimitiveFilterType.POLYGON)
        ?.patternId
    : undefined;
  const patternParams = ctx.viz
    ? getPrimitiveClassification(ctx.viz, PrimitiveFilterType.POLYGON)
        ?.patternParams
    : undefined;
  if (!isValidPatternId(patternId)) {
    return null;
  }

  return createPatternProps(patternId, patternParams);
}

export function resolveMissingDataPatternId(
  missingData:
    | NonNullable<ReturnType<typeof getPolygonPrimitive>>['missingData']
    | undefined
): PatternName {
  const patternId = missingData?.patternId;
  if (isValidPatternId(patternId)) {
    return patternId;
  }
  // Legacy fallback: older projects only stored a coarse PatternType.
  return mapPatternTypeToPatternId(
    missingData?.patternType,
    DEFAULT_MISSING_DATA_PATTERN_ID
  );
}

export function buildMissingDataPatternProps(
  polygonConfig: ReturnType<typeof getPolygonPrimitive> | undefined,
  showMissingPolygons: boolean
): PolygonPatternProps | null {
  if (!showMissingPolygons || !polygonConfig?.missingData?.pattern) {
    return null;
  }

  return createPatternProps(
    resolveMissingDataPatternId(polygonConfig.missingData),
    polygonConfig.missingData.patternParams
  );
}

export function createPolygonPatternOverlayLayer(
  layerId: string,
  polygonPatternId: string | undefined,
  patternGeojson: FeatureCollection,
  patternProps: PolygonPatternProps,
  ctx: Pick<LayerContext, 'modelMatrix' | 'beforeId'>,
  idSuffix = `pattern-${polygonPatternId ?? 'none'}`,
  getOverlayFillColor?: (feature: {
    properties?: Record<string, unknown>;
  }) => [number, number, number, number]
): GeoJsonLayer {
  const { modelMatrix, beforeId } = ctx;

  return new GeoJsonLayer({
    id: `${layerId}-${idSuffix}`,
    data: patternGeojson,
    getFillColor: getOverlayFillColor ?? [0, 0, 0, 255],
    stroked: false,
    opacity: PATTERN_OVERLAY_OPACITY,
    pickable: false,
    extensions: patternProps.extensions,
    fillPatternAtlas: patternProps.fillPatternAtlas,
    fillPatternMapping: patternProps.fillPatternMapping,
    fillPatternMask: true,
    getFillPattern: patternProps.getFillPattern,
    getFillPatternScale: patternProps.getFillPatternScale,
    getFillPatternRotation: patternProps.getFillPatternRotation,
    ...({
      khartisPatternId: patternProps.khartisPatternId,
      khartisPatternSize: patternProps.khartisPatternSize,
      khartisPatternScale: patternProps.khartisPatternScale,
      khartisPatternAngle: patternProps.khartisPatternAngle
    } as Record<string, unknown>),
    ...(modelMatrix && { modelMatrix }),
    ...(beforeId && { beforeId }),
    updateTriggers: {
      getFillPattern: [polygonPatternId],
      getFillPatternScale: [patternProps.getFillPatternScale],
      getFillPatternRotation: [patternProps.getFillPatternRotation]
    },
    dataComparator: (newData, oldData) => newData === oldData
  });
}

function createVisiblePolygonFillColorAttribute(
  polyData: BinaryPolygonData,
  getFillColor: (featureId: number) => [number, number, number, number]
): ReturnType<typeof createPolygonFillColorAttribute> | null {
  let hasVisiblePolygon = false;
  const attribute = createPolygonFillColorAttribute(polyData, (featureId) => {
    const color = getFillColor(featureId);
    if ((color[3] ?? 0) > 0) {
      hasVisiblePolygon = true;
    }
    return color;
  });

  return hasVisiblePolygon ? attribute : null;
}

export function createBinaryPolygonPatternOverlayLayer(
  layerId: string,
  polygonPatternId: string | undefined,
  polyData: BinaryPolygonData,
  patternProps: PolygonPatternProps,
  ctx: Pick<LayerContext, 'modelMatrix' | 'beforeId'>,
  getFillColor: (featureId: number) => [number, number, number, number],
  idSuffix = `pattern-${polygonPatternId ?? 'none'}`
): Layer<DeckDataRow> | null {
  const fillColorAttribute = createVisiblePolygonFillColorAttribute(
    polyData,
    getFillColor
  );
  if (!fillColorAttribute) {
    return null;
  }

  const solidProps = createCompatibleSolidPolygonLayerProps(polyData);
  const solidBinaryData = solidProps.data as {
    attributes: Record<string, unknown>;
  };
  solidBinaryData.attributes.getFillColor = fillColorAttribute;

  const { modelMatrix, beforeId } = ctx;

  return new SolidPolygonLayer({
    id: `${layerId}-${idSuffix}`,
    ...(solidProps as unknown as Record<string, unknown>),
    getFillColor: POLYGON_PATTERN_FILL_COLOR,
    opacity: PATTERN_OVERLAY_OPACITY,
    pickable: false,
    parameters: THEMATIC_OVERLAY_PARAMETERS,
    extensions: patternProps.extensions,
    fillPatternAtlas: patternProps.fillPatternAtlas,
    fillPatternMapping: patternProps.fillPatternMapping,
    fillPatternMask: true,
    getFillPattern: patternProps.getFillPattern,
    getFillPatternScale: patternProps.getFillPatternScale,
    getFillPatternRotation: patternProps.getFillPatternRotation,
    ...({
      khartisPatternId: patternProps.khartisPatternId,
      khartisPatternSize: patternProps.khartisPatternSize,
      khartisPatternScale: patternProps.khartisPatternScale,
      khartisPatternAngle: patternProps.khartisPatternAngle
    } as Record<string, unknown>),
    ...(modelMatrix && { modelMatrix }),
    ...(beforeId && { beforeId }),
    updateTriggers: {
      getFillColor: [idSuffix],
      getFillPattern: [polygonPatternId],
      getFillPatternScale: [patternProps.getFillPatternScale],
      getFillPatternRotation: [patternProps.getFillPatternRotation]
    },
    dataComparator: (newData, oldData) => newData === oldData
  });
}
