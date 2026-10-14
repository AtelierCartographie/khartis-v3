import {
  getEnabledPrimitiveFilters,
  getLinePrimitive,
  getLineThicknessClassification,
  getPolygonPrimitive,
  getPrimitiveCategoryColumn,
  getPrimitiveClassification,
  getPrimitiveValueColumn,
  getSymbolFillCategoryColumn,
  getSymbolFillClassification,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  PrimitiveFilterType,
  ScaleType,
  VisualizationType,
  type ClassificationConfig,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  ColorMode,
  DEFAULT_COLORS,
  DENSITY_DEFAULTS,
  FillMode,
  isLinearShape,
  MissingDataShape,
  ProportionalType,
  ShapeType,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  getAbsoluteDomainMax,
  getProportionalLineWidthForValue,
  getProportionalSymbolSizeForValue
} from './data-styling.utils';
import { toFiniteNumber } from './finite-number.utils';
import { ticks as d3_ticks } from 'd3-array';
import {
  round,
  round_extreme
} from '$lib/features/commons/components/legend/utils';
import { NEUTRAL_CARTOGRAPHY_COLORS } from '$lib/features/commons/constants/colors.constants';

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
  secondary?: {
    fillColor: string;
    valueColumn: string;
    breakValue: number | null;
  };
  commonScale?: boolean;
  positionMode?: 'overlay' | 'juxtaposition' | 'division';
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

function resolveStyleColor(
  color: string | string[] | undefined,
  fallback: string
): string {
  if (Array.isArray(color)) {
    return typeof color[0] === 'string' ? color[0] : fallback;
  }

  return typeof color === 'string' ? color : fallback;
}

// A size legend whose color is carried by classes or categories shows the
// sizes alone: a neutral mark, so it does not read as one of those colors.
function resolveSymbolFillColor(viz: VisualizationConfig): string {
  const symbol = getSymbolPrimitive(viz);
  if (
    symbol?.fillMode === FillMode.CLASSES ||
    symbol?.fillMode === FillMode.CATEGORIES
  ) {
    return NEUTRAL_CARTOGRAPHY_COLORS.dataFill;
  }

  const symbolFill = symbol?.fillColor;
  if (symbolFill) {
    return resolveStyleColor(symbolFill, DEFAULT_COLORS.fill);
  }

  const line = getLinePrimitive(viz);
  if (line?.enabled) {
    return resolveStyleColor(line.color, DEFAULT_COLORS.fill);
  }

  return DEFAULT_COLORS.fill;
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

  if (classification.breaks?.length) {
    return classification.breaks.length + 1;
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

  return classification.classes ?? 0;
}

function hasLineLegendModes(viz: VisualizationConfig | undefined): boolean {
  const line = getLinePrimitive(viz);
  return Boolean(
    line?.enabled &&
    (line.colorMode !== ColorMode.UNIQUE ||
      line.thicknessMode !== ThicknessMode.UNIQUE)
  );
}

function shouldUsePointSwatches(viz: VisualizationConfig | undefined): boolean {
  if (!viz || hasLineLegendModes(viz)) {
    return false;
  }

  const symbol = getSymbolPrimitive(viz);
  const enabledFilters = getEnabledPrimitiveFilters(viz);
  const hasPointPrimitive = enabledFilters.includes(PrimitiveFilterType.POINT);
  const hasPolygonPrimitive = enabledFilters.includes(
    PrimitiveFilterType.POLYGON
  );

  if (
    (viz.type === VisualizationType.PROPORTIONAL ||
      viz.type === VisualizationType.BIVARIATE) &&
    symbol?.enabled &&
    hasPointPrimitive
  ) {
    return true;
  }

  if (hasPointPrimitive && !hasPolygonPrimitive) {
    return true;
  }

  return Boolean(
    symbol?.enabled &&
    (symbol.mode === SymbolMode.PROPORTIONAL ||
      symbol?.mode === SymbolMode.CLASSES ||
      symbol?.mode === SymbolMode.CATEGORIES ||
      symbol?.fillMode === FillMode.CLASSES ||
      symbol?.fillMode === FillMode.CATEGORIES)
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

// The widest line is labelled with its value rounded as far as the data
// allows, the way the symbol legend rounds its extremes; the thinner ones take
// round values below it.
export function getProportionalLineLegendValues(
  maxValue: number,
  valueSample: number[] = []
): number[] {
  if (!(maxValue > 0)) {
    return [0];
  }

  const sortedSample = valueSample
    .map(Math.abs)
    .filter((value) => Number.isFinite(value) && value <= maxValue)
    .sort((a, b) => a - b);
  const roundedMax =
    sortedSample.length > 1
      ? round_extreme(sortedSample, maxValue, 'max')
      : round(maxValue, 2);
  const lower = d3_ticks(0, roundedMax, 3)
    .filter((value) => value > 0 && value < roundedMax * 0.9)
    .slice(-2);

  return [roundedMax, ...lower.reverse()];
}

function buildProportionalLineLegendSteps(
  maxValue: number,
  maxWidth: number,
  valueSample?: number[]
): LegendContinuousStep[] {
  return getProportionalLineLegendValues(maxValue, valueSample).map(
    (value) => ({
      kind: 'continuous',
      value,
      size:
        maxValue > 0
          ? getProportionalLineWidthForValue(value, maxValue, maxWidth)
          : 0
    })
  );
}

function buildProportionalSymbolLegendSteps(
  maxValue: number,
  maxSize: number,
  scale: ScaleType
): LegendContinuousStep[] {
  if (maxValue <= 0) {
    return [
      {
        kind: 'continuous',
        value: 0,
        size: 0
      }
    ];
  }

  const maxLegendSize = getProportionalSymbolSizeForValue(
    maxValue,
    maxValue,
    maxSize,
    scale
  );

  const minValue = 0;
  const midValue = maxValue / 2;

  return [
    {
      kind: 'continuous',
      value: maxValue,
      size: maxLegendSize
    },
    {
      kind: 'continuous',
      value: midValue,
      size: getProportionalSymbolSizeForValue(
        midValue,
        maxValue,
        maxSize,
        scale
      )
    },
    {
      kind: 'continuous',
      value: minValue,
      size: getProportionalSymbolSizeForValue(
        minValue,
        maxValue,
        maxSize,
        scale
      )
    }
  ];
}

function resolveProportionalSymbolScale(shape: ShapeType): ScaleType {
  return isLinearShape(shape) ? ScaleType.LINEAR : ScaleType.SQRT;
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

/** Primitives whose color is classed, each one with its own legend block. */
export function getClassedColorLegendPrimitives(
  viz: VisualizationConfig | undefined
): LegendSwatchPrimitive[] {
  const symbol = getSymbolPrimitive(viz);
  const line = getLinePrimitive(viz);
  const polygon = getPolygonPrimitive(viz);
  const pointClassification = viz && getSymbolFillClassification(viz);
  const lineClassification =
    viz && getPrimitiveClassification(viz, PrimitiveFilterType.LINE);
  const polygonClassification =
    viz && getPrimitiveClassification(viz, PrimitiveFilterType.POLYGON);
  const primitives: LegendSwatchPrimitive[] = [];

  if (
    symbol?.enabled &&
    symbol.fillMode === FillMode.CLASSES &&
    !!getSymbolFillValueColumn(viz) &&
    !!pointClassification?.colors?.length &&
    !!pointClassification?.breaks?.length
  ) {
    primitives.push('point');
  }

  if (
    line?.enabled &&
    line.colorMode === ColorMode.CLASSES &&
    !!getPrimitiveValueColumn(viz, PrimitiveFilterType.LINE) &&
    !!lineClassification?.colors?.length &&
    !!lineClassification?.breaks?.length
  ) {
    primitives.push('line');
  }

  if (
    polygon?.enabled &&
    polygon.fillMode === FillMode.CLASSES &&
    !!getPrimitiveValueColumn(viz, PrimitiveFilterType.POLYGON) &&
    !!polygonClassification?.colors?.length &&
    !!polygonClassification?.breaks?.length
  ) {
    primitives.push('area');
  }

  return primitives;
}

/** Primitives whose color follows categories, each one with its own legend block. */
export function getCategoricalColorLegendPrimitives(
  viz: VisualizationConfig | undefined
): LegendSwatchPrimitive[] {
  const symbol = getSymbolPrimitive(viz);
  const line = getLinePrimitive(viz);
  const polygon = getPolygonPrimitive(viz);
  const pointClassification =
    viz && symbol?.mode === SymbolMode.CATEGORIES
      ? getPrimitiveClassification(viz, PrimitiveFilterType.POINT)
      : getSymbolFillClassification(viz);
  const pointCategoryColumn =
    symbol?.mode === SymbolMode.CATEGORIES
      ? getPrimitiveCategoryColumn(viz, PrimitiveFilterType.POINT)
      : getSymbolFillCategoryColumn(viz);
  const lineClassification =
    viz && getPrimitiveClassification(viz, PrimitiveFilterType.LINE);
  const polygonClassification =
    viz && getPrimitiveClassification(viz, PrimitiveFilterType.POLYGON);
  const primitives: LegendSwatchPrimitive[] = [];

  if (
    symbol?.enabled &&
    (symbol.mode === SymbolMode.CATEGORIES ||
      symbol.fillMode === FillMode.CATEGORIES) &&
    !!pointCategoryColumn &&
    !!pointClassification?.colors?.length
  ) {
    primitives.push('point');
  }

  if (
    line?.enabled &&
    line.colorMode === ColorMode.CATEGORIES &&
    !!getPrimitiveCategoryColumn(viz, PrimitiveFilterType.LINE) &&
    !!lineClassification?.colors?.length
  ) {
    primitives.push('line');
  }

  if (
    polygon?.enabled &&
    polygon.fillMode === FillMode.CATEGORIES &&
    !!getPrimitiveCategoryColumn(viz, PrimitiveFilterType.POLYGON) &&
    !!polygonClassification?.colors?.length
  ) {
    primitives.push('area');
  }

  return primitives;
}

export function getDensityLegendScale(
  viz: VisualizationConfig | undefined
): DensityLegendScale | null {
  if (!viz || getPolygonPrimitive(viz)?.fillMode !== FillMode.DENSITY)
    return null;
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
  const symbol = getSymbolPrimitive(viz);
  const classification =
    viz && getPrimitiveClassification(viz, PrimitiveFilterType.POINT);

  if (!viz || !symbol?.enabled) {
    return null;
  }

  const minSize = Math.max(1, symbol.minSize ?? 1);
  const maxSize = Math.max(minSize, symbol.maxSize ?? minSize);
  const proportionalMaxSize = Math.max(0, symbol.maxSize ?? maxSize);
  const fillOpacity = normalizeOpacity(symbol.opacity, 1);

  if (symbol.mode === SymbolMode.PROPORTIONAL && !!symbol.sizeColumn) {
    const minValue = toFiniteNumber(getStatisticsValue(statistics, 'min'));
    const maxValue = toFiniteNumber(getStatisticsValue(statistics, 'max'));

    if (minValue === null || maxValue === null) {
      return null;
    }

    const proportionalDomainMax = getAbsoluteDomainMax(minValue, maxValue);
    const isDouble =
      symbol.proportionalType === ProportionalType.DOUBLE &&
      !!symbol.valueColumn;
    const secondary = isDouble
      ? {
          fillColor: resolveStyleColor(
            symbol.fillColorB,
            DEFAULT_COLORS.secondary
          ),
          valueColumn: symbol.valueColumn as string,
          breakValue: symbol.breakValueB ?? null
        }
      : undefined;

    return {
      kind: 'proportional',
      steps: buildProportionalSymbolLegendSteps(
        proportionalDomainMax,
        proportionalMaxSize,
        resolveProportionalSymbolScale(symbol.shape ?? ShapeType.CIRCLE)
      ),
      fillColor: resolveSymbolFillColor(viz),
      strokeColor: resolveStyleColor(symbol.strokeColor, DEFAULT_COLORS.stroke),
      fillOpacity,
      shape: symbol.shape ?? ShapeType.CIRCLE,
      ...(isDouble
        ? {
            secondary,
            commonScale: symbol.commonScale !== false,
            positionMode: symbol.positionMode ?? 'overlay'
          }
        : {})
    };
  }

  if (
    symbol.mode === SymbolMode.CLASSES &&
    !!symbol.valueColumn &&
    !!classification?.breaks?.length
  ) {
    const classCount = resolveClassificationClassCount(classification);
    if (classCount === 0) {
      return null;
    }

    return {
      kind: 'classes',
      steps: buildClassedLegendSteps(classCount, minSize, maxSize),
      fillColor: resolveSymbolFillColor(viz),
      strokeColor: resolveStyleColor(symbol.strokeColor, DEFAULT_COLORS.stroke),
      fillOpacity,
      shape: symbol.shape ?? ShapeType.CIRCLE
    };
  }

  return null;
}

export function getLineWidthLegendScale(
  viz: VisualizationConfig | undefined,
  statistics?: ColumnStatisticsLike,
  valueSample?: number[]
): LineWidthLegendScale | null {
  const line = getLinePrimitive(viz);
  const classification = viz && getLineThicknessClassification(viz);

  if (!line?.enabled) {
    return null;
  }

  const maxLineWidth = Math.max(1, line.maxWidth ?? 1);
  const color =
    line.colorMode === ColorMode.CLASSES ||
    line.colorMode === ColorMode.CATEGORIES
      ? NEUTRAL_CARTOGRAPHY_COLORS.dataStroke
      : resolveStyleColor(line.color, DEFAULT_COLORS.line);
  const opacity = normalizeOpacity(line.opacity, 1);

  if (line.thicknessMode === ThicknessMode.PROPORTIONAL && !!line.sizeColumn) {
    const minValue = toFiniteNumber(getStatisticsValue(statistics, 'min'));
    const maxValue = toFiniteNumber(getStatisticsValue(statistics, 'max'));

    if (minValue === null || maxValue === null) {
      return null;
    }

    const proportionalDomainMax = getAbsoluteDomainMax(minValue, maxValue);

    return {
      kind: 'proportional',
      steps: buildProportionalLineLegendSteps(
        proportionalDomainMax,
        maxLineWidth,
        valueSample
      ),
      color,
      opacity,
      dashed: line.dashed ?? false
    };
  }

  if (
    line.thicknessMode === ThicknessMode.CLASSES &&
    !!line.valueColumn &&
    !!classification?.breaks?.length
  ) {
    const classCount = resolveClassificationClassCount(classification);
    if (classCount === 0) {
      return null;
    }

    return {
      kind: 'classes',
      steps: buildClassedLegendSteps(classCount, 1, maxLineWidth),
      color,
      opacity,
      dashed: line.dashed ?? false
    };
  }

  return null;
}
