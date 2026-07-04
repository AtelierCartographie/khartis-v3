import type { Table as ArrowTable } from 'apache-arrow/Arrow';

import {
  getPrimitiveClassification,
  getSymbolFillClassification,
  getSymbolPrimitive,
  PrimitiveFilterType
} from '$lib/features/commons/stores/visualization.store.svelte';
import { SymbolMode } from '$lib/features/commons/constants/visualization.constants';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';

import {
  getCategoricalColorMap,
  hasCompleteCategoricalColorMap
} from '../utils/data-styling.utils';
import type { LayerContext, RGBColor } from '../types';
import { toTextValue } from './text-layer-data.utils';

export function resolveStyleColor(
  styleColor: string | string[] | undefined,
  fallback: RGBColor
): RGBColor {
  if (Array.isArray(styleColor) && typeof styleColor[0] === 'string') {
    return hexToRgb(styleColor[0]);
  }
  if (typeof styleColor === 'string') {
    return hexToRgb(styleColor);
  }
  return fallback;
}

export function buildCategoryColorMapFromLabels(
  labels: string[] | undefined,
  colors: string[] | undefined
): Map<string, RGBColor> | null {
  if (!labels?.length || !colors?.length) {
    return null;
  }

  const map = new Map<string, RGBColor>();
  labels.forEach((label, index) => {
    const hex = colors[index % colors.length];
    if (hex) {
      map.set(label, hexToRgb(hex));
    }
  });
  return map;
}

export function resolveEffectiveCategoryColorMap(
  jsTable: ArrowTable,
  viz: LayerContext['viz'],
  categoryColorMap: Map<string, RGBColor> | null | undefined,
  categoryColumn: string | undefined,
  primitive: PrimitiveFilterType = PrimitiveFilterType.POLYGON
): Map<string, RGBColor> | null {
  const classification = viz
    ? primitive === PrimitiveFilterType.POINT
      ? getSymbolPrimitive(viz)?.mode === SymbolMode.CATEGORIES
        ? (getPrimitiveClassification(viz, primitive) ?? viz.classification)
        : (getSymbolFillClassification(viz) ?? viz.classification)
      : (getPrimitiveClassification(viz, primitive) ?? viz.classification)
    : undefined;
  if (!viz || !categoryColumn || !classification?.colors?.length) {
    return categoryColorMap ?? null;
  }

  const classificationColors = classification.colors ?? [];
  const storedLabels =
    (classification.categoryValues ?? classification.labels)
      ?.map((label) => toTextValue(label))
      .filter((label): label is string => label !== null) ?? [];
  if (storedLabels.length > 0) {
    if (
      hasCompleteCategoricalColorMap(
        storedLabels,
        categoryColorMap,
        classificationColors
      )
    ) {
      return categoryColorMap ?? null;
    }

    return getCategoricalColorMap(storedLabels, classificationColors);
  }

  const categoryVector = jsTable.getChild(categoryColumn);
  if (!categoryVector) {
    return categoryColorMap ?? null;
  }

  const categories = new Set<string>();
  for (let rowIndex = 0; rowIndex < jsTable.numRows; rowIndex += 1) {
    const value = toTextValue(categoryVector.get(rowIndex));
    if (value) {
      categories.add(value);
    }
  }

  if (categories.size === 0) {
    return categoryColorMap ?? null;
  }

  const categoryList = [...categories];
  if (
    hasCompleteCategoricalColorMap(
      categoryList,
      categoryColorMap,
      classificationColors
    )
  ) {
    return categoryColorMap ?? null;
  }

  return getCategoricalColorMap(categoryList, classificationColors);
}
