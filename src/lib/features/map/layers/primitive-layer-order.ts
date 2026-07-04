import type { Layer } from '@deck.gl/core';

import {
  type PrimitiveFilter,
  PrimitiveFilterType
} from '$lib/features/commons/stores/visualization.store.svelte';

import { DeckLayerId } from '../constants';
import type { DeckDataRow } from '../types';

export type PrimitiveLayerEntry = {
  primitive: PrimitiveFilter;
  layer: Layer<DeckDataRow>;
};

function getPrimitiveOrderIndex(
  primitiveOrder: readonly PrimitiveFilter[],
  primitive: PrimitiveFilter
): number {
  const index = primitiveOrder.indexOf(primitive);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function orderPrimitiveLayers(
  entries: PrimitiveLayerEntry[],
  primitiveOrder: readonly PrimitiveFilter[]
): Layer<DeckDataRow>[] {
  return entries
    .sort(
      (left, right) =>
        getPrimitiveOrderIndex(primitiveOrder, right.primitive) -
        getPrimitiveOrderIndex(primitiveOrder, left.primitive)
    )
    .map((entry) => entry.layer);
}

function classifyLayerPrimitive(layerId: string): PrimitiveFilter | null {
  if (layerId.startsWith(DeckLayerId.TEXT_LAYER)) {
    return PrimitiveFilterType.TEXT;
  }
  if (layerId.startsWith(DeckLayerId.POINT_LAYER)) {
    return PrimitiveFilterType.POINT;
  }
  if (layerId.startsWith(DeckLayerId.LINE_LAYER)) {
    return PrimitiveFilterType.LINE;
  }
  if (layerId.startsWith(DeckLayerId.POLYGON_LAYER)) {
    return PrimitiveFilterType.POLYGON;
  }
  return null;
}

export function orderLayersByPrimitive(
  thematicLayers: Layer<DeckDataRow>[],
  textLayers: Layer<DeckDataRow>[],
  primitiveOrder: PrimitiveFilter[] | undefined
): Layer<DeckDataRow>[] {
  const order = primitiveOrder ?? [
    PrimitiveFilterType.POINT,
    PrimitiveFilterType.LINE,
    PrimitiveFilterType.POLYGON,
    PrimitiveFilterType.TEXT
  ];
  const tagged: Array<{
    primitive: PrimitiveFilter | null;
    index: number;
    layer: Layer<DeckDataRow>;
  }> = [
    ...thematicLayers.map((layer, index) => ({
      primitive: classifyLayerPrimitive(String(layer.id)),
      index,
      layer
    })),
    ...textLayers.map((layer, index) => ({
      primitive: PrimitiveFilterType.TEXT,
      index: thematicLayers.length + index,
      layer
    }))
  ];

  const getOrderRank = (primitive: PrimitiveFilter | null): number => {
    if (!primitive) return Number.MAX_SAFE_INTEGER;
    const idx = order.indexOf(primitive);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };

  return tagged
    .slice()
    .sort((a, b) => {
      const rankDiff = getOrderRank(b.primitive) - getOrderRank(a.primitive);
      if (rankDiff !== 0) return rankDiff;
      return a.index - b.index;
    })
    .map((entry) => entry.layer);
}
