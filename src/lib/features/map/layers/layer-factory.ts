import type { Layer } from '@deck.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { FillMode } from '$lib/features/commons/constants/visualization.constants';
import {
  getPolygonPrimitive,
  PrimitiveFilterType,
  type PrimitiveFilter
} from '$lib/features/commons/stores/visualization.store.svelte';
import { DeckLayerId, GeometryType } from '../constants';
import { extractGeometryInfo } from '../io';
import type { DeckDataRow, GeometryInfo, LayerContext } from '../types';
import { orderLayersByPrimitive } from './primitive-layer-order';
import { createGeoJsonLayerStack } from './geojson-layer-factory';
import { createThematicLayerId } from './layer-id.utils';
import { createLineLayerStack } from './line-layer-factory';
import { createPolygonLayerStack } from './polygon-layer-factory';
import {
  createPointLayerStack,
  createRepresentativePointSymbolLayers
} from './point-layer-factory';
import { createTextOverlayLayers } from './text-layer-factory';

export { resolveSplitMappingFeatureIdColumn } from './split-rendering-accessors';
export { resolveTextAnchor } from './text-layer-data.utils';
export { resolveStyleColor } from './layer-color.utils';
export { resolveEffectiveCategoryColorMap } from './layer-color.utils';
export { normalizeOpacity } from './layer-style.utils';
export type { TextLayerDatum } from './text-layer-data.utils';

export function createPointLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  return createPointLayerStack(jsTable, geometryInfo, ctx);
}

export function createLineLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const representativePointLayers = createRepresentativePointSymbolLayers(
    jsTable,
    ctx
  );
  return createLineLayerStack(
    jsTable,
    geometryInfo,
    ctx,
    representativePointLayers
  );
}
export function createPolygonLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  return createPolygonLayerStack(jsTable, geometryInfo, ctx, {
    createPointLayers,
    createRepresentativePointSymbolLayers
  });
}

export function createGeoJsonLayers(
  geojson: FeatureCollection,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const layerId = createThematicLayerId(DeckLayerId.GEOJSON_LAYER, ctx);
  return createGeoJsonLayerStack(geojson, ctx, layerId);
}

export function createDeckLayers(
  jsTable: ArrowTable,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  if (jsTable.numRows === 0) {
    return [];
  }

  const geometryInfo = ctx.geometryInfo ?? extractGeometryInfo(jsTable);

  if (!geometryInfo) {
    const hasUserDataset = Boolean(ctx.datasetId);
    if (hasUserDataset) {
      logger.error(
        'Missing geometry metadata for user dataset layer',
        LogCategory.MAP
      );
    }
    return [];
  }

  const resolvedGeometryType = geometryInfo.type;

  const primitiveMap: Record<string, PrimitiveFilter> = {
    [GeometryType.POINT]: PrimitiveFilterType.POINT,
    [GeometryType.MULTIPOINT]: PrimitiveFilterType.POINT,
    [GeometryType.LINESTRING]: PrimitiveFilterType.LINE,
    [GeometryType.MULTILINESTRING]: PrimitiveFilterType.LINE,
    [GeometryType.POLYGON]: PrimitiveFilterType.POLYGON,
    [GeometryType.MULTIPOLYGON]: PrimitiveFilterType.POLYGON
  };

  const primitive = primitiveMap[resolvedGeometryType];
  const isPolygonGeometry =
    resolvedGeometryType === GeometryType.POLYGON ||
    resolvedGeometryType === GeometryType.MULTIPOLYGON;
  const isLineGeometry =
    resolvedGeometryType === GeometryType.LINESTRING ||
    resolvedGeometryType === GeometryType.MULTILINESTRING;

  const isDensityMode =
    ctx.viz && getPolygonPrimitive(ctx.viz)?.fillMode === FillMode.DENSITY;
  const effectivePrimitive = isDensityMode
    ? PrimitiveFilterType.POLYGON
    : primitive;
  const isPrimitiveFilteredOut =
    !isPolygonGeometry &&
    !isLineGeometry &&
    effectivePrimitive &&
    ctx.viz?.primitiveFilters &&
    !ctx.viz.primitiveFilters.includes(effectivePrimitive);

  let thematicLayers: Layer<DeckDataRow>[] = [];
  switch (resolvedGeometryType) {
    case GeometryType.POINT:
    case GeometryType.MULTIPOINT:
      thematicLayers = createPointLayers(jsTable, geometryInfo, ctx);
      break;

    case GeometryType.LINESTRING:
    case GeometryType.MULTILINESTRING:
      thematicLayers = createLineLayers(jsTable, geometryInfo, ctx);
      break;

    case GeometryType.POLYGON:
    case GeometryType.MULTIPOLYGON:
      thematicLayers = createPolygonLayers(jsTable, geometryInfo, ctx);
      break;

    default:
  }

  if (isPrimitiveFilteredOut) {
    thematicLayers = thematicLayers.map(
      (layer) => layer.clone({ visible: false }) as Layer<DeckDataRow>
    );
  }

  const textLayers = createTextOverlayLayers(jsTable, geometryInfo, ctx);
  return orderLayersByPrimitive(thematicLayers, textLayers, ctx.primitiveOrder);
}
