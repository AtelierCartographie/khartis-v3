import type { Table as ArrowTable } from 'apache-arrow/Arrow';

import type {
  ClassificationConfig,
  SymbolPrimitiveConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  getSymbolPrimitive,
  ScaleType
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  CATEGORY_SHAPE_CYCLE,
  CategoryShapeMode,
  DEFAULT_COLORS,
  isLinearShape,
  ProportionalType,
  SHAPE_ORDINAL,
  ShapeType,
  StrokeMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';

import type { LayerContext, RGBColor } from '../types';
import { resolveMissingDataPointShape as resolveMissingPointShape } from '../utils/legend.utils';
import { isMissingThematicValue } from './layer-highlight.utils';
import {
  resolveSymbolDashSpec,
  type SymbolDashSpec
} from './layer-style.utils';

type ArrowColumn = NonNullable<ReturnType<ArrowTable['getChild']>>;

type SymbolStrokeStyle = {
  color: RGBColor;
  width: number;
  opacity: number;
  dashed: boolean;
  dashSpec: SymbolDashSpec;
  show: boolean;
};

type SymbolMissingDataStyle = {
  show: boolean;
  color: RGBColor;
  radius: number;
  shape: ShapeType;
};

type CategoryShapeMaps = {
  categoryShapeMap: Map<string, number> | null;
  categoryRankRadiusMap: Map<string, number> | null;
};

export function buildShapeAttribute(
  featureIds: Uint32Array | undefined,
  jsTable: ArrowTable,
  missingColumn: string | undefined,
  shapeOrdinal: number,
  missingShapeOrdinal: number
): { value: Float32Array; size: number } {
  if (!featureIds) {
    return { value: new Float32Array([shapeOrdinal]), size: 1 };
  }
  const missingVector = missingColumn ? jsTable.getChild(missingColumn) : null;
  const out = new Float32Array(featureIds.length);
  for (let i = 0; i < featureIds.length; i += 1) {
    if (
      missingVector &&
      isMissingThematicValue(missingVector.get(featureIds[i]))
    ) {
      out[i] = missingShapeOrdinal;
      continue;
    }
    out[i] = shapeOrdinal;
  }
  return { value: out, size: 1 };
}

export function resolveProportionalSymbolScale(shape: ShapeType): ScaleType {
  return isLinearShape(shape) ? ScaleType.LINEAR : ScaleType.SQRT;
}

export function usesDoubleProportionalSymbols(
  viz: LayerContext['viz']
): boolean {
  const pointConfig = getSymbolPrimitive(viz);
  return Boolean(
    viz &&
    pointConfig?.mode === SymbolMode.PROPORTIONAL &&
    pointConfig.proportionalType === ProportionalType.DOUBLE &&
    pointConfig.sizeColumn &&
    pointConfig.valueColumn
  );
}

export function resolveSymbolStrokeStyle(
  pointConfig: SymbolPrimitiveConfig | undefined,
  fallback: { color: RGBColor; width: number; opacity: number }
): SymbolStrokeStyle {
  const color = Array.isArray(pointConfig?.strokeColor)
    ? hexToRgb(pointConfig.strokeColor[0] ?? '#000000')
    : typeof pointConfig?.strokeColor === 'string'
      ? hexToRgb(pointConfig.strokeColor)
      : fallback.color;
  const width = pointConfig?.strokeWidth ?? fallback.width;
  const opacity = pointConfig?.strokeOpacity ?? fallback.opacity;
  const dashed = pointConfig?.strokeDashed ?? false;
  const dashSpec = resolveSymbolDashSpec(pointConfig?.strokeDashedPattern);
  return {
    color,
    width,
    opacity,
    dashed,
    dashSpec,
    show:
      pointConfig?.strokeMode !== StrokeMode.NONE && opacity > 0 && width > 0
  };
}

export function resolveSymbolMissingDataStyle(
  pointConfig: SymbolPrimitiveConfig | undefined,
  fallbackRadius: number
): SymbolMissingDataStyle {
  return {
    show: pointConfig?.missingData?.show ?? true,
    color: hexToRgb(
      pointConfig?.missingData?.color ?? DEFAULT_COLORS.missingData
    ),
    radius: Math.max(1, pointConfig?.missingData?.size ?? fallbackRadius),
    shape: resolveMissingPointShape(pointConfig?.missingData?.shape)
  };
}

function collectOrderedCategoryLabels(
  attributeTable: ArrowTable,
  categoryVector: ArrowColumn,
  labels: readonly string[] | undefined
): readonly string[] {
  if (labels && labels.length > 0) {
    return labels;
  }

  const seen = new Set<string>();
  const orderedLabels: string[] = [];
  for (let i = 0; i < attributeTable.numRows; i += 1) {
    const raw = categoryVector.get(i);
    if (raw === null || raw === undefined) continue;
    const key = String(raw);
    if (!seen.has(key)) {
      seen.add(key);
      orderedLabels.push(key);
    }
  }
  return orderedLabels;
}

export function resolveCategoryShapeMaps(options: {
  useCategoryShape: boolean;
  categoryShapeMode: CategoryShapeMode;
  categoryVector: ArrowColumn | null;
  attributeTable: ArrowTable;
  classification: ClassificationConfig | undefined;
  baseShape: ShapeType;
  minRadius: number;
  maxRadius: number;
  orderedRadiusMinimumDelta: number;
}): CategoryShapeMaps {
  const {
    useCategoryShape,
    categoryShapeMode,
    categoryVector,
    attributeTable,
    classification,
    baseShape,
    minRadius,
    maxRadius,
    orderedRadiusMinimumDelta
  } = options;
  if (!useCategoryShape || !categoryVector) {
    return { categoryShapeMap: null, categoryRankRadiusMap: null };
  }

  const orderedCategoryLabels = collectOrderedCategoryLabels(
    attributeTable,
    categoryVector,
    classification?.labels
  );
  const userShapes = classification?.categoryShapes ?? [];
  const useUserShapes =
    categoryShapeMode === CategoryShapeMode.DIFFERENT && userShapes.length > 0;

  const categoryShapeMap = new Map<string, number>();
  for (let i = 0; i < orderedCategoryLabels.length; i += 1) {
    const label = orderedCategoryLabels[i];
    if (label === undefined) continue;
    const shape = useUserShapes
      ? (userShapes[i] ??
        CATEGORY_SHAPE_CYCLE[i % CATEGORY_SHAPE_CYCLE.length] ??
        ShapeType.CIRCLE)
      : categoryShapeMode === CategoryShapeMode.ORDERED
        ? baseShape
        : (CATEGORY_SHAPE_CYCLE[i % CATEGORY_SHAPE_CYCLE.length] ??
          ShapeType.CIRCLE);
    categoryShapeMap.set(
      label,
      SHAPE_ORDINAL[shape] ?? SHAPE_ORDINAL[ShapeType.CIRCLE]
    );
  }

  if (
    categoryShapeMode !== CategoryShapeMode.ORDERED ||
    orderedCategoryLabels.length === 0
  ) {
    return { categoryShapeMap, categoryRankRadiusMap: null };
  }

  const rMin = Math.max(1, minRadius);
  const rMax = Math.max(rMin + orderedRadiusMinimumDelta, maxRadius);
  const categoryRankRadiusMap = new Map<string, number>();
  for (let i = 0; i < orderedCategoryLabels.length; i += 1) {
    const label = orderedCategoryLabels[i];
    if (label === undefined) continue;
    const t =
      orderedCategoryLabels.length === 1
        ? 0
        : i / (orderedCategoryLabels.length - 1);
    categoryRankRadiusMap.set(label, rMin + t * (rMax - rMin));
  }

  return { categoryShapeMap, categoryRankRadiusMap };
}
