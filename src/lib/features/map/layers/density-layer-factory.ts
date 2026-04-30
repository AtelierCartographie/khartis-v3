import { ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { createScatterplotLayerProps } from 'geoarrow-deck-stream';
import {
  parsePointData,
  parsePointDataWithProjection
} from '../utils/geoarrow-stream-bridge';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { DENSITY_DEFAULTS } from '$lib/features/main-toolbar/constants';
import type { DeckDataRow, LayerContext } from '../types';
import { normalizeOpacity } from './layer-factory';

export function createDotDensityLayers(
  jsTable: ArrowTable,
  ctx: LayerContext,
  layerId: string
): Layer<DeckDataRow>[] {
  const { viz, modelMatrix, beforeId } = ctx;
  if (!viz?.density) return [];

  const dotSize = Math.max(
    0.1,
    viz.density.dotSize ?? DENSITY_DEFAULTS.dotSize
  );
  const fillColorHex = viz.density.color ?? DENSITY_DEFAULTS.color;
  const alpha = Math.round(255 * normalizeOpacity(viz.style.fillOpacity, 1));
  const rgb = hexToRgb(fillColorHex);
  const fillColor: [number, number, number, number] = [
    rgb[0],
    rgb[1],
    rgb[2],
    alpha
  ];

  const pointData = (() => {
    try {
      return ctx.customProjection
        ? parsePointDataWithProjection(jsTable, ctx.customProjection)
        : parsePointData(jsTable);
    } catch (error) {
      logger.error(
        'Failed to parse density points from Arrow table',
        LogCategory.MAP,
        error
      );
      return null;
    }
  })();
  if (!pointData) return [];

  const densityLayer = new ScatterplotLayer({
    id: `${layerId}-density`,
    ...(createScatterplotLayerProps(pointData) as unknown as Record<
      string,
      unknown
    >),
    stroked: false,
    filled: true,
    opacity: 1,
    getFillColor: fillColor,
    getRadius: dotSize,
    radiusUnits: 'pixels',
    pickable: false,
    ...(modelMatrix && { modelMatrix }),
    ...(beforeId && { beforeId }),
    updateTriggers: {
      getFillColor: [fillColorHex, alpha],
      getRadius: [dotSize]
    }
  });

  return [densityLayer as unknown as Layer<DeckDataRow>];
}
