import { ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { createScatterplotLayerProps } from 'geoarrow-deck-stream';
import {
  parsePointData,
  parsePointDataWithProjection
} from '../utils/geoarrow-stream-bridge.utils';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import { DENSITY_DEFAULTS } from '$lib/features/commons/constants/visualization.constants';
import type { DeckDataRow, LayerContext } from '../types';
import { normalizeOpacity, resolvePageDisplayScale } from './layer-style.utils';
import * as m from '$lib/paraglide/messages';

export function createDotDensityLayers(
  jsTable: ArrowTable,
  ctx: LayerContext,
  layerId: string
): Layer<DeckDataRow>[] {
  const { viz, modelMatrix, beforeId } = ctx;
  if (!viz?.density) return [];

  const pageDisplayScale = resolvePageDisplayScale(ctx);
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
        'Failed to parse density point layer data',
        LogCategory.MAP,
        error
      );
      showWarning(
        m.density_layer_warning_title(),
        m.density_layer_warning_message()
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
    radiusScale: pageDisplayScale,
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
