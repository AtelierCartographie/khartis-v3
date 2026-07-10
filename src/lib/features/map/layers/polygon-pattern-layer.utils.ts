import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { FeatureCollection } from 'geojson';
import {
  createPolygonFillColorAttribute,
  type BinaryPolygonData
} from '@ateliercartographie/geoarrow-deck-stream';

import { mapPatternTypeToPatternId } from '$lib/features/commons/components/palette-popover/palette.constants';
import {
  PATTERN_OVERLAY_OPACITY,
  type PatternParams
} from '$lib/features/commons/constants/pattern.constants';
import {
  patternPaletteFromLegacy,
  resolveClassificationPatternConfig,
  resolveClassPatterns,
  type ClassPattern
} from '$lib/features/commons/services/pattern-palette.service';
import { FillMode } from '$lib/features/commons/constants/visualization.constants';
import {
  getPrimitiveClassification,
  PrimitiveFilterType
} from '$lib/features/commons/stores/visualization.store.svelte';
import type {
  ClassificationConfig,
  getPolygonPrimitive
} from '$lib/features/commons/stores/visualization.store.svelte';

import { createCompatibleSolidPolygonLayerProps } from '../utils/solid-polygon-layer-props.utils';
import type { DeckDataRow, LayerContext } from '../types';
import {
  getPatternAtlasForPattern,
  getPatternPaletteAtlas,
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

export const MAX_CATEGORICAL_PATTERN_COUNT = 24;

let fillStyleExtensionInstance: RotatableFillStyleExtension | null = null;

function getFillStyleExtension(): RotatableFillStyleExtension {
  if (!fillStyleExtensionInstance) {
    fillStyleExtensionInstance = new RotatableFillStyleExtension({
      pattern: true
    });
  }
  return fillStyleExtensionInstance;
}

export interface KhartisMotifOptions {
  type: string;
  angle: number;
  scale: number;
  size: number;
  patchSize: boolean;
}

export type PolygonPatternProps = {
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
  khartisMotifOptions?: KhartisMotifOptions;
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

export function createClassPatternProps(
  patterns: ClassPattern[],
  classIndex: number
): PolygonPatternProps {
  const { atlas, mapping } = getPatternPaletteAtlas(patterns);
  const pattern = patterns[classIndex]!;
  const patternKey = `c${classIndex}`;
  const patternScale = pattern.scale * 10;

  return {
    extensions: [getFillStyleExtension()],
    fillPatternAtlas: atlas,
    fillPatternMapping: mapping,
    fillPatternMask: true,
    getFillPattern: () => patternKey,
    getFillPatternScale: patternScale,
    getFillPatternRotation: pattern.angle,
    khartisPatternId: patternKey,
    khartisPatternSize: pattern.size,
    khartisPatternScale: patternScale,
    khartisPatternAngle: pattern.angle,
    khartisMotifOptions: {
      type: pattern.type,
      angle: pattern.angle,
      scale: pattern.scale,
      size: pattern.size,
      patchSize: pattern.patchSize
    }
  };
}

export function resolveClassPatternPalette(
  classification: ClassificationConfig | undefined,
  fillMode: FillMode
): ClassPattern[] | null {
  const pattern = resolveClassificationPatternConfig(classification);
  if (!pattern) {
    return null;
  }

  if (fillMode === FillMode.UNIQUE) {
    return resolveClassPatterns(
      1,
      pattern,
      'sequential',
      pattern.contrast,
      false
    );
  }

  if (fillMode === FillMode.CLASSES) {
    const count = classification?.colors?.length ?? 0;
    if (count === 0) return null;
    return resolveClassPatterns(
      count,
      pattern,
      'sequential',
      pattern.contrast,
      classification?.inverted ?? false
    );
  }

  if (fillMode === FillMode.CATEGORIES) {
    const count = classification?.labels?.length ?? 0;
    // Beyond ~24 categories no motif set stays perceptually distinct, and the
    // shared atlas canvas would exceed browser canvas size limits.
    if (count === 0 || count > MAX_CATEGORICAL_PATTERN_COUNT) return null;
    return resolveClassPatterns(
      count,
      pattern,
      'categorical',
      pattern.contrast,
      classification?.inverted ?? false
    );
  }

  return null;
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

export function resolveMissingDataClassPattern(
  missingData:
    | NonNullable<ReturnType<typeof getPolygonPrimitive>>['missingData']
    | undefined
): ClassPattern | null {
  if (!missingData?.pattern) {
    return null;
  }

  const config =
    missingData.patternConfig ??
    patternPaletteFromLegacy(
      resolveMissingDataPatternId(missingData),
      missingData.patternParams
    );
  if (!config) {
    return null;
  }

  return (
    resolveClassPatterns(1, config, 'sequential', config.contrast)[0] ?? null
  );
}

export function buildMissingDataPatternProps(
  polygonConfig: ReturnType<typeof getPolygonPrimitive> | undefined,
  showMissingPolygons: boolean
): PolygonPatternProps | null {
  if (!showMissingPolygons) {
    return null;
  }

  const pattern = resolveMissingDataClassPattern(polygonConfig?.missingData);
  if (!pattern) {
    return null;
  }

  return createClassPatternProps([pattern], 0);
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
  }) => [number, number, number, number],
  opacity: number = PATTERN_OVERLAY_OPACITY
): GeoJsonLayer {
  const { modelMatrix, beforeId } = ctx;

  return new GeoJsonLayer({
    id: `${layerId}-${idSuffix}`,
    data: patternGeojson,
    getFillColor: getOverlayFillColor ?? [0, 0, 0, 255],
    stroked: false,
    opacity,
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
      khartisPatternAngle: patternProps.khartisPatternAngle,
      khartisMotifOptions: patternProps.khartisMotifOptions
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
  idSuffix = `pattern-${polygonPatternId ?? 'none'}`,
  opacity: number = PATTERN_OVERLAY_OPACITY
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
    opacity,
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
      khartisPatternAngle: patternProps.khartisPatternAngle,
      khartisMotifOptions: patternProps.khartisMotifOptions
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
