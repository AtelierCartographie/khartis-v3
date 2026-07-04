import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { FeatureCollection } from 'geojson';

import { resolveHoverHighlightProps } from '../utils/hover-highlight-props.utils';
import type { DeckDataRow, LayerContext } from '../types';
import { withGeoJsonRowHighlight, withOpacity } from './layer-helpers';
import {
  HIGHLIGHT_DIMMING_FACTOR,
  ensureGeoJsonFeatureIds
} from './layer-highlight.utils';
import { getCachedProjectedGeoJSON } from './layer-geojson-cache';
import { createHighlightedGeoJsonOverlay } from './layer-selection-overlays';

export function createGeoJsonLayerStack(
  geojson: FeatureCollection,
  ctx: LayerContext,
  layerId: string
): Layer<DeckDataRow>[] {
  const {
    fillColor,
    strokeColor,
    fillOpacity,
    strokeWidth,
    strokeOpacity,
    highlightedRowIds,
    modelMatrix,
    beforeId
  } = ctx;

  const hasHighlights = highlightedRowIds && highlightedRowIds.size > 0;
  const hlVersion = ctx.highlightVersion ?? 0;

  const projectedData = getCachedProjectedGeoJSON(
    geojson,
    ctx.customProjection
  );
  const data = ensureGeoJsonFeatureIds(projectedData);
  const baseFillColor: [number, number, number, number] = [
    fillColor[0],
    fillColor[1],
    fillColor[2],
    Math.round(fillOpacity * 255)
  ];
  const geoJsonFillColor =
    hasHighlights && highlightedRowIds
      ? withGeoJsonRowHighlight(
          baseFillColor,
          fillOpacity,
          HIGHLIGHT_DIMMING_FACTOR,
          highlightedRowIds
        )
      : baseFillColor;
  const geoJsonLineColor =
    hasHighlights && highlightedRowIds
      ? withGeoJsonRowHighlight(
          strokeColor,
          strokeOpacity,
          HIGHLIGHT_DIMMING_FACTOR,
          highlightedRowIds
        )
      : withOpacity(strokeColor, strokeOpacity);

  const layers: Layer<DeckDataRow>[] = [
    new GeoJsonLayer({
      id: layerId,
      data,
      filled: true,
      stroked: true,
      getFillColor: geoJsonFillColor,
      getLineColor: geoJsonLineColor,
      getLineWidth: strokeWidth,
      lineWidthMinPixels: Math.max(1, strokeWidth),
      pickable: true,
      ...resolveHoverHighlightProps(),
      parameters: {
        depthCompare: 'always' as const,
        stencilCompare: 'always' as const
      },
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getFillColor: [fillColor, fillOpacity, hlVersion],
        getLineColor: [strokeColor, strokeOpacity, hlVersion],
        getLineWidth: [strokeWidth]
      },
      dataComparator: (newData, oldData) => newData === oldData
    })
  ];

  const selectionOverlay = createHighlightedGeoJsonOverlay(
    layerId,
    data,
    highlightedRowIds,
    hlVersion,
    ctx
  );
  if (selectionOverlay) {
    layers.push(selectionOverlay);
  }

  return layers;
}
