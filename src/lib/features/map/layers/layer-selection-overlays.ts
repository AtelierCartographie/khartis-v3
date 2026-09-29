import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer, PathLayer } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { createPathLayerProps } from '@ateliercartographie/geoarrow-deck-stream';
import type { BinaryPathData } from '@ateliercartographie/geoarrow-deck-stream';

import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

import {
  pathColorAttr,
  pathWidthAttr
} from '../utils/geoarrow-stream-bridge.utils';
import type { DeckDataRow, LayerContext } from '../types';
import { hasAnyHighlightedFeature } from './layer-highlight.utils';
import { createSplitAwareRowAccessor } from './split-rendering-accessors';
import {
  getCachedGeoJSON,
  getCachedProjectedGeoJSON
} from './layer-geojson-cache';
import { TRANSPARENT_POLYGON_PATTERN_FILL_COLOR } from './polygon-pattern-layer.utils';

const SELECTED_POLYGON_STROKE_COLOR: [number, number, number, number] = [
  15, 98, 254, 255
];
const SELECTED_POLYGON_STROKE_WIDTH = 3;
const SELECTED_POINT_RING_RADIUS = 8;

export function createHighlightedFeatureOverlay(
  layerId: string,
  jsTable: ArrowTable,
  geoColumn: string,
  highlightedRowIds: Set<number> | undefined,
  highlightVersion: number,
  ctx: Pick<LayerContext, 'customProjection' | 'modelMatrix' | 'beforeId'>
): Layer<DeckDataRow> | null {
  if (!highlightedRowIds || highlightedRowIds.size === 0) {
    return null;
  }

  try {
    const rawGeoJson = getCachedGeoJSON(jsTable, geoColumn);
    if (!rawGeoJson) {
      return null;
    }

    const highlightedGeoJson: FeatureCollection = {
      ...rawGeoJson,
      features: rawGeoJson.features.filter((feature) => {
        const rowId = feature.properties?.[INTERNAL_COLUMN.ID];
        return typeof rowId === 'number' && highlightedRowIds.has(rowId);
      })
    };

    if (highlightedGeoJson.features.length === 0) {
      return null;
    }

    const projectedGeoJson = getCachedProjectedGeoJSON(
      highlightedGeoJson,
      ctx.customProjection
    );

    if (projectedGeoJson.features.length === 0) {
      return null;
    }

    return new GeoJsonLayer({
      id: `${layerId}-selection-overlay`,
      data: projectedGeoJson,
      filled: false,
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineColor: SELECTED_POLYGON_STROKE_COLOR,
      getLineWidth: SELECTED_POLYGON_STROKE_WIDTH,
      lineWidthMinPixels: SELECTED_POLYGON_STROKE_WIDTH,
      pointType: 'circle',
      pointRadiusUnits: 'pixels',
      getPointRadius: SELECTED_POINT_RING_RADIUS,
      pickable: false,
      parameters: {
        depthCompare: 'always' as const,
        stencilCompare: 'always' as const
      },
      ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
      ...(ctx.beforeId && { beforeId: ctx.beforeId }),
      updateTriggers: {
        getLineColor: [highlightVersion],
        getLineWidth: [highlightVersion]
      },
      dataComparator: (newData, oldData) => newData === oldData
    });
  } catch (error) {
    logger.error(
      'Failed to create highlighted Arrow path overlay',
      LogCategory.MAP,
      error
    );
    return null;
  }
}

export function createHighlightedBinaryPolygonOverlay(
  layerId: string,
  jsTable: ArrowTable,
  outlineData: BinaryPathData,
  highlightedRowIds: Set<number> | undefined,
  highlightVersion: number,
  ctx: LayerContext
): Layer<DeckDataRow> | null {
  if (
    !highlightedRowIds ||
    highlightedRowIds.size === 0 ||
    outlineData.length === 0
  ) {
    return null;
  }

  // Binary featureIds index the geometry table; highlights carry dataset row ids.
  const resolveRowId = createSplitAwareRowAccessor(
    ctx,
    jsTable,
    (row) => Number(row[INTERNAL_COLUMN.ID]),
    Number.NaN
  );

  if (
    !hasAnyHighlightedFeature(
      outlineData.featureIds,
      resolveRowId,
      highlightedRowIds
    )
  ) {
    return null;
  }

  const isHighlighted = (featureId: number) =>
    highlightedRowIds.has(resolveRowId(featureId));

  const strokePathProps = createPathLayerProps(outlineData);
  const strokeBinaryData = strokePathProps.data as {
    attributes: Record<string, unknown>;
  };
  strokeBinaryData.attributes.getColor = pathColorAttr(
    outlineData,
    (featureId) =>
      isHighlighted(featureId)
        ? SELECTED_POLYGON_STROKE_COLOR
        : TRANSPARENT_POLYGON_PATTERN_FILL_COLOR
  );
  strokeBinaryData.attributes.getWidth = pathWidthAttr(
    outlineData,
    (featureId) =>
      isHighlighted(featureId) ? SELECTED_POLYGON_STROKE_WIDTH : 0
  );

  return new PathLayer({
    id: `${layerId}-selection-overlay`,
    ...(strokePathProps as unknown as Record<string, unknown>),
    getColor: TRANSPARENT_POLYGON_PATTERN_FILL_COLOR,
    widthUnits: 'pixels',
    getWidth: SELECTED_POLYGON_STROKE_WIDTH,
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
}
