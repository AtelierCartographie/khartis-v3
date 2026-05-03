import {
  PrimitiveFilterType,
  getLinePrimitive,
  getLineThicknessClassification,
  getPrimitiveCategoryColumn,
  getPrimitiveClassification,
  getPrimitiveValueColumn,
  getSymbolFillCategoryColumn,
  getSymbolFillClassification,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  getTextPrimitive,
  type ClassificationConfig,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { ColorMode, FillMode, StrokeMode } from '../../constants';
import {
  CLASSIFIABLE_PRIMITIVES,
  STROKE_CLASSIFIABLE_PRIMITIVES,
  type ClassifiablePrimitive,
  type StrokeClassifiablePrimitive
} from '../hooks/use-primitive-panel-controller.svelte';

export interface ClassificationTarget {
  primitive: ClassifiablePrimitive;
  valueColumn: string | undefined;
  categoryColumn: string | undefined;
  classification: ClassificationConfig | undefined;
  usesBreaks: boolean;
  usesCategories: boolean;
}

export interface StrokeClassificationTarget {
  primitive: StrokeClassifiablePrimitive;
  valueColumn: string | undefined;
  categoryColumn: string | undefined;
  classification: ClassificationConfig | undefined;
  usesBreaks: boolean;
  usesCategories: boolean;
}

export interface LineThicknessTarget {
  valueColumn: string | undefined;
  classification: ClassificationConfig | undefined;
  usesBreaks: boolean;
}

export interface SymbolFillTarget {
  fillMode: FillMode | undefined;
  valueColumn: string | undefined;
  categoryColumn: string | undefined;
  classification: ClassificationConfig | undefined;
  usesBreaks: boolean;
  usesCategories: boolean;
}

export interface TextBackgroundTarget {
  fillMode: FillMode | undefined;
  valueColumn: string | undefined;
  categoryColumn: string | undefined;
  classification: ClassificationConfig | undefined;
  usesBreaks: boolean;
  usesCategories: boolean;
}

export interface TextBackgroundStrokeTarget {
  valueColumn: string | undefined;
  categoryColumn: string | undefined;
  classification: ClassificationConfig | undefined;
  usesBreaks: boolean;
  usesCategories: boolean;
}

export interface ClassificationTargetBuilders {
  usesBreakClassification: (
    viz: VisualizationConfig | undefined,
    primitive: ClassifiablePrimitive
  ) => boolean;
  usesCategoricalClassification: (
    viz: VisualizationConfig | undefined,
    primitive: ClassifiablePrimitive
  ) => boolean;
  usesLineThicknessBreakClassification: (
    viz: VisualizationConfig | undefined
  ) => boolean;
  getPrimitiveStrokeValueColumn: (
    viz: VisualizationConfig | undefined,
    primitive: StrokeClassifiablePrimitive
  ) => string | undefined;
  getPrimitiveStrokeCategoryColumn: (
    viz: VisualizationConfig | undefined,
    primitive: StrokeClassifiablePrimitive
  ) => string | undefined;
  getPrimitiveStrokeClassification: (
    viz: VisualizationConfig | undefined,
    primitive: StrokeClassifiablePrimitive
  ) => ClassificationConfig | undefined;
  usesStrokeBreakClassification: (
    viz: VisualizationConfig | undefined,
    primitive: StrokeClassifiablePrimitive
  ) => boolean;
  usesStrokeCategoricalClassification: (
    viz: VisualizationConfig | undefined,
    primitive: StrokeClassifiablePrimitive
  ) => boolean;
  usesSymbolFillBreakClassification: (
    viz: VisualizationConfig | undefined
  ) => boolean;
  usesSymbolFillCategoricalClassification: (
    viz: VisualizationConfig | undefined
  ) => boolean;
}

export function buildPrimitiveClassificationTargets(
  viz: VisualizationConfig | undefined,
  builders: Pick<
    ClassificationTargetBuilders,
    'usesBreakClassification' | 'usesCategoricalClassification'
  >
): ClassificationTarget[] {
  return CLASSIFIABLE_PRIMITIVES.map((primitive) => ({
    primitive,
    valueColumn: getPrimitiveValueColumn(viz, primitive),
    categoryColumn: getPrimitiveCategoryColumn(viz, primitive),
    classification: getPrimitiveClassification(viz, primitive),
    usesBreaks:
      primitive === PrimitiveFilterType.LINE
        ? getLinePrimitive(viz)?.colorMode === ColorMode.CLASSES
        : builders.usesBreakClassification(viz, primitive),
    usesCategories: builders.usesCategoricalClassification(viz, primitive)
  }));
}

export function buildLineThicknessTarget(
  viz: VisualizationConfig | undefined,
  builders: Pick<
    ClassificationTargetBuilders,
    'usesLineThicknessBreakClassification'
  >
): LineThicknessTarget | null {
  const line = getLinePrimitive(viz);
  if (!line) {
    return null;
  }

  return {
    valueColumn: line.valueColumn,
    classification: getLineThicknessClassification(viz),
    usesBreaks: builders.usesLineThicknessBreakClassification(viz)
  };
}

export function buildPrimitiveStrokeClassificationTargets(
  viz: VisualizationConfig | undefined,
  builders: Pick<
    ClassificationTargetBuilders,
    | 'getPrimitiveStrokeValueColumn'
    | 'getPrimitiveStrokeCategoryColumn'
    | 'getPrimitiveStrokeClassification'
    | 'usesStrokeBreakClassification'
    | 'usesStrokeCategoricalClassification'
  >
): StrokeClassificationTarget[] {
  return STROKE_CLASSIFIABLE_PRIMITIVES.map((primitive) => ({
    primitive,
    valueColumn: builders.getPrimitiveStrokeValueColumn(viz, primitive),
    categoryColumn: builders.getPrimitiveStrokeCategoryColumn(viz, primitive),
    classification: builders.getPrimitiveStrokeClassification(viz, primitive),
    usesBreaks: builders.usesStrokeBreakClassification(viz, primitive),
    usesCategories: builders.usesStrokeCategoricalClassification(viz, primitive)
  }));
}

export function buildSymbolFillTarget(
  viz: VisualizationConfig | undefined,
  builders: Pick<
    ClassificationTargetBuilders,
    | 'usesSymbolFillBreakClassification'
    | 'usesSymbolFillCategoricalClassification'
  >
): SymbolFillTarget | null {
  const symbol = getSymbolPrimitive(viz);
  if (!symbol) return null;
  return {
    fillMode: symbol.fillMode,
    valueColumn: getSymbolFillValueColumn(viz),
    categoryColumn: getSymbolFillCategoryColumn(viz),
    classification: getSymbolFillClassification(viz),
    usesBreaks: builders.usesSymbolFillBreakClassification(viz),
    usesCategories: builders.usesSymbolFillCategoricalClassification(viz)
  };
}

export function buildTextBackgroundTarget(
  viz: VisualizationConfig | undefined
): TextBackgroundTarget | null {
  const text = getTextPrimitive(viz);
  if (!text) return null;
  const bg = text.background;
  return {
    fillMode: bg.fillMode,
    valueColumn: bg.valueColumn,
    categoryColumn: bg.categoryColumn,
    classification: bg.classification,
    usesBreaks: bg.fillMode === FillMode.CLASSES,
    usesCategories: bg.fillMode === FillMode.CATEGORIES
  };
}

export function buildTextBackgroundStrokeTarget(
  viz: VisualizationConfig | undefined
): TextBackgroundStrokeTarget | null {
  const text = getTextPrimitive(viz);
  if (!text) return null;
  const bg = text.background;
  return {
    valueColumn: bg.strokeValueColumn,
    categoryColumn: bg.strokeCategoryColumn,
    classification: bg.strokeClassification,
    usesBreaks: bg.strokeMode === StrokeMode.CLASSES,
    usesCategories: bg.strokeMode === StrokeMode.CATEGORIES
  };
}
