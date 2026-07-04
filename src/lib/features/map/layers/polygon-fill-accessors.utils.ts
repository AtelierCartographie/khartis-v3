import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';

import { FillMode } from '$lib/features/commons/constants/visualization.constants';

import type { LayerContext, RGBColor } from '../types';
import { isMissingThematicValue } from './layer-highlight.utils';
import {
  POLYGON_PATTERN_FILL_COLOR,
  TRANSPARENT_POLYGON_PATTERN_FILL_COLOR
} from './polygon-pattern-layer.utils';
import {
  createSplitAwareNullableRowAccessor,
  createSplitAwareRowAccessor,
  createSplitGeoJsonFeatureAccessor,
  createSplitGeoJsonNullableFeatureAccessor,
  hasSplitRenderingContext
} from './split-rendering-accessors';

function isMissingPolygonFillDatum(
  row: Record<string, unknown>,
  fillMode: FillMode,
  valueColumn: string | undefined,
  categoryColumn: string | undefined,
  categoryColorMap: Map<string, RGBColor> | null
): boolean {
  if (fillMode === FillMode.CLASSES) {
    if (!valueColumn) {
      return false;
    }
    const rawValue = row[valueColumn];
    if (isMissingThematicValue(rawValue)) {
      return true;
    }
    const numericValue =
      typeof rawValue === 'number' ? rawValue : Number(rawValue);
    return !Number.isFinite(numericValue);
  }

  if (fillMode === FillMode.CATEGORIES) {
    if (!categoryColumn) {
      return false;
    }
    const rawValue = row[categoryColumn];
    if (isMissingThematicValue(rawValue)) {
      return true;
    }
    return !categoryColorMap?.has(String(rawValue));
  }

  return false;
}

export function filterMissingPolygonPatternFeatures(
  geojson: FeatureCollection,
  ctx: LayerContext,
  geometryTable: ArrowTable,
  fillMode: FillMode,
  valueColumn: string | undefined,
  categoryColumn: string | undefined,
  categoryColorMap: Map<string, RGBColor> | null
): FeatureCollection {
  const rowPredicate = (row: Record<string, unknown>) =>
    isMissingPolygonFillDatum(
      row,
      fillMode,
      valueColumn,
      categoryColumn,
      categoryColorMap
    );
  const splitFeaturePredicate = createSplitGeoJsonFeatureAccessor(
    ctx,
    geometryTable,
    rowPredicate
  );
  const isMissingFeature = splitFeaturePredicate
    ? (feature: { properties?: Record<string, unknown> }) =>
        splitFeaturePredicate(feature)
    : (feature: { properties?: Record<string, unknown> }) =>
        rowPredicate(feature.properties ?? {});

  return {
    ...geojson,
    features: geojson.features.filter((feature) =>
      isMissingFeature({
        properties: feature.properties ?? undefined
      })
    )
  };
}

function readTableRow(
  table: ArrowTable,
  rowIndex: number
): Record<string, unknown> {
  const row = (
    table as ArrowTable & {
      get?: (index: number) => Record<string, unknown> | null | undefined;
    }
  ).get?.(rowIndex);
  return row && typeof row === 'object' ? row : {};
}

export function createSplitMatchedPolygonPatternColorAccessor(
  ctx: LayerContext,
  geometryTable: ArrowTable
): (featureId: number) => [number, number, number, number] {
  if (!hasSplitRenderingContext(ctx)) {
    return () => POLYGON_PATTERN_FILL_COLOR;
  }

  return createSplitAwareNullableRowAccessor(
    ctx,
    geometryTable,
    (row) =>
      row ? POLYGON_PATTERN_FILL_COLOR : TRANSPARENT_POLYGON_PATTERN_FILL_COLOR,
    geometryTable
  );
}

export function createMissingPolygonPatternColorAccessor(
  ctx: LayerContext,
  geometryTable: ArrowTable,
  fillMode: FillMode,
  valueColumn: string | undefined,
  categoryColumn: string | undefined,
  categoryColorMap: Map<string, RGBColor> | null
): (featureId: number) => [number, number, number, number] {
  const rowToColor = (row: Record<string, unknown>) =>
    isMissingPolygonFillDatum(
      row,
      fillMode,
      valueColumn,
      categoryColumn,
      categoryColorMap
    )
      ? POLYGON_PATTERN_FILL_COLOR
      : TRANSPARENT_POLYGON_PATTERN_FILL_COLOR;

  if (hasSplitRenderingContext(ctx)) {
    return createSplitAwareRowAccessor(
      ctx,
      geometryTable,
      rowToColor,
      geometryTable
    );
  }

  return (featureId) => rowToColor(readTableRow(geometryTable, featureId));
}

export function createSplitUniqueBinaryColorAccessor(
  ctx: LayerContext,
  sourceTable: ArrowTable,
  geometryTable: ArrowTable,
  color: RGBColor
): ((featureId: number) => [number, number, number, number]) | null {
  if (!hasSplitRenderingContext(ctx)) {
    return null;
  }

  return createSplitAwareNullableRowAccessor(
    ctx,
    sourceTable,
    (row) => (row ? [color[0], color[1], color[2], 255] : [0, 0, 0, 0]),
    geometryTable
  );
}

export function createSplitUniqueGeoJsonColorAccessor(
  ctx: LayerContext,
  geometryTable: ArrowTable,
  color: RGBColor
):
  | ((feature: {
      properties?: Record<string, unknown>;
    }) => [number, number, number, number])
  | null {
  return createSplitGeoJsonNullableFeatureAccessor(ctx, geometryTable, (row) =>
    row ? [color[0], color[1], color[2], 255] : [0, 0, 0, 0]
  );
}

export function filterSplitMatchedPolygonFeatures(
  geojson: FeatureCollection,
  ctx: LayerContext,
  geometryTable: ArrowTable
): FeatureCollection {
  const splitFeaturePredicate = createSplitGeoJsonNullableFeatureAccessor(
    ctx,
    geometryTable,
    (row) => row !== null
  );
  if (!splitFeaturePredicate) {
    return geojson;
  }

  return {
    ...geojson,
    features: geojson.features.filter((feature) =>
      splitFeaturePredicate({
        properties: feature.properties ?? undefined
      })
    )
  };
}
