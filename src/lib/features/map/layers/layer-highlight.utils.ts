import type { Color } from '@deck.gl/core';
import type { FeatureCollection, Geometry } from 'geojson';

import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { SymbolMode } from '$lib/features/commons/constants/visualization.constants';
import {
  getPrimitiveCategoryColumn,
  getPrimitiveSizeColumn,
  getPrimitiveValueColumn,
  getSymbolFillCategoryColumn,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  PrimitiveFilterType
} from '$lib/features/commons/stores/visualization.store.svelte';

import { GeometryType } from '../constants';
import type { DeckDataRow, GeometryInfo, LayerContext } from '../types';

export const HIGHLIGHT_DIMMING_FACTOR = 0.3;

export function isMissingThematicValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'number') {
    return !Number.isFinite(value);
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  return false;
}

export function resolvePointMissingColumn(
  viz: LayerContext['viz'],
  useProportionalSymbols: boolean,
  useClassedSymbols: boolean,
  useCategoricalColor: boolean,
  useChoropleth: boolean
): string | null {
  if (!viz) {
    return null;
  }

  if (useClassedSymbols || useChoropleth) {
    return useClassedSymbols
      ? (getPrimitiveValueColumn(viz, PrimitiveFilterType.POINT) ?? null)
      : (getSymbolFillValueColumn(viz) ?? null);
  }

  if (useProportionalSymbols) {
    return getPrimitiveSizeColumn(viz, PrimitiveFilterType.POINT) ?? null;
  }

  if (useCategoricalColor) {
    return getSymbolPrimitive(viz)?.mode === SymbolMode.CATEGORIES
      ? (getPrimitiveCategoryColumn(viz, PrimitiveFilterType.POINT) ?? null)
      : (getSymbolFillCategoryColumn(viz) ?? null);
  }

  return null;
}

export function resolveHighlightedOpacityForRow(
  row: DeckDataRow,
  baseOpacity: number,
  highlightedRowIds: Set<number> | undefined
): number {
  if (!highlightedRowIds || highlightedRowIds.size === 0) {
    return baseOpacity;
  }

  const rowId = row[INTERNAL_COLUMN.ID];
  return highlightedRowIds.has(Number(rowId))
    ? baseOpacity
    : baseOpacity * HIGHLIGHT_DIMMING_FACTOR;
}

export function resolveGeoJsonFeatureRowId(
  feature: { properties?: Record<string, unknown> | null },
  fallbackIndex: number
): number {
  const rawId = feature.properties?.[INTERNAL_COLUMN.ID];
  if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    return rawId;
  }

  const coercedId = Number(rawId);
  return Number.isFinite(coercedId) ? coercedId : fallbackIndex + 1;
}

export function ensureGeoJsonFeatureIds<T extends Geometry>(
  geojson: FeatureCollection<T>
): FeatureCollection<T> {
  let didChange = false;

  const features = geojson.features.map((feature, index) => {
    const rowId = resolveGeoJsonFeatureRowId(feature, index);
    if (feature.properties?.[INTERNAL_COLUMN.ID] === rowId) {
      return feature;
    }

    didChange = true;
    return {
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        [INTERNAL_COLUMN.ID]: rowId
      }
    };
  });

  return didChange ? { ...geojson, features } : geojson;
}

export function isPolygonGeometryType(
  geometryType: GeometryInfo['type'] | Geometry['type'] | undefined
): boolean {
  const normalizedGeometryType = geometryType?.toUpperCase();
  return (
    normalizedGeometryType === GeometryType.POLYGON ||
    normalizedGeometryType === GeometryType.MULTIPOLYGON
  );
}

export function hasAnyFeatureId(
  featureIds: Uint32Array,
  candidateFeatureIds: Set<number>
): boolean {
  for (let index = 0; index < featureIds.length; index += 1) {
    if (candidateFeatureIds.has(featureIds[index])) {
      return true;
    }
  }
  return false;
}

export function toMutableRgba(color: Color): [number, number, number, number] {
  return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[3] ?? 255];
}
