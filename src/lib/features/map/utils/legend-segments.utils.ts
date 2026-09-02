import { motif } from '@ateliercartographie/motif.js';
import type { PatternType as MotifPatternType } from '@ateliercartographie/motif.js';
import {
  getPatternOverlayColorHex,
  isValidPatternId,
  resolveMotifOptions,
  stripSvgDefsWrapper
} from '../layers/pattern-texture';
import {
  resolveClassPatternPalette,
  resolveMissingDataClassPattern
} from '../layers/polygon-pattern-layer.utils';
import type { PatternParams } from '$lib/features/commons/constants/pattern.constants';
import type { ClassPattern } from '$lib/features/commons/services/pattern-palette.service';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import {
  getLinePrimitive,
  getLineThicknessClassification,
  getPolygonPrimitive,
  getPrimitiveClassification,
  getPrimitiveCategoryColumn,
  getPrimitiveValueColumn,
  getSymbolFillCategoryColumn,
  getSymbolFillClassification,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  getTextPrimitive,
  PrimitiveFilterType,
  type ClassificationConfig,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import {
  CATEGORY_SHAPE_CYCLE,
  CategoryShapeMode,
  ColorMode,
  DEFAULT_COLORS,
  DEFAULT_LINEAR_SYMBOL_BAR_WIDTH,
  FillMode,
  ShapeType,
  SizeMode,
  SLIDER_LIMITS,
  StrokeMode,
  SymbolMode,
  VISUALIZATION_DEFAULTS
} from '$lib/features/commons/constants/visualization.constants';
import * as m from '$lib/paraglide/messages';
import {
  createLegendSvg,
  draw_categorical_legend,
  draw_khartis_density_legend,
  draw_khartis_line_width_legend,
  draw_khartis_swatch_legend,
  draw_quanti_color_legend,
  draw_symbols_legend,
  type CategoricalFooterShapeType,
  type CategoricalShapeType,
  type CategoryItem,
  type CommonLegendTextOptions,
  type KhartisLegendSwatchItem,
  type KhartisLegendSwatchType,
  type KhartisLineWidthLegendStep,
  type LegendPatternFill,
  type LegendSvgDefinition,
  type SymbolType
} from '$lib/features/commons/components/legend';
import {
  getLineWidthLegendScale,
  getPointSizeLegendScale,
  getDensityLegendScale,
  hasCategoricalColorLegend,
  hasClassedColorLegend,
  resolveLegendColorSwatchPrimitive,
  resolveMissingDataLegendPrimitive,
  resolveMissingDataPointShape,
  type LegendSwatchPrimitive,
  type LineWidthLegendScale,
  type PointSizeLegendScale
} from './legend.utils';
import type { LegendItem } from '$lib/features/step-toolbar/tools/legend';
import type { LegendSubtitlePrimitive } from '$lib/features/commons/utils/legend-subtitle.utils';

const legendPatternFillCache: Record<string, LegendPatternFill> = {};

function getLegendPatternFill(
  patternId: string,
  patternColor: string,
  patternParams?: PatternParams
): LegendPatternFill | null {
  if (!isValidPatternId(patternId)) return null;
  const cacheKey = JSON.stringify({
    patternId,
    patternColor,
    angle: patternParams?.angle,
    size: patternParams?.size,
    scale: patternParams?.scale
  });
  const cached = legendPatternFillCache[cacheKey];
  if (cached) return cached;

  const pattern = motif({
    ...resolveMotifOptions(patternId, patternParams),
    fill: patternColor
  });
  const fill: LegendPatternFill = {
    defs: stripSvgDefsWrapper(pattern.defs.outerHTML),
    fillUrl: pattern.url
  };
  legendPatternFillCache[cacheKey] = fill;
  return fill;
}

function getClassPatternLegendFill(pattern: ClassPattern): LegendPatternFill {
  const cacheKey = JSON.stringify(pattern);
  const cached = legendPatternFillCache[cacheKey];
  if (cached) return cached;

  const result = motif({
    type: pattern.type as MotifPatternType,
    angle: pattern.angle,
    scale: pattern.scale,
    size: pattern.size,
    fill: pattern.fill,
    background: 'transparent',
    patchSize: pattern.patchSize
  });
  const fill: LegendPatternFill = {
    defs: stripSvgDefsWrapper(result.defs.outerHTML),
    fillUrl: result.url
  };
  legendPatternFillCache[cacheKey] = fill;
  return fill;
}

export function getClassPatternLegendFills(
  patterns: ClassPattern[]
): LegendPatternFill[] {
  return patterns.map(getClassPatternLegendFill);
}

type LegendTextStyle = {
  fontFamily: string;
  fontSize: number;
};

type LegendCategoricalEntry = {
  key: string;
  label: string;
  color: string;
  originalIndex: number;
};

type LegendSegmentContext = {
  includeMissingDataFooter: boolean;
};

type LegendSegmentDraft = {
  key: string;
  className: string;
  primitive: LegendSubtitlePrimitive;
  consumesMissingData?: boolean;
  create: (
    options: CommonLegendTextOptions,
    context: LegendSegmentContext
  ) => LegendSvgDefinition | null;
};

export type LegendSegment = {
  key: string;
  className: string;
  svg: LegendSvgDefinition;
};

function getLegendCategoricalClassification(
  viz: VisualizationConfig | undefined
): ClassificationConfig | undefined {
  if (!viz) {
    return undefined;
  }

  const swatchPrimitive = resolveLegendColorSwatchPrimitive(viz);
  switch (swatchPrimitive) {
    case 'point': {
      const symbol = getSymbolPrimitive(viz);
      if (
        symbol?.enabled &&
        symbol.mode === SymbolMode.CATEGORIES &&
        getPrimitiveCategoryColumn(viz, PrimitiveFilterType.POINT)
      ) {
        return getPrimitiveClassification(viz, PrimitiveFilterType.POINT);
      }
      if (
        symbol?.enabled &&
        symbol.fillMode === FillMode.CATEGORIES &&
        getSymbolFillCategoryColumn(viz)
      ) {
        return getSymbolFillClassification(viz);
      }
      return undefined;
    }
    case 'line':
      return getPrimitiveClassification(viz, PrimitiveFilterType.LINE);
    case 'area':
    default:
      return (
        getPrimitiveClassification(viz, PrimitiveFilterType.POLYGON) ??
        viz.classification
      );
  }
}

function getLegendClassedColorClassification(
  viz: VisualizationConfig | undefined
): ClassificationConfig | undefined {
  if (!viz) {
    return undefined;
  }

  const swatchPrimitive = resolveLegendColorSwatchPrimitive(viz);
  switch (swatchPrimitive) {
    case 'point': {
      const symbol = getSymbolPrimitive(viz);
      if (
        symbol?.enabled &&
        symbol.fillMode === FillMode.CLASSES &&
        getSymbolFillValueColumn(viz) !== undefined
      ) {
        return getSymbolFillClassification(viz);
      }
      return undefined;
    }
    case 'line':
      return getPrimitiveClassification(viz, PrimitiveFilterType.LINE);
    case 'area':
    default:
      return (
        getPrimitiveClassification(viz, PrimitiveFilterType.POLYGON) ??
        viz.classification
      );
  }
}

function getLegendCategoricalEntries(
  viz: VisualizationConfig | undefined
): LegendCategoricalEntry[] {
  const classification = getLegendCategoricalClassification(viz);
  const colors = classification?.colors ?? [];
  if (colors.length === 0) {
    return [];
  }

  const labels = classification?.labels ?? [];
  const disabled = new Set(
    (classification?.disabledLabels ?? []).map((label) => String(label))
  );

  return colors
    .map((color, index) => {
      const label =
        labels[index] ?? m.palette_category_default_label({ index: index + 1 });

      return {
        key: `${label}-${index}`,
        label,
        color,
        originalIndex: index
      };
    })
    .filter((entry) => !disabled.has(entry.label));
}

function getLegendPointCategoryShape(
  viz: VisualizationConfig | undefined,
  categoryIndex: number
): ShapeType {
  const symbol = getSymbolPrimitive(viz);
  if (!symbol) {
    return ShapeType.CIRCLE;
  }

  if (
    symbol.mode === SymbolMode.CATEGORIES &&
    symbol.categoryShape === CategoryShapeMode.DIFFERENT
  ) {
    const classification =
      viz && getPrimitiveClassification(viz, PrimitiveFilterType.POINT);

    return (
      classification?.categoryShapes?.[categoryIndex] ??
      CATEGORY_SHAPE_CYCLE[categoryIndex % CATEGORY_SHAPE_CYCLE.length] ??
      symbol.shape ??
      ShapeType.CIRCLE
    );
  }

  return symbol.shape ?? ShapeType.CIRCLE;
}

function getLegendPointCategorySize(
  viz: VisualizationConfig | undefined,
  categoryIndex: number
): number {
  const symbol = getSymbolPrimitive(viz);
  if (!symbol) {
    return 8;
  }

  if (
    symbol.mode !== SymbolMode.CATEGORIES ||
    symbol.categoryShape !== CategoryShapeMode.ORDERED
  ) {
    return 8;
  }

  const classification =
    viz && getPrimitiveClassification(viz, PrimitiveFilterType.POINT);
  const total = Math.max(
    classification?.labels?.length ?? 0,
    classification?.colors?.length ?? 0
  );
  if (total <= 1) {
    return 8;
  }

  const minSize = Math.max(1, symbol.minSize ?? 1);
  const maxSize = Math.max(minSize, symbol.maxSize ?? minSize);
  const interpolatedSize =
    minSize + ((maxSize - minSize) * categoryIndex) / (total - 1);

  return Math.round(
    normalizeLegendValue(interpolatedSize, minSize, maxSize, 6, 14)
  );
}

function normalizeLegendValue(
  value: number,
  minValue: number,
  maxValue: number,
  minDisplay: number,
  maxDisplay: number
): number {
  if (maxValue <= minValue) {
    return (minDisplay + maxDisplay) / 2;
  }

  return (
    minDisplay +
    ((value - minValue) / (maxValue - minValue)) * (maxDisplay - minDisplay)
  );
}

function getPointLegendDisplaySize(
  scale: PointSizeLegendScale,
  size: number
): number {
  if (size <= 0) {
    return 0;
  }

  const sizes = scale.steps.map((step) => step.size);
  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);

  return normalizeLegendValue(size, minSize, maxSize, 4, 18);
}

function getUniquePointLegendDisplaySize(size: number | undefined): number {
  const clampedSize = Math.max(
    SLIDER_LIMITS.symbolSize.min,
    Math.min(
      SLIDER_LIMITS.symbolSize.max,
      size ?? VISUALIZATION_DEFAULTS.symbolSize
    )
  );

  return normalizeLegendValue(
    clampedSize,
    SLIDER_LIMITS.symbolSize.min,
    SLIDER_LIMITS.symbolSize.max,
    6,
    24
  );
}

function getLineLegendDisplayWidth(
  scale: LineWidthLegendScale,
  width: number
): number {
  const widths = scale.steps.map((step) => step.size);
  const minWidth = Math.min(...widths);
  const maxWidth = Math.max(...widths);

  return normalizeLegendValue(width, minWidth, maxWidth, 2, 8);
}

function getTextLegendSymbolPath(size = 7): string {
  const unit = (size * 2) / 7;
  const y0 = -unit * 7;
  return `M ${-size / 2} ${y0} h${unit * 5} v${unit} h${-unit * 2} v${unit * 6} h${-unit} v${-unit * 6} h${-unit * 2} v${-unit} Z`;
}

function getTextLegendStrokeWidth(
  haloWidth: number | undefined,
  haloEnabled: boolean | undefined
): number {
  if (!haloEnabled) {
    return 0;
  }

  return Math.max(0.5, Math.min(2, haloWidth ?? 1));
}

function toFiniteLegendNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .replace(/[\u00a0\u202f\s]/g, '')
      .replace(',', '.');
    const numberValue = Number(normalized);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  return null;
}

function getStatisticsNumber(
  statistics: unknown,
  key: 'min' | 'max'
): number | null {
  if (!statistics || typeof statistics !== 'object' || !(key in statistics)) {
    return null;
  }

  return toFiniteLegendNumber(
    (statistics as Record<'min' | 'max', unknown>)[key]
  );
}

function getNumericColumnValues(
  viz: VisualizationConfig | undefined,
  columnName: string | undefined
): number[] {
  const statistics = getColumnStatistics(viz, columnName);

  if (!viz?.datasetId || !columnName) {
    return getStatisticsSampleValues(statistics);
  }

  const fallbackValues = getStatisticsSampleValues(statistics);
  const values = datasetsStore
    .getColumnValues(viz.datasetId, columnName)
    .map(toFiniteLegendNumber)
    .filter((value): value is number => value !== null);

  return values.length > 0 ? values : fallbackValues;
}

function getStatisticsSampleValues(statistics: unknown): number[] {
  const minValue = getStatisticsNumber(statistics, 'min');
  const maxValue = getStatisticsNumber(statistics, 'max');

  if (minValue === null || maxValue === null) {
    return [];
  }

  if (minValue === maxValue) {
    return [maxValue];
  }

  return [minValue, minValue + (maxValue - minValue) / 2, maxValue];
}

function getColumnStatistics(
  viz: VisualizationConfig | undefined,
  columnName: string | undefined
) {
  if (!viz?.datasetId || !columnName) {
    return null;
  }

  return datasetsStore.getColumnStatistics(viz.datasetId, columnName);
}

function getLegendStepLabel(
  step:
    | NonNullable<PointSizeLegendScale['steps']>[number]
    | NonNullable<LineWidthLegendScale['steps']>[number],
  breaks: number[] | undefined,
  colorCount = 0
): string {
  if (step.kind === 'continuous') {
    return formatBreakValue(step.value);
  }

  return breaks ? getColorScaleLabel(breaks, colorCount, step.index) : '';
}

function formatBreakValue(value: number): string {
  return formatValue(value, { maxFractionDigits: 1 });
}

const MAX_LEGEND_BREAK_FRACTION_DIGITS = 6;

function getBreakFractionDigits(breaks: number[]): number {
  for (
    let fractionDigits = 1;
    fractionDigits <= MAX_LEGEND_BREAK_FRACTION_DIGITS;
    fractionDigits += 1
  ) {
    const labels = breaks.map((value) =>
      formatValue(value, { maxFractionDigits: fractionDigits })
    );

    if (new Set(labels).size === breaks.length) {
      return fractionDigits;
    }
  }

  return MAX_LEGEND_BREAK_FRACTION_DIGITS;
}

function getColorScaleLabel(
  breaks: number[],
  colorCount: number,
  index: number
): string {
  if (breaks.length === 0) {
    return '';
  }

  const fractionDigits = getBreakFractionDigits(breaks);
  const formatScaleBreak = (value: number) =>
    formatValue(value, { maxFractionDigits: fractionDigits });

  if (colorCount === breaks.length + 1) {
    const firstBreak = breaks[0];
    if (index === 0) {
      return firstBreak !== undefined
        ? `< ${formatScaleBreak(firstBreak)}`
        : '';
    }

    if (index < breaks.length) {
      const lowerBreak = breaks[index - 1];
      const upperBreak = breaks[index];
      return lowerBreak !== undefined && upperBreak !== undefined
        ? `${formatScaleBreak(lowerBreak)} – ${formatScaleBreak(upperBreak)}`
        : '';
    }

    const lastBreak = breaks[breaks.length - 1];
    return lastBreak !== undefined ? `≥ ${formatScaleBreak(lastBreak)}` : '';
  }

  if (colorCount === breaks.length) {
    if (index < breaks.length - 1) {
      const lowerBreak = breaks[index];
      const upperBreak = breaks[index + 1];
      return lowerBreak !== undefined && upperBreak !== undefined
        ? `${formatScaleBreak(lowerBreak)} – ${formatScaleBreak(upperBreak)}`
        : '';
    }

    const lastBreak = breaks[breaks.length - 1];
    return lastBreak !== undefined ? `≥ ${formatScaleBreak(lastBreak)}` : '';
  }

  const fallbackBreak =
    index < breaks.length ? breaks[index] : breaks[breaks.length - 1];
  return fallbackBreak !== undefined ? formatScaleBreak(fallbackBreak) : '';
}

function getEffectiveClassedColors(
  colors: string[],
  breaks: number[]
): string[] {
  if (breaks.length > 0 && colors.length > breaks.length + 1) {
    return colors.slice(0, breaks.length + 1);
  }

  return colors;
}

function getShapePath(shape: ShapeType): string {
  switch (shape) {
    case ShapeType.SQUARE:
      return 'M-6,-6H6V6H-6Z';
    case ShapeType.BAR:
      return 'M-2,-7H2V7H-2Z';
    case ShapeType.SPIKE:
      return 'M0,-8L6,7H-6Z';
    case ShapeType.CROSS:
      return 'M-3,-8H3V-3H8V3H3V8H-3V3H-8V-3H-3Z';
    case ShapeType.DIAMOND:
      return 'M0,-8L8,0L0,8L-8,0Z';
    case ShapeType.TRIANGLE:
      return 'M0,-8L8,7H-8Z';
    case ShapeType.STAR:
      return 'M0,-8L2,-2H8L3,2L5,8L0,4L-5,8L-3,2L-8,-2H-2Z';
    case ShapeType.RECTANGLE:
      return 'M-8,-4H8V4H-8Z';
    case ShapeType.CIRCLE:
    default:
      return 'M0,-7A7,7,0,1,1,0,7A7,7,0,1,1,0,-7';
  }
}

function getSymbolLegendType(shape: ShapeType): SymbolType | null {
  switch (shape) {
    case ShapeType.CIRCLE:
      return 'circle';
    case ShapeType.SQUARE:
      return 'square';
    case ShapeType.BAR:
      return 'bar';
    case ShapeType.SPIKE:
      return 'spike';
    default:
      return null;
  }
}

function getLegendSegmentDrafts(
  viz: VisualizationConfig | undefined
): LegendSegmentDraft[] {
  const drafts = [
    getDensityLegendDraft(viz),
    getClassedColorLegendDraft(viz),
    getCategoricalLegendDraft(viz),
    getTextColorLegendDraft(viz),
    getTextSizeLegendDraft(viz),
    getUniquePointSymbolLegendDraft(viz),
    ...getPointSizeLegendDrafts(viz),
    getLineWidthLegendDraft(viz)
  ].filter((draft): draft is LegendSegmentDraft => draft !== null);

  if (
    viz &&
    isLegendMissingDataShown(viz, resolveMissingDataLegendPrimitive(viz)) &&
    !drafts.some((draft) => draft.consumesMissingData)
  ) {
    const missingDataDraft = getMissingDataLegendDraft(viz);
    if (missingDataDraft) {
      drafts.push(missingDataDraft);
    }
  }

  return drafts;
}

export function getLegendSegments(
  item: LegendItem,
  viz: VisualizationConfig | undefined,
  legendTextStyle: LegendTextStyle
): LegendSegment[] {
  const drafts = getLegendSegmentDrafts(viz).filter(
    (draft) => !item.primitive || draft.primitive === item.primitive
  );

  const lastMissingDataDraftIndex = drafts.findLastIndex(
    (draft) => draft.consumesMissingData
  );

  return drafts
    .map((draft, index) => {
      const svg = draft.create(
        getLegendTextOptions(item, index, drafts.length, legendTextStyle),
        {
          includeMissingDataFooter: index === lastMissingDataDraftIndex
        }
      );

      return svg
        ? {
            key: draft.key,
            className: draft.className,
            svg
          }
        : null;
    })
    .filter((segment): segment is LegendSegment => segment !== null);
}

function getLegendTextOptions(
  item: LegendItem,
  index: number,
  count: number,
  legendTextStyle: LegendTextStyle
): CommonLegendTextOptions {
  return {
    fontFamily: legendTextStyle.fontFamily,
    fontSize: legendTextStyle.fontSize,
    title: index === 0 ? item.title : null,
    subtitle: index === 0 ? item.subtitle : null,
    note: index === count - 1 ? item.note : null
  };
}

function toLegendSvg(
  input: LegendSvgDefinition | string
): LegendSvgDefinition | null {
  const svg = typeof input === 'string' ? createLegendSvg(input) : input;
  return svg.width > 0 && svg.height > 0 ? svg : null;
}

function getClassedColorLegendDraft(
  viz: VisualizationConfig | undefined
): LegendSegmentDraft | null {
  if (!viz || !hasClassedColorLegend(viz)) {
    return null;
  }

  let primitive = resolveLegendColorSwatchPrimitive(viz);
  let classification = getLegendClassedColorClassification(viz);

  if (!classification?.colors?.length && primitive !== 'area') {
    const polygon = getPolygonPrimitive(viz);
    const polygonClassification = getPrimitiveClassification(
      viz,
      PrimitiveFilterType.POLYGON
    );
    if (
      polygon?.enabled &&
      polygon.fillMode === FillMode.CLASSES &&
      polygonClassification?.colors?.length
    ) {
      primitive = 'area';
      classification = polygonClassification;
    }
  }

  const colors = classification?.colors ?? [];

  if (!classification || colors.length === 0) {
    return null;
  }

  if (primitive === 'area') {
    const classPatternPalette = resolveClassPatternPalette(
      classification,
      FillMode.CLASSES
    );
    if (classPatternPalette) {
      return getQuantitativeColorLegendDraft(
        viz,
        classification,
        getClassPatternLegendFills(classPatternPalette)
      );
    }

    if (!classification.patternId) {
      return getQuantitativeColorLegendDraft(viz, classification);
    }
  }

  const items = getClassedColorLegendItems(viz, classification, primitive);
  if (items.length === 0) {
    return null;
  }

  const type = getSwatchType(
    primitive,
    primitive === 'area' && Boolean(classification.patternId)
  );
  return {
    key: 'classed-color',
    primitive,
    className:
      type === 'pattern' ? 'legend-svg--patterns' : 'legend-svg--categorical',
    consumesMissingData: isLegendMissingDataShown(viz, primitive),
    create: (options, context) =>
      toLegendSvg(
        draw_khartis_swatch_legend(items, {
          ...options,
          type,
          ...getMissingDataFooterOptions(
            viz,
            context.includeMissingDataFooter,
            primitive
          )
        })
      )
  };
}

function getTextColorLegendDraft(
  viz: VisualizationConfig | undefined
): LegendSegmentDraft | null {
  const text = getTextPrimitive(viz);
  const classification =
    viz && getPrimitiveClassification(viz, PrimitiveFilterType.TEXT);

  if (!viz || !text?.enabled || !classification?.colors?.length) {
    return null;
  }

  const stroke = text.halo ? (text.haloColor ?? DEFAULT_COLORS.halo) : 'none';
  const strokeWidth = getTextLegendStrokeWidth(text.haloWidth, text.halo);
  const symbol = getTextLegendSymbolPath();
  const missingData = text.missingData;

  if (
    text.colorMode === ColorMode.CATEGORIES &&
    getPrimitiveCategoryColumn(viz, PrimitiveFilterType.TEXT)
  ) {
    const disabled = new Set(
      (classification.disabledLabels ?? []).map((label) => String(label))
    );
    const allCategories: CategoryItem[] = (classification.colors ?? [])
      .map((color, index) => {
        const label =
          classification.labels?.[index] ??
          m.palette_category_default_label({ index: index + 1 });

        return {
          label,
          fill: color,
          stroke,
          strokeWidth,
          symbol,
          size: 9,
          opacity: text.opacity
        };
      })
      .filter((entry) => !disabled.has(entry.label));
    const categories = allCategories;

    if (categories.length === 0) {
      return null;
    }

    return {
      key: 'text-categorical-color',
      primitive: 'text',
      className: 'legend-svg--text-color',
      consumesMissingData: Boolean(missingData?.show),
      create: (options, context) =>
        toLegendSvg(
          draw_categorical_legend(categories, {
            ...options,
            type: 'symbol',
            ...getTextCategoricalMissingDataFooterOptions(
              text,
              context.includeMissingDataFooter
            )
          })
        )
    };
  }

  if (
    text.colorMode === ColorMode.CLASSES &&
    getPrimitiveValueColumn(viz, PrimitiveFilterType.TEXT)
  ) {
    const breaks = (classification.breaks ?? []).filter(Number.isFinite);
    const colors = getEffectiveClassedColors(
      classification.colors ?? [],
      breaks
    );
    const items = colors.map((color, index) => ({
      label: getColorScaleLabel(breaks, colors.length, index),
      fill: color,
      stroke,
      strokeWidth,
      symbol,
      size: 9,
      opacity: text.opacity
    }));

    if (items.length === 0) {
      return null;
    }

    return {
      key: 'text-classed-color',
      primitive: 'text',
      className: 'legend-svg--text-color',
      consumesMissingData: Boolean(missingData?.show),
      create: (options, context) =>
        toLegendSvg(
          draw_khartis_swatch_legend(items, {
            ...options,
            type: 'symbol',
            ...getTextMissingDataFooterOptions(
              text,
              context.includeMissingDataFooter
            )
          })
        )
    };
  }

  return null;
}

function getTextSizeLegendDraft(
  viz: VisualizationConfig | undefined
): LegendSegmentDraft | null {
  const text = getTextPrimitive(viz);

  if (
    !viz ||
    !text?.enabled ||
    (text.sizeMode !== SizeMode.PROPORTIONAL &&
      text.sizeMode !== SizeMode.CLASSES) ||
    !text.valueColumn
  ) {
    return null;
  }

  const values = getNumericColumnValues(viz, text.valueColumn);
  if (values.length === 0) {
    return null;
  }

  const baseSize = text.size ?? SLIDER_LIMITS.textSize.min;
  const clampedBaseSize = Math.min(
    Math.max(baseSize, SLIDER_LIMITS.textSize.min),
    SLIDER_LIMITS.textSize.max
  );
  const maxLegendSize = Math.max(
    12,
    Math.min(22, Math.round(clampedBaseSize * 1.4))
  );
  const fill =
    text.colorMode === ColorMode.UNIQUE
      ? Array.isArray(text.color)
        ? (text.color[0] ?? DEFAULT_COLORS.text)
        : (text.color ?? DEFAULT_COLORS.text)
      : DEFAULT_COLORS.text;
  const stroke = text.halo ? (text.haloColor ?? DEFAULT_COLORS.halo) : 'none';

  return {
    key: 'text-size',
    primitive: 'text',
    className: 'legend-svg--text-size',
    consumesMissingData: Boolean(text.missingData?.show),
    create: (options, context) =>
      toLegendSvg(
        draw_symbols_legend(values, {
          ...options,
          type: 'text',
          size: maxLegendSize,
          fill,
          stroke,
          nodata: context.includeMissingDataFooter
            ? Boolean(text.missingData?.show)
            : false,
          nodataLabel: context.includeMissingDataFooter
            ? m.missing_data_text()
            : undefined
        })
      )
  };
}

function getQuantitativeColorLegendDraft(
  viz: VisualizationConfig,
  classification: ClassificationConfig,
  classPatternFills?: (LegendPatternFill | null)[]
): LegendSegmentDraft | null {
  const thresholds = buildQuantiColorThresholds({
    breaks: classification.breaks,
    colors: classification.colors,
    min: getStatisticsNumber(
      getColumnStatistics(
        viz,
        getPrimitiveValueColumn(viz, PrimitiveFilterType.POLYGON)
      ),
      'min'
    ),
    max: getStatisticsNumber(
      getColumnStatistics(
        viz,
        getPrimitiveValueColumn(viz, PrimitiveFilterType.POLYGON)
      ),
      'max'
    )
  });

  if (!thresholds) {
    return null;
  }

  return {
    key: 'quantitative-color',
    primitive: 'area',
    className: classPatternFills
      ? 'legend-svg--patterns'
      : 'legend-svg--quantitative',
    consumesMissingData: isLegendMissingDataShown(viz, 'area'),
    create: (options, context) =>
      toLegendSvg(
        draw_quanti_color_legend(thresholds, classification.colors ?? [], {
          ...options,
          classPatternFills,
          nodata: context.includeMissingDataFooter
            ? isLegendMissingDataShown(viz, 'area')
            : false,
          nodataLabel: context.includeMissingDataFooter
            ? m.missing_data_text()
            : undefined
        })
      )
  };
}

function getCategoricalLegendDraft(
  viz: VisualizationConfig | undefined
): LegendSegmentDraft | null {
  if (!viz || !hasCategoricalColorLegend(viz)) {
    return null;
  }

  const primitive = resolveLegendColorSwatchPrimitive(viz);
  const classification = getLegendCategoricalClassification(viz);
  const entries = getLegendCategoricalEntries(viz);

  if (!classification || entries.length === 0) {
    return null;
  }

  if (primitive === 'area') {
    const classPatternPalette = resolveClassPatternPalette(
      classification,
      FillMode.CATEGORIES
    );
    if (classPatternPalette) {
      const patternFills = getClassPatternLegendFills(classPatternPalette);
      const categories: CategoryItem[] = entries.map((entry) => ({
        label: entry.label,
        fill: '#ffffff',
        patternFill: patternFills[entry.originalIndex] ?? null,
        patternOpacity: 1
      }));

      return {
        key: 'categorical-patterns',
        primitive,
        className: 'legend-svg--patterns',
        consumesMissingData: isLegendMissingDataShown(viz, primitive),
        create: (options, context) =>
          toLegendSvg(
            draw_categorical_legend(categories, {
              ...options,
              type: 'pattern',
              ...getCategoricalMissingDataFooterOptions(
                viz,
                primitive,
                context.includeMissingDataFooter
              )
            })
          )
      };
    }

    if (classification.patternId) {
      const items = entries.map((entry) =>
        getPatternLegendItem(entry.label, entry.color, classification)
      );

      return {
        key: 'categorical-patterns',
        primitive,
        className: 'legend-svg--patterns',
        consumesMissingData: isLegendMissingDataShown(viz, primitive),
        create: (options, context) =>
          toLegendSvg(
            draw_khartis_swatch_legend(items, {
              ...options,
              type: 'pattern',
              ...getCategoricalSwatchFooterOptions(
                viz,
                context.includeMissingDataFooter,
                primitive
              )
            })
          )
      };
    }
  }

  const { type, categories } = getCategoricalLegendItems(
    viz,
    entries,
    primitive
  );

  return {
    key: 'categorical-color',
    primitive,
    className: 'legend-svg--categorical',
    consumesMissingData: isLegendMissingDataShown(viz, primitive),
    create: (options, context) =>
      toLegendSvg(
        draw_categorical_legend(categories, {
          ...options,
          type,
          ...getCategoricalMissingDataFooterOptions(
            viz,
            primitive,
            context.includeMissingDataFooter
          )
        })
      )
  };
}

function getPointSizeLegendDrafts(
  viz: VisualizationConfig | undefined
): LegendSegmentDraft[] {
  const scale = getPointSizeLegendScale(
    viz,
    getColumnStatistics(viz, viz?.mapping.sizeColumn)
  );

  if (!viz || !scale) {
    return [];
  }

  const type = getSymbolLegendType(scale.shape);
  const symbol = getSymbolPrimitive(viz);
  const maxSize = symbol?.maxSize ?? 18;
  const barWidth = symbol?.barWidth ?? DEFAULT_LINEAR_SYMBOL_BAR_WIDTH;

  if (scale.kind === 'proportional' && !scale.secondary && type) {
    const values = getNumericColumnValues(viz, viz.mapping.sizeColumn);
    if (values.length > 0) {
      return [
        {
          key: 'point-size',
          primitive: 'point',
          className: 'legend-svg--symbols',
          consumesMissingData: isLegendMissingDataShown(viz, 'point'),
          create: (options, context) =>
            toLegendSvg(
              // A single graduated column carries its meaning in the size
              // alone, so the symbols stay unfilled outlines.
              draw_symbols_legend(values, {
                ...options,
                type,
                size: maxSize,
                bar_width: barWidth,
                nodata: context.includeMissingDataFooter
                  ? isLegendMissingDataShown(viz, 'point')
                  : false,
                nodataLabel: context.includeMissingDataFooter
                  ? m.missing_data_text()
                  : undefined
              })
            )
        }
      ];
    }
  }

  if (scale.secondary && type) {
    const primaryColumn = symbol?.sizeColumn ?? viz.mapping.sizeColumn;
    const secondaryColumn = scale.secondary.valueColumn;

    if (!primaryColumn || !secondaryColumn) {
      return [];
    }

    // A shared scale means one graduated column reads for both variables, so
    // reuse the symbol legend and name each colour underneath it — the same
    // shape the cross-zero legend already uses for + and -.
    if (scale.commonScale !== false) {
      const sharedValues = [
        ...getNumericColumnValues(viz, primaryColumn),
        ...getNumericColumnValues(viz, secondaryColumn)
      ];
      if (sharedValues.length === 0) {
        return [];
      }

      return [
        {
          key: 'double-point-size',
          primitive: 'point',
          className: 'legend-svg--double-symbols',
          consumesMissingData: isLegendMissingDataShown(viz, 'point'),
          create: (options, context) =>
            toLegendSvg(
              draw_symbols_legend(sharedValues, {
                ...options,
                type,
                size: maxSize,
                fill: scale.fillColor,
                stroke: scale.strokeColor,
                bar_width: barWidth,
                colorSwatches: [
                  { color: scale.fillColor, label: primaryColumn },
                  {
                    color: scale.secondary?.fillColor ?? scale.fillColor,
                    label: secondaryColumn
                  }
                ],
                nodata: context.includeMissingDataFooter
                  ? isLegendMissingDataShown(viz, 'point')
                  : false,
                nodataLabel: context.includeMissingDataFooter
                  ? m.missing_data_text()
                  : undefined
              })
            )
        }
      ];
    }

    // Own scales cannot share a graduated column: each variable gets a
    // complete symbol legend of its own, named and coloured after its column.
    return [
      {
        column: primaryColumn,
        color: scale.fillColor,
        key: 'double-point-size-primary'
      },
      {
        column: secondaryColumn,
        color: scale.secondary.fillColor,
        key: 'double-point-size-secondary'
      }
    ]
      .map((variable): LegendSegmentDraft | null => {
        const values = getNumericColumnValues(viz, variable.column);
        if (values.length === 0) {
          return null;
        }

        return {
          key: variable.key,
          primitive: 'point',
          className: 'legend-svg--symbols',
          consumesMissingData: isLegendMissingDataShown(viz, 'point'),
          create: (
            options: CommonLegendTextOptions,
            context: LegendSegmentContext
          ) =>
            toLegendSvg(
              draw_symbols_legend(values, {
                ...options,
                subtitle: variable.column,
                type,
                size: maxSize,
                fill: variable.color,
                stroke: scale.strokeColor,
                bar_width: barWidth,
                nodata: context.includeMissingDataFooter
                  ? isLegendMissingDataShown(viz, 'point')
                  : false,
                nodataLabel: context.includeMissingDataFooter
                  ? m.missing_data_text()
                  : undefined
              })
            )
        };
      })
      .filter((draft): draft is LegendSegmentDraft => draft !== null);
  }

  const items = getPointSizeLegendItems(viz, scale);
  if (items.length === 0) {
    return [];
  }

  return [
    {
      key: 'point-size-classes',
      primitive: 'point',
      className: 'legend-svg--symbols',
      consumesMissingData: isLegendMissingDataShown(viz, 'point'),
      create: (options, context) =>
        toLegendSvg(
          draw_khartis_swatch_legend(items, {
            ...options,
            type: 'symbol',
            ...getMissingDataFooterOptions(
              viz,
              context.includeMissingDataFooter,
              'point'
            )
          })
        )
    }
  ];
}

function getUniquePointSymbolLegendDraft(
  viz: VisualizationConfig | undefined
): LegendSegmentDraft | null {
  const symbol = getSymbolPrimitive(viz);

  if (!viz || !symbol?.enabled || symbol.mode !== SymbolMode.UNIQUE) {
    return null;
  }

  if (
    symbol.fillMode === FillMode.CLASSES ||
    symbol.fillMode === FillMode.CATEGORIES
  ) {
    return null;
  }

  const fill =
    symbol.fillMode === FillMode.NONE
      ? 'none'
      : resolveLegendColor(symbol.fillColor, DEFAULT_COLORS.fill);
  const stroke =
    symbol.strokeMode === StrokeMode.NONE
      ? 'none'
      : resolveLegendColor(symbol.strokeColor, DEFAULT_COLORS.stroke);

  const item: KhartisLegendSwatchItem = {
    label: m.symbols_title(),
    fill,
    stroke,
    strokeWidth:
      symbol.strokeMode === StrokeMode.NONE
        ? 0
        : Math.max(
            0.5,
            symbol.strokeWidth ?? VISUALIZATION_DEFAULTS.strokeWidth
          ),
    opacity: normalizeLegendOpacity(symbol.opacity, 1),
    symbol: getShapePath(symbol.shape ?? ShapeType.CIRCLE),
    size: getUniquePointLegendDisplaySize(symbol.size)
  };

  return {
    key: 'unique-point-symbol',
    primitive: 'point',
    className: 'legend-svg--symbols',
    consumesMissingData: isLegendMissingDataShown(viz, 'point'),
    create: (options, context) =>
      toLegendSvg(
        draw_khartis_swatch_legend([item], {
          ...options,
          type: 'symbol',
          ...getMissingDataFooterOptions(
            viz,
            context.includeMissingDataFooter,
            'point'
          )
        })
      )
  };
}

function getLineWidthLegendDraft(
  viz: VisualizationConfig | undefined
): LegendSegmentDraft | null {
  const line = getLinePrimitive(viz);
  const scale = getLineWidthLegendScale(
    viz,
    getColumnStatistics(viz, line?.sizeColumn ?? viz?.mapping.sizeColumn)
  );

  if (!viz || !scale) {
    return null;
  }

  const classification = getLineThicknessClassification(viz);
  const breaks = classification?.breaks ?? viz.classification?.breaks;
  const classCount = getClassificationClassCount(classification);
  const steps: KhartisLineWidthLegendStep[] = scale.steps.map((step) => ({
    label: getLegendStepLabel(step, breaks, classCount),
    width:
      scale.kind === 'proportional'
        ? step.size
        : getLineLegendDisplayWidth(scale, step.size),
    color: scale.color,
    opacity: scale.opacity,
    dashed: scale.dashed
  }));

  return {
    key: 'line-width',
    primitive: 'line',
    className: 'legend-svg--line-width',
    consumesMissingData: isLegendMissingDataShown(viz, 'line'),
    create: (options, context) =>
      toLegendSvg(
        draw_khartis_line_width_legend(steps, {
          ...options,
          ...getMissingDataFooterOptions(
            viz,
            context.includeMissingDataFooter,
            'line'
          )
        })
      )
  };
}

function getDensityLegendDraft(
  viz: VisualizationConfig | undefined
): LegendSegmentDraft | null {
  const scale = getDensityLegendScale(viz);

  if (!viz || !scale) {
    return null;
  }

  return {
    key: 'density',
    primitive: 'area',
    className: 'legend-svg--density',
    consumesMissingData: isLegendMissingDataShown(viz, 'area'),
    create: (options, context) =>
      toLegendSvg(
        draw_khartis_density_legend({
          ...options,
          ratioLabel: m.density_ratio_label({ ratio: String(scale.ratio) }),
          dotSize: scale.dotSize,
          fill: scale.fillColor,
          ...getMissingDataFooterOptions(
            viz,
            context.includeMissingDataFooter,
            'area'
          )
        })
      )
  };
}

function getMissingDataLegendDraft(
  viz: VisualizationConfig
): LegendSegmentDraft | null {
  const primitive = resolveMissingDataLegendPrimitive(viz);
  const missingData = getLegendMissingDataConfig(viz, primitive);
  if (!missingData?.show) {
    return null;
  }

  const item = getMissingDataLegendItem(viz, primitive);

  return {
    key: 'missing-data',
    primitive,
    className: 'legend-svg--missing-data',
    create: (options, _context) =>
      toLegendSvg(
        draw_khartis_swatch_legend([item], {
          ...options,
          type: primitive === 'point' ? 'symbol' : 'pattern'
        })
      )
  };
}

function getCategoricalLegendItems(
  viz: VisualizationConfig,
  entries: LegendCategoricalEntry[],
  primitive: ReturnType<typeof resolveLegendColorSwatchPrimitive>
): { type: CategoricalShapeType; categories: CategoryItem[] } {
  let type: CategoricalShapeType = 'box';
  const categories: CategoryItem[] = entries.map((entry) => ({
    label: entry.label,
    fill: entry.color,
    stroke: 'none',
    strokeWidth: 0
  }));

  if (primitive === 'line') {
    type = 'line';
    categories.forEach((category) => {
      category.stroke = category.fill;
      category.strokeWidth = Math.max(2, Math.min(6, viz.style.lineWidth ?? 3));
    });
  } else if (primitive === 'point') {
    type = 'symbol';
    categories.forEach((category, index) => {
      const shape = getLegendPointCategoryShape(
        viz,
        entries[index].originalIndex
      );
      category.symbol = getShapePath(shape);
      category.stroke = 'rgba(0, 0, 0, 0.25)';
      category.strokeWidth = 0.75;
      category.size = getLegendPointCategorySize(
        viz,
        entries[index].originalIndex
      );
    });
  }

  return { type, categories };
}

function getClassedColorLegendItems(
  viz: VisualizationConfig,
  classification: ClassificationConfig,
  primitive: ReturnType<typeof resolveLegendColorSwatchPrimitive>
): KhartisLegendSwatchItem[] {
  const breaks = (classification.breaks ?? []).filter(Number.isFinite);
  const colors = getEffectiveClassedColors(classification.colors ?? [], breaks);

  return colors.map((color, index) => {
    const label = getColorScaleLabel(breaks, colors.length, index);

    if (primitive === 'line') {
      return {
        label,
        stroke: color,
        strokeWidth: Math.max(2, Math.min(6, viz.style.lineWidth ?? 3)),
        opacity: normalizeLegendOpacity(viz.style.lineOpacity, 1),
        dashed: viz.style.lineDashed ?? false
      };
    }

    if (primitive === 'point') {
      const symbol = getSymbolPrimitive(viz);
      return {
        label,
        fill: color,
        stroke: 'rgba(0, 0, 0, 0.25)',
        strokeWidth: 0.75,
        symbol: getShapePath(symbol?.shape ?? ShapeType.CIRCLE),
        size: 8
      };
    }

    return {
      label,
      fill: color,
      stroke: 'rgba(0, 0, 0, 0.15)',
      strokeWidth: 1
    };
  });
}

function getPointSizeLegendItems(
  viz: VisualizationConfig,
  scale: PointSizeLegendScale
): KhartisLegendSwatchItem[] {
  const classification = getPrimitiveClassification(
    viz,
    PrimitiveFilterType.POINT
  );
  const breaks = classification?.breaks ?? viz.classification?.breaks;
  const classCount = getClassificationClassCount(classification);

  return scale.steps.map((step) => ({
    label: getLegendStepLabel(step, breaks, classCount),
    fill: scale.fillColor,
    stroke: scale.strokeColor,
    strokeWidth: 0.75,
    opacity: scale.fillOpacity,
    symbol: getShapePath(scale.shape),
    size: getPointLegendDisplaySize(scale, step.size)
  }));
}

function getMissingDataFooterOptions(
  viz: VisualizationConfig,
  includeFooter = true,
  primitive: LegendSwatchPrimitive = resolveMissingDataLegendPrimitive(viz)
): {
  footerItems?: KhartisLegendSwatchItem[];
  footerType?: KhartisLegendSwatchType;
} {
  if (!includeFooter || !isLegendMissingDataShown(viz, primitive)) {
    return {};
  }

  return {
    footerItems: [getMissingDataLegendItem(viz, primitive)],
    footerType: getSwatchType(primitive, primitive === 'area')
  };
}

function getCategoricalSwatchFooterOptions(
  viz: VisualizationConfig,
  includeMissingData: boolean,
  primitive: LegendSwatchPrimitive
): {
  footerItems?: KhartisLegendSwatchItem[];
  footerType?: KhartisLegendSwatchType;
} {
  const missingDataOptions = getMissingDataFooterOptions(
    viz,
    includeMissingData,
    primitive
  );
  const footerItems: KhartisLegendSwatchItem[] =
    missingDataOptions.footerItems ?? [];

  return footerItems.length > 0
    ? {
        footerItems,
        footerType:
          missingDataOptions.footerType ?? getSwatchType(primitive, false)
      }
    : {};
}

function getTextMissingDataFooterOptions(
  text: NonNullable<ReturnType<typeof getTextPrimitive>>,
  includeFooter = true
): {
  footerItems?: KhartisLegendSwatchItem[];
  footerType?: KhartisLegendSwatchType;
} {
  if (!includeFooter || !text.missingData?.show) {
    return {};
  }

  return {
    footerItems: [getTextMissingDataLegendItem(text)],
    footerType: 'symbol'
  };
}

function getTextCategoricalMissingDataFooterOptions(
  text: NonNullable<ReturnType<typeof getTextPrimitive>>,
  includeFooter = true
): {
  footerItems?: CategoryItem[];
  footerType?: CategoricalFooterShapeType;
} {
  const footerItems: CategoryItem[] =
    includeFooter && text.missingData?.show
      ? [getTextMissingDataLegendItem(text)]
      : [];

  return footerItems.length > 0
    ? {
        footerItems,
        footerType: 'symbol'
      }
    : {};
}

function getCategoricalMissingDataFooterOptions(
  viz: VisualizationConfig,
  primitive: LegendSwatchPrimitive,
  includeFooter = true
): {
  footerItems?: CategoryItem[];
  footerType?: CategoricalFooterShapeType;
} {
  const missingDataPrimitive = resolveMissingDataLegendPrimitive(viz);
  const includeMissingData =
    includeFooter && isLegendMissingDataShown(viz, missingDataPrimitive);
  const item = includeMissingData
    ? getMissingDataLegendItem(viz, missingDataPrimitive)
    : null;
  const footerItems: CategoryItem[] = item ? [item] : [];
  if (footerItems.length === 0) {
    return {};
  }

  const footerType = getSwatchType(
    primitive,
    primitive === 'area' && Boolean(item?.patternFill)
  );

  return {
    footerItems,
    footerType:
      footerType === 'pattern' || footerType === 'line'
        ? footerType
        : footerType === 'symbol'
          ? 'symbol'
          : 'box'
  };
}

function getMissingDataLegendItem(
  viz: VisualizationConfig,
  primitive: LegendSwatchPrimitive
): KhartisLegendSwatchItem {
  const missingData = getLegendMissingDataConfig(viz, primitive);
  const color = missingData?.color ?? '#d9d9d9';

  if (primitive === 'point') {
    return {
      label: m.missing_data_text(),
      fill: color,
      stroke: 'rgba(0, 0, 0, 0.25)',
      strokeWidth: 0.75,
      symbol: getShapePath(resolveMissingDataPointShape(missingData?.shape)),
      size: Math.max(6, Math.min(14, missingData?.size ?? 6))
    };
  }

  const missingDataPattern = resolveMissingDataClassPattern(missingData);

  return {
    label: m.missing_data_text(),
    fill: color,
    stroke: 'rgba(0, 0, 0, 0.15)',
    strokeWidth: 1,
    patternFill: missingDataPattern
      ? getClassPatternLegendFill(missingDataPattern)
      : null,
    patternOpacity: 1
  };
}

function getTextMissingDataLegendItem(
  text: NonNullable<ReturnType<typeof getTextPrimitive>>
): KhartisLegendSwatchItem {
  return {
    label: m.missing_data_text(),
    fill: text.missingData?.color ?? DEFAULT_COLORS.missingData,
    stroke: text.halo ? (text.haloColor ?? DEFAULT_COLORS.halo) : 'none',
    strokeWidth: getTextLegendStrokeWidth(text.haloWidth, text.halo),
    symbol: getTextLegendSymbolPath(),
    size: 9,
    opacity: text.opacity
  };
}

function getPatternLegendItem(
  label: string,
  color: string,
  classification: ClassificationConfig
): KhartisLegendSwatchItem {
  return {
    label,
    fill: color,
    stroke: 'rgba(0, 0, 0, 0.15)',
    strokeWidth: 1,
    patternFill: classification.patternId
      ? getLegendPatternFill(
          classification.patternId,
          getPatternOverlayColorHex(color),
          classification.patternParams
        )
      : null
  };
}

function getLegendMissingDataConfig(
  viz: VisualizationConfig | undefined,
  primitive: LegendSwatchPrimitive
): VisualizationConfig['missingData'] {
  if (!viz) {
    return undefined;
  }

  switch (primitive) {
    case 'point':
      return getSymbolPrimitive(viz)?.missingData ?? viz.missingData;
    case 'line':
      return getLinePrimitive(viz)?.missingData ?? viz.missingData;
    case 'area':
    default:
      return getPolygonPrimitive(viz)?.missingData ?? viz.missingData;
  }
}

function isLegendMissingDataShown(
  viz: VisualizationConfig | undefined,
  primitive: LegendSwatchPrimitive
): boolean {
  return Boolean(getLegendMissingDataConfig(viz, primitive)?.show);
}

function getSwatchType(
  primitive: LegendSwatchPrimitive,
  hasPattern: boolean
): KhartisLegendSwatchType {
  if (hasPattern) {
    return 'pattern';
  }

  if (primitive === 'line') {
    return 'line';
  }

  if (primitive === 'point') {
    return 'symbol';
  }

  return 'box';
}

function normalizeLegendOpacity(
  value: number | undefined,
  fallback: number
): number {
  const resolved = value ?? fallback;
  const normalized = resolved > 1 ? resolved / 100 : resolved;
  return Math.max(0, Math.min(1, normalized));
}

function resolveLegendColor(
  color: string | string[] | undefined,
  fallback: string
): string {
  if (Array.isArray(color)) {
    return typeof color[0] === 'string' ? color[0] : fallback;
  }

  return typeof color === 'string' ? color : fallback;
}

function getClassificationClassCount(
  classification: ClassificationConfig | undefined
): number {
  if (!classification) {
    return 0;
  }

  return (
    (classification.breaks?.length
      ? classification.breaks.length + 1
      : undefined) ??
    classification.numClasses ??
    classification.labels?.length ??
    classification.colors?.length ??
    0
  );
}

function buildQuantiColorThresholds(options: {
  breaks?: number[];
  colors?: string[];
  min?: number | null;
  max?: number | null;
}): number[] | null {
  const breaks = (options.breaks ?? [])
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const colorCount = options.colors?.length ?? 0;
  const min = options.min;
  const max = options.max;

  if (colorCount <= 0) {
    return null;
  }

  if (breaks.length === colorCount + 1) {
    return breaks;
  }

  if (
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    breaks.length === colorCount - 1
  ) {
    return [min as number, ...breaks, max as number];
  }

  if (Number.isFinite(max) && breaks.length === colorCount) {
    return [...breaks, max as number];
  }

  return null;
}
