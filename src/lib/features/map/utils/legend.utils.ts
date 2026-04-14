import {
  PrimitiveFilterType,
  ScaleType,
  VisualizationType,
  type ClassificationConfig,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  ColorMode,
  DEFAULT_COLORS,
  DENSITY_DEFAULTS,
  FillMode,
  MissingDataShape,
  ShapeType,
  SymbolMode,
  ThicknessMode
} from '$lib/features/main-toolbar/constants';
import { getSizeForValue } from './data-styling.utils';

export type LegendSwatchPrimitive = 'area' | 'point' | 'line';

type LegendContinuousStep = {
  kind: 'continuous';
  value: number;
  size: number;
};

type LegendClassedStep = {
  kind: 'classes';
  index: number;
  size: number;
};

export type PointLegendStep = LegendContinuousStep | LegendClassedStep;
export type LineLegendStep = LegendContinuousStep | LegendClassedStep;

export type PointSizeLegendScale = {
  kind: 'proportional' | 'classes';
  steps: PointLegendStep[];
  fillColor: string;
  strokeColor: string;
  fillOpacity: number;
  shape: ShapeType;
};

export type DensityLegendScale = {
  kind: 'density';
  ratio: number;
  dotSize: number;
  fillColor: string;
};

export type LineWidthLegendScale = {
  kind: 'proportional' | 'classes';
  steps: LineLegendStep[];
  color: string;
  opacity: number;
  dashed: boolean;
};

type ColumnStatisticsLike = unknown;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
}

function resolveStyleColor(
  color: string | string[] | undefined,
  fallback: string
): string {
  if (Array.isArray(color)) {
    return typeof color[0] === 'string' ? color[0] : fallback;
  }

  return typeof color === 'string' ? color : fallback;
}

function normalizeOpacity(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  const normalized = resolved > 1 ? resolved / 100 : resolved;
  return Math.max(0, Math.min(1, normalized));
}

function resolveClassificationClassCount(
  classification: ClassificationConfig | undefined
): number {
  if (!classification) {
    return 0;
  }

  if (classification.numClasses && classification.numClasses > 0) {
    return classification.numClasses;
  }

  if (classification.labels?.length) {
    return classification.labels.length;
  }

  if (classification.colors?.length) {
    return classification.colors.length;
  }

  if (classification.breaks?.length) {
    return classification.breaks.length + 1;
  }

  return classification.classes ?? 0;
}

function hasLineLegendModes(viz: VisualizationConfig | undefined): boolean {
  return viz?.modes?.color !== undefined || viz?.modes?.thickness !== undefined;
}

function shouldUsePointSwatches(viz: VisualizationConfig | undefined): boolean {
  if (!viz || hasLineLegendModes(viz)) {
    return false;
  }

  if (
    viz.type === VisualizationType.PROPORTIONAL ||
    viz.type === VisualizationType.BIVARIATE
  ) {
    return true;
  }

  const primitiveFilters = viz.primitiveFilters ?? [];
  const hasPointPrimitive = primitiveFilters.includes(
    PrimitiveFilterType.POINT
  );
  const hasPolygonPrimitive = primitiveFilters.includes(
    PrimitiveFilterType.POLYGON
  );

  if (hasPointPrimitive && !hasPolygonPrimitive) {
    return true;
  }

  return (
    viz.modes?.symbol === SymbolMode.PROPORTIONAL ||
    viz.modes?.symbol === SymbolMode.CLASSES ||
    viz.modes?.symbol === SymbolMode.CATEGORIES
  );
}

function getStatisticsValue(
  statistics: ColumnStatisticsLike,
  key: 'min' | 'max'
): unknown {
  if (!statistics || typeof statistics !== 'object' || !(key in statistics)) {
    return null;
  }

  return (statistics as Record<'min' | 'max', unknown>)[key];
}

function buildContinuousLegendSteps(
  minValue: number,
  maxValue: number,
  minSize: number,
  maxSize: number,
  scale: ScaleType
): LegendContinuousStep[] {
  const minLegendSize = getSizeForValue(
    minValue,
    minValue,
    maxValue,
    minSize,
    maxSize,
    scale
  );
  const maxLegendSize = getSizeForValue(
    maxValue,
    minValue,
    maxValue,
    minSize,
    maxSize,
    scale
  );

  if (minValue === maxValue) {
    return [
      {
        kind: 'continuous',
        value: maxValue,
        size: maxLegendSize
      }
    ];
  }

  const midValue = minValue + (maxValue - minValue) / 2;
  const midLegendSize = getSizeForValue(
    midValue,
    minValue,
    maxValue,
    minSize,
    maxSize,
    scale
  );

  return [
    {
      kind: 'continuous',
      value: maxValue,
      size: maxLegendSize
    },
    {
      kind: 'continuous',
      value: midValue,
      size: midLegendSize
    },
    {
      kind: 'continuous',
      value: minValue,
      size: minLegendSize
    }
  ];
}

function buildClassedLegendSteps(
  classCount: number,
  minSize: number,
  maxSize: number
): LegendClassedStep[] {
  if (classCount <= 0) {
    return [];
  }

  if (classCount === 1) {
    return [
      {
        kind: 'classes',
        index: 0,
        size: maxSize
      }
    ];
  }

  return Array.from({ length: classCount }, (_, index) => ({
    kind: 'classes' as const,
    index,
    size: minSize + ((maxSize - minSize) * index) / (classCount - 1)
  })).reverse();
}

export function resolveMissingDataPointShape(
  shape: MissingDataShape | undefined
): ShapeType {
  switch (shape) {
    case MissingDataShape.SQUARE:
      return ShapeType.SQUARE;
    case MissingDataShape.CROSS:
      return ShapeType.CROSS;
    case MissingDataShape.CIRCLE:
    default:
      return ShapeType.CIRCLE;
  }
}

export function resolveLegendColorSwatchPrimitive(
  viz: VisualizationConfig | undefined
): LegendSwatchPrimitive {
  if (hasLineLegendModes(viz)) {
    return 'line';
  }

  return shouldUsePointSwatches(viz) ? 'point' : 'area';
}

export function resolveMissingDataLegendPrimitive(
  viz: VisualizationConfig | undefined
): LegendSwatchPrimitive {
  if (hasLineLegendModes(viz)) {
    return 'point';
  }

  return shouldUsePointSwatches(viz) ? 'point' : 'area';
}

export function hasClassedColorLegend(
  viz: VisualizationConfig | undefined
): boolean {
  if (
    viz?.modes?.color === ColorMode.CLASSES &&
    !!viz.mapping.valueColumn &&
    !!viz.classification?.colors?.length &&
    !!viz.classification?.breaks?.length
  ) {
    return true;
  }

  return (
    viz?.modes?.fill === FillMode.CLASSES &&
    !!viz.mapping.valueColumn &&
    !!viz.classification?.colors?.length &&
    !!viz.classification?.breaks?.length
  );
}

export function hasCategoricalColorLegend(
  viz: VisualizationConfig | undefined
): boolean {
  if (
    viz?.modes?.color === ColorMode.CATEGORIES &&
    !!viz.mapping.categoryColumn &&
    !!viz.classification?.colors?.length
  ) {
    return true;
  }

  return (
    viz?.modes?.fill === FillMode.CATEGORIES &&
    !!viz.mapping.categoryColumn &&
    !!viz.classification?.colors?.length
  );
}

export function getDensityLegendScale(
  viz: VisualizationConfig | undefined
): DensityLegendScale | null {
  if (viz?.modes?.symbol !== SymbolMode.DENSITY) return null;
  const density = viz.density;
  if (!density?.ratio) return null;
  const dotSize = Math.max(0.1, density.dotSize ?? DENSITY_DEFAULTS.dotSize);
  const fillColor = resolveStyleColor(density.color, DENSITY_DEFAULTS.color);
  return {
    kind: 'density',
    ratio: density.ratio,
    dotSize,
    fillColor
  };
}

export function getPointSizeLegendScale(
  viz: VisualizationConfig | undefined,
  statistics?: ColumnStatisticsLike
): PointSizeLegendScale | null {
  if (!viz?.symbols) {
    return null;
  }

  const minSize = Math.max(1, viz.symbols.minSize ?? 1);
  const maxSize = Math.max(minSize, viz.symbols.maxSize ?? minSize);
  const fillOpacity = Math.max(0.2, normalizeOpacity(viz.style.fillOpacity, 1));

  if (
    viz.modes?.symbol === SymbolMode.PROPORTIONAL &&
    !!viz.mapping.sizeColumn
  ) {
    const minValue = toFiniteNumber(getStatisticsValue(statistics, 'min'));
    const maxValue = toFiniteNumber(getStatisticsValue(statistics, 'max'));

    if (minValue === null || maxValue === null) {
      return null;
    }

    return {
      kind: 'proportional',
      steps: buildContinuousLegendSteps(
        minValue,
        maxValue,
        minSize,
        maxSize,
        viz.symbols.sizeScale ?? ScaleType.LINEAR
      ),
      fillColor: resolveStyleColor(viz.style.fillColor, DEFAULT_COLORS.fill),
      strokeColor: resolveStyleColor(
        viz.style.strokeColor,
        DEFAULT_COLORS.stroke
      ),
      fillOpacity,
      shape: viz.symbols.type ?? ShapeType.CIRCLE
    };
  }

  if (
    viz.modes?.symbol === SymbolMode.CLASSES &&
    !!viz.mapping.valueColumn &&
    !!viz.classification?.breaks?.length
  ) {
    const classCount = resolveClassificationClassCount(viz.classification);
    if (classCount === 0) {
      return null;
    }

    return {
      kind: 'classes',
      steps: buildClassedLegendSteps(classCount, minSize, maxSize),
      fillColor: resolveStyleColor(viz.style.fillColor, DEFAULT_COLORS.fill),
      strokeColor: resolveStyleColor(
        viz.style.strokeColor,
        DEFAULT_COLORS.stroke
      ),
      fillOpacity,
      shape: viz.symbols.type ?? ShapeType.CIRCLE
    };
  }

  return null;
}

export function getLineWidthLegendScale(
  viz: VisualizationConfig | undefined,
  statistics?: ColumnStatisticsLike
): LineWidthLegendScale | null {
  if (!viz) {
    return null;
  }

  const maxLineWidth = Math.max(1, viz.style.lineMaxWidth ?? 1);
  const opacity = Math.max(0.2, normalizeOpacity(viz.style.lineOpacity, 1));

  if (
    viz.modes?.thickness === ThicknessMode.PROPORTIONAL &&
    !!viz.mapping.sizeColumn
  ) {
    const minValue = toFiniteNumber(getStatisticsValue(statistics, 'min'));
    const maxValue = toFiniteNumber(getStatisticsValue(statistics, 'max'));

    if (minValue === null || maxValue === null) {
      return null;
    }

    return {
      kind: 'proportional',
      steps: buildContinuousLegendSteps(
        minValue,
        maxValue,
        1,
        maxLineWidth,
        viz.symbols?.sizeScale ?? ScaleType.LINEAR
      ),
      color: resolveStyleColor(viz.style.lineColor, DEFAULT_COLORS.line),
      opacity,
      dashed: viz.style.lineDashed ?? false
    };
  }

  if (
    viz.modes?.thickness === ThicknessMode.CLASSES &&
    !!viz.mapping.valueColumn &&
    !!viz.classification?.breaks?.length
  ) {
    const classCount = resolveClassificationClassCount(viz.classification);
    if (classCount === 0) {
      return null;
    }

    return {
      kind: 'classes',
      steps: buildClassedLegendSteps(classCount, 1, maxLineWidth),
      color: resolveStyleColor(viz.style.lineColor, DEFAULT_COLORS.line),
      opacity,
      dashed: viz.style.lineDashed ?? false
    };
  }

  return null;
}
