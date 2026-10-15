import type { Layer } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { createPathLayerProps } from '@ateliercartographie/geoarrow-deck-stream';
import type {
  BinaryPathData,
  BinaryPointData
} from '@ateliercartographie/geoarrow-deck-stream';

import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

import { GeometryType } from '../constants';
import {
  pathColorAttr,
  pathWidthAttr
} from '../utils/geoarrow-stream-bridge.utils';
import type { DeckDataRow, GeometryInfo, LayerContext } from '../types';
import {
  resolvePathParser,
  resolvePointParser
} from './layer-geometry-parsers';
import { hasAnyHighlightedFeature } from './layer-highlight.utils';
import { createSplitAwareRowAccessor } from './split-rendering-accessors';
import { TRANSPARENT_POLYGON_PATTERN_FILL_COLOR } from './polygon-pattern-layer.utils';

// A fluorescent core on a dark casing: the pair stays legible on light and
// dark fills alike, and the hue appears in none of Khartis' palettes nor in
// its blue interface.
export const HIGHLIGHT_STROKE_COLOR: [number, number, number, number] = [
  255, 230, 0, 255
];
export const HIGHLIGHT_CASING_COLOR: [number, number, number, number] = [
  22, 22, 22, 255
];
export const HIGHLIGHT_STROKE_WIDTH = 3;
export const HIGHLIGHT_CASING_WIDTH = 6;
export const HIGHLIGHT_POINT_RING_RADIUS = 8;
const POINT_GEOMETRY_TYPES = new Set<string>([
  GeometryType.POINT,
  GeometryType.MULTIPOINT
]);

// Binary featureIds index the geometry table; highlights carry dataset row ids.
function createRowIdResolver(
  jsTable: ArrowTable,
  ctx: LayerContext
): (featureId: number) => number {
  return createSplitAwareRowAccessor(
    ctx,
    jsTable,
    (row) => Number(row[INTERNAL_COLUMN.ID]),
    Number.NaN
  );
}

export function createHighlightedFeatureOverlay(
  layerId: string,
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  highlightedRowIds: Set<number> | undefined,
  highlightVersion: number,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  if (!highlightedRowIds || highlightedRowIds.size === 0) {
    return [];
  }

  try {
    if (POINT_GEOMETRY_TYPES.has(geometryInfo.type.toUpperCase())) {
      return createHighlightedPointRingOverlay(
        layerId,
        jsTable,
        resolvePointParser(ctx.customProjection)(jsTable),
        highlightedRowIds,
        highlightVersion,
        ctx
      );
    }

    return createHighlightedBinaryPolygonOverlay(
      layerId,
      jsTable,
      resolvePathParser(ctx.customProjection)(jsTable),
      highlightedRowIds,
      highlightVersion,
      ctx
    );
  } catch (error) {
    logger.error(
      'Failed to create highlighted Arrow selection overlay',
      LogCategory.MAP,
      error
    );
    return [];
  }
}

function createHighlightedPointRingOverlay(
  layerId: string,
  jsTable: ArrowTable,
  pointData: BinaryPointData,
  highlightedRowIds: Set<number>,
  highlightVersion: number,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const resolveRowId = createRowIdResolver(jsTable, ctx);
  const size = pointData.size ?? 2;
  const selected: number[] = [];
  for (let index = 0; index < pointData.length; index++) {
    if (highlightedRowIds.has(resolveRowId(pointData.featureIds[index]))) {
      selected.push(
        pointData.positions[index * size],
        pointData.positions[index * size + 1]
      );
    }
  }

  if (selected.length === 0) {
    return [];
  }

  const ring: ScatterplotLayer = new ScatterplotLayer({
    id: `${layerId}-selection-overlay-points`,
    data: {
      length: selected.length / 2,
      attributes: {
        getPosition: { value: new Float64Array(selected), size: 2 }
      }
    },
    filled: false,
    stroked: true,
    radiusUnits: 'pixels',
    getRadius: HIGHLIGHT_POINT_RING_RADIUS,
    lineWidthUnits: 'pixels',
    getLineWidth: HIGHLIGHT_STROKE_WIDTH,
    lineWidthMinPixels: HIGHLIGHT_STROKE_WIDTH,
    getLineColor: HIGHLIGHT_STROKE_COLOR,
    pickable: false,
    parameters: {
      depthCompare: 'always' as const,
      stencilCompare: 'always' as const
    },
    ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
    ...(ctx.beforeId && { beforeId: ctx.beforeId }),
    updateTriggers: {
      getLineColor: [highlightVersion]
    }
  });
  const casing = ring.clone({
    id: `${layerId}-selection-overlay-points-casing`,
    getLineWidth: HIGHLIGHT_CASING_WIDTH,
    lineWidthMinPixels: HIGHLIGHT_CASING_WIDTH,
    getLineColor: HIGHLIGHT_CASING_COLOR
  });
  return [casing, ring] as unknown as Layer<DeckDataRow>[];
}

export function createHighlightedBinaryPolygonOverlay(
  layerId: string,
  jsTable: ArrowTable,
  outlineData: BinaryPathData,
  highlightedRowIds: Set<number> | undefined,
  highlightVersion: number,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  if (
    !highlightedRowIds ||
    highlightedRowIds.size === 0 ||
    outlineData.length === 0
  ) {
    return [];
  }

  const resolveRowId = createRowIdResolver(jsTable, ctx);

  if (
    !hasAnyHighlightedFeature(
      outlineData.featureIds,
      resolveRowId,
      highlightedRowIds
    )
  ) {
    return [];
  }

  const isHighlighted = (featureId: number) =>
    highlightedRowIds.has(resolveRowId(featureId));

  const buildStroke = (
    suffix: string,
    color: [number, number, number, number],
    width: number
  ): PathLayer => {
    const strokePathProps = createPathLayerProps(outlineData);
    const strokeBinaryData = strokePathProps.data as {
      attributes: Record<string, unknown>;
    };
    strokeBinaryData.attributes.getColor = pathColorAttr(
      outlineData,
      (featureId) =>
        isHighlighted(featureId)
          ? color
          : TRANSPARENT_POLYGON_PATTERN_FILL_COLOR
    );
    strokeBinaryData.attributes.getWidth = pathWidthAttr(
      outlineData,
      (featureId) => (isHighlighted(featureId) ? width : 0)
    );

    return new PathLayer({
      id: `${layerId}-selection-overlay${suffix}`,
      ...(strokePathProps as unknown as Record<string, unknown>),
      getColor: TRANSPARENT_POLYGON_PATTERN_FILL_COLOR,
      widthUnits: 'pixels',
      getWidth: width,
      widthMinPixels: 0,
      pickable: false,
      parameters: {
        depthCompare: 'always' as const,
        stencilCompare: 'always' as const
      },
      ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
      ...(ctx.beforeId && { beforeId: ctx.beforeId }),
      updateTriggers: {
        getColor: [highlightVersion],
        getWidth: [highlightVersion]
      },
      dataComparator: (newData, oldData) => newData === oldData
    });
  };

  return [
    buildStroke('-casing', HIGHLIGHT_CASING_COLOR, HIGHLIGHT_CASING_WIDTH),
    buildStroke('', HIGHLIGHT_STROKE_COLOR, HIGHLIGHT_STROKE_WIDTH)
  ] as unknown as Layer<DeckDataRow>[];
}
