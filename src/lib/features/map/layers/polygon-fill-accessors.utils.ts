import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';

import { FillMode } from '$lib/features/commons/constants/visualization.constants';

import type { LayerContext, RGBColor } from '../types';
import { isMissingThematicValue } from './layer-highlight.utils';
import { TRANSPARENT_POLYGON_PATTERN_FILL_COLOR } from './polygon-pattern-layer.utils';
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
  // Density shares the classified reading: a row with no usable numeric value
  // draws no dot, which would otherwise be indistinguishable from a zero.
  if (fillMode === FillMode.CLASSES || fillMode === FillMode.DENSITY) {
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

export function createMissingPolygonPatternColorAccessor(
  ctx: LayerContext,
  geometryTable: ArrowTable,
  fillMode: FillMode,
  valueColumn: string | undefined,
  categoryColumn: string | undefined,
  categoryColorMap: Map<string, RGBColor> | null,
  patternFillRgb: RGBColor
): (featureId: number) => [number, number, number, number] {
  const overlay: [number, number, number, number] = [
    patternFillRgb[0],
    patternFillRgb[1],
    patternFillRgb[2],
    255
  ];
  const rowToColor = (row: Record<string, unknown>) =>
    isMissingPolygonFillDatum(
      row,
      fillMode,
      valueColumn,
      categoryColumn,
      categoryColorMap
    )
      ? overlay
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

export function createGeoJsonPatternOverlayColorAccessor(
  patternFillRgb: RGBColor
): (feature: {
  properties?: Record<string, unknown>;
}) => [number, number, number, number] {
  const overlay: [number, number, number, number] = [
    patternFillRgb[0],
    patternFillRgb[1],
    patternFillRgb[2],
    255
  ];

  return () => overlay;
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

export function createUniqueClassPatternIndexAccessor(
  ctx: LayerContext
): (row: Record<string, unknown>) => number | null {
  if (!hasSplitRenderingContext(ctx)) {
    return () => 0;
  }

  return (row) => (Object.keys(row).length > 0 ? 0 : null);
}

export function createGeoJsonUniqueClassPatternIndexAccessor(
  ctx: LayerContext,
  geometryTable: ArrowTable
): (feature: { properties?: Record<string, unknown> | null }) => number | null {
  const splitAccessor = createSplitGeoJsonNullableFeatureAccessor(
    ctx,
    geometryTable,
    (row) => (row ? 0 : null)
  );

  return (feature) =>
    splitAccessor
      ? splitAccessor(feature as { properties?: Record<string, unknown> })
      : 0;
}

export function createUniquePatternBaseFillAccessor(
  ctx: LayerContext
): (row: Record<string, unknown>) => [number, number, number, number] {
  if (!hasSplitRenderingContext(ctx)) {
    return () => [255, 255, 255, 255];
  }

  return (row) =>
    Object.keys(row).length > 0
      ? [255, 255, 255, 255]
      : TRANSPARENT_POLYGON_PATTERN_FILL_COLOR;
}

export function createGeoJsonUniquePatternBaseFillAccessor(
  ctx: LayerContext,
  geometryTable: ArrowTable
): (feature: {
  properties?: Record<string, unknown> | null;
}) => [number, number, number, number] {
  const splitAccessor = createSplitGeoJsonNullableFeatureAccessor(
    ctx,
    geometryTable,
    (row): [number, number, number, number] =>
      row ? [255, 255, 255, 255] : TRANSPARENT_POLYGON_PATTERN_FILL_COLOR
  );

  return (feature) =>
    splitAccessor
      ? splitAccessor(feature as { properties?: Record<string, unknown> })
      : [255, 255, 255, 255];
}

export function createClassPatternColorAccessor(
  classIndexAccessor: (row: Record<string, unknown>) => number | null,
  targetIndex: number,
  fillRgb: RGBColor
): (row: Record<string, unknown>) => [number, number, number, number] {
  const color: [number, number, number, number] = [
    fillRgb[0],
    fillRgb[1],
    fillRgb[2],
    255
  ];
  return (row) =>
    classIndexAccessor(row) === targetIndex
      ? color
      : TRANSPARENT_POLYGON_PATTERN_FILL_COLOR;
}

export function createPatternBackgroundFillAccessor(
  classIndexAccessor: (row: Record<string, unknown>) => number | null,
  baseFillAccessor: (
    row: Record<string, unknown>
  ) => [number, number, number, number]
): (row: Record<string, unknown>) => [number, number, number, number] {
  const white: [number, number, number, number] = [255, 255, 255, 255];
  return (row) => {
    const baseColor = baseFillAccessor(row);
    if (classIndexAccessor(row) !== null) {
      return [white[0], white[1], white[2], baseColor[3] ?? 255];
    }
    return baseColor;
  };
}

export function createGeoJsonClassPatternColorAccessor(
  classIndexAccessor: (feature: {
    properties?: Record<string, unknown> | null;
  }) => number | null,
  targetIndex: number,
  fillRgb: RGBColor
): (feature: {
  properties?: Record<string, unknown>;
}) => [number, number, number, number] {
  const color: [number, number, number, number] = [
    fillRgb[0],
    fillRgb[1],
    fillRgb[2],
    255
  ];
  return (feature) =>
    classIndexAccessor(feature) === targetIndex
      ? color
      : TRANSPARENT_POLYGON_PATTERN_FILL_COLOR;
}

export function createGeoJsonPatternBackgroundFillAccessor(
  classIndexAccessor: (feature: {
    properties?: Record<string, unknown> | null;
  }) => number | null,
  baseFillAccessor: (feature: {
    properties?: Record<string, unknown>;
  }) => [number, number, number, number]
): (feature: {
  properties?: Record<string, unknown>;
}) => [number, number, number, number] {
  const white: [number, number, number, number] = [255, 255, 255, 255];
  return (feature) => {
    const baseColor = baseFillAccessor(feature);
    if (classIndexAccessor(feature) !== null) {
      return [white[0], white[1], white[2], baseColor[3] ?? 255];
    }
    return baseColor;
  };
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
