<script module lang="ts">
  import { motif } from '@ateliercartographie/motif.js';
  import { PATTERN_TYPE_MAP } from '../layers/pattern-texture';
  import { SvelteMap } from 'svelte/reactivity';
  import type { PatternParams } from '$lib/features/commons/stores/visualization.store.svelte';

  const patternTileCache: Record<string, string> = {};

  function getPatternTileUrl(
    patternId: string,
    patternColor = '#000000',
    backgroundColor = '#ffffff',
    patternParams?: PatternParams
  ): string | null {
    const cacheKey = JSON.stringify({
      patternId,
      patternColor,
      backgroundColor,
      angle: patternParams?.angle,
      size: patternParams?.size,
      scale: patternParams?.scale
    });
    if (cacheKey in patternTileCache) return patternTileCache[cacheKey];
    const config = PATTERN_TYPE_MAP[patternId as keyof typeof PATTERN_TYPE_MAP];
    if (!config) return null;
    const scale = Math.max(4, patternParams?.scale ?? 8);
    const size = Math.max(1, patternParams?.size ?? 4);
    const tile = motif({
      type: config.type,
      angle: patternParams?.angle ?? config.angle,
      fill: patternColor,
      background: backgroundColor,
      size: Math.round((size / scale) * 100),
      scale: scale / 10,
      patchSize: true
    }).tile();
    const url = tile.toDataURL();
    patternTileCache[cacheKey] = url;
    return url;
  }
</script>

<script lang="ts">
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import {
    StylingTools,
    ToolbarStep
  } from '$lib/features/commons/types/global';
  import { LegendPosition } from '$lib/features/commons/constants/ui.constants';
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
    visualizationStore,
    type ClassificationConfig,
    type VisualizationConfig
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import { hexToRgb, hslToHex } from '$lib/features/commons/utils/color-utils';
  import { resolveLayoutSizingTokens } from '$lib/features/commons/utils/layout-sizing.utils';
  import {
    clampFontSize,
    resolveFontFamilyStack
  } from '$lib/features/step-toolbar/fonts.constants';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    getDragBounds,
    snapPointWithinBounds
  } from '$lib/features/commons/utils/page-grid.utils';
  import {
    getElementCenteringDelta,
    getFocusViewportElement
  } from '../utils/focus-viewport.utils';
  import { setStylingToolPopoverDragging } from '../utils/tool-popover-drag-visibility.utils';
  import {
    getLegendState,
    legendActions
  } from '$lib/features/step-toolbar/tools/legend';
  import {
    getFormatLayoutSizingContext,
    getFormatState
  } from '$lib/features/step-toolbar/tools/format';
  import {
    facetsStore,
    SCALE_MODE
  } from '$lib/features/step-toolbar/tools/facets';
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
  import { tick, untrack, onDestroy } from 'svelte';
  import { activateStylingToolFromMap } from '../utils/styling-tool-activation.utils';
  import {
    LegendSvg,
    createLegendSvg,
    draw_categorical_legend,
    draw_khartis_density_legend,
    draw_khartis_double_symbols_legend,
    draw_khartis_line_width_legend,
    draw_khartis_swatch_legend,
    draw_quanti_color_legend,
    draw_symbols_legend,
    type CategoricalFooterShapeType,
    type CategoricalShapeType,
    type CategoryItem,
    type CommonLegendTextOptions,
    type KhartisDoubleSymbolsLegendStep,
    type KhartisLegendSwatchItem,
    type KhartisLegendSwatchType,
    type KhartisLineWidthLegendStep,
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
  } from '../utils/legend.utils';
  import type { LegendItem } from '$lib/features/step-toolbar/tools/legend';

  // `scopeVizId` + `inline` drive the per-facet anchored legend: each facet cell
  // renders its own LegendOverlay scoped to one visualization, laid out inline
  // inside the cell instead of absolutely-positioned/draggable in the viewport.
  // Both default to the legacy behaviour (single, viewport-positioned legend).
  let {
    hidden = false,
    scopeVizId = null,
    inline = false
  }: {
    hidden?: boolean;
    scopeVizId?: string | null;
    inline?: boolean;
  } = $props();

  function getPatternOverlayColor(fillColor: string | undefined): string {
    if (!fillColor?.startsWith('#') || fillColor.length !== 7) {
      return '#000000';
    }

    const [r, g, b] = hexToRgb(fillColor);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

    return luminance < 0.45 ? '#ffffff' : '#000000';
  }

  type LegendCategoricalEntry = {
    key: string;
    label: string;
    color: string;
    originalIndex: number;
  };

  type LegendSegmentDraft = {
    key: string;
    className: string;
    consumesMissingData?: boolean;
    create: (
      options: CommonLegendTextOptions,
      context: { includeMissingDataFooter: boolean }
    ) => LegendSvgDefinition | null;
  };

  type LegendSegment = {
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
          labels[index] ??
          m.palette_category_default_label({ index: index + 1 });

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
    const getColumnValues = (
      datasetsStore as {
        getColumnValues?: (datasetId: string, columnName: string) => unknown[];
      }
    ).getColumnValues;

    if (!getColumnValues) {
      return fallbackValues;
    }

    const values = getColumnValues(viz.datasetId, columnName)
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
    if (Number.isInteger(value)) return value.toLocaleString();
    if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
    return value.toFixed(1);
  }

  function getColorScaleLabel(
    breaks: number[],
    colorCount: number,
    index: number
  ): string {
    if (breaks.length === 0) {
      return '';
    }

    if (colorCount === breaks.length + 1) {
      const firstBreak = breaks[0];
      if (index === 0) {
        return firstBreak !== undefined
          ? `< ${formatBreakValue(firstBreak)}`
          : '';
      }

      if (index < breaks.length) {
        const lowerBreak = breaks[index - 1];
        const upperBreak = breaks[index];
        return lowerBreak !== undefined && upperBreak !== undefined
          ? `${formatBreakValue(lowerBreak)} – ${formatBreakValue(upperBreak)}`
          : '';
      }

      const lastBreak = breaks[breaks.length - 1];
      return lastBreak !== undefined ? `≥ ${formatBreakValue(lastBreak)}` : '';
    }

    if (colorCount === breaks.length) {
      if (index < breaks.length - 1) {
        const lowerBreak = breaks[index];
        const upperBreak = breaks[index + 1];
        return lowerBreak !== undefined && upperBreak !== undefined
          ? `${formatBreakValue(lowerBreak)} – ${formatBreakValue(upperBreak)}`
          : '';
      }

      const lastBreak = breaks[breaks.length - 1];
      return lastBreak !== undefined ? `≥ ${formatBreakValue(lastBreak)}` : '';
    }

    const fallbackBreak =
      index < breaks.length ? breaks[index] : breaks[breaks.length - 1];
    return fallbackBreak !== undefined ? formatBreakValue(fallbackBreak) : '';
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

  function getLegendSegments(
    item: LegendItem,
    viz: VisualizationConfig | undefined
  ): LegendSegment[] {
    const drafts = [
      getDensityLegendDraft(viz),
      getClassedColorLegendDraft(viz),
      getCategoricalLegendDraft(viz),
      getTextColorLegendDraft(viz),
      getTextSizeLegendDraft(viz),
      getUniquePointSymbolLegendDraft(viz),
      getPointSizeLegendDraft(viz),
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

    const lastMissingDataDraftIndex = drafts.findLastIndex(
      (draft) => draft.consumesMissingData
    );

    return drafts
      .map((draft, index) => {
        const svg = draft.create(
          getLegendTextOptions(item, index, drafts.length),
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
    count: number
  ): CommonLegendTextOptions {
    return {
      fontFamily: legendState.style.fontFamily,
      fontSize: legendState.style.fontSize,
      title: index === 0 ? item.title : null,
      subtitle: index === 0 ? item.subtitle : null,
      note: index === count - 1 ? item.note : null
    };
  }

  function toLegendSvg(markup: string): LegendSvgDefinition | null {
    const svg = createLegendSvg(markup);
    return svg.width > 0 && svg.height > 0 ? svg : null;
  }

  function getClassedColorLegendDraft(
    viz: VisualizationConfig | undefined
  ): LegendSegmentDraft | null {
    if (!viz || !hasClassedColorLegend(viz)) {
      return null;
    }

    const primitive = resolveLegendColorSwatchPrimitive(viz);
    const classification = getLegendClassedColorClassification(viz);
    const colors = classification?.colors ?? [];

    if (!classification || colors.length === 0) {
      return null;
    }

    if (primitive === 'area' && !classification.patternId) {
      return getQuantitativeColorLegendDraft(viz, classification);
    }

    const items = getClassedColorLegendItems(viz, classification, primitive);
    if (items.length === 0) {
      return null;
    }

    const type = getSwatchType(primitive, Boolean(classification.patternId));
    return {
      key: 'classed-color',
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
      const categories: CategoryItem[] = (classification.colors ?? [])
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

      if (categories.length === 0) {
        return null;
      }

      return {
        key: 'text-categorical-color',
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
    classification: ClassificationConfig
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
      className: 'legend-svg--quantitative',
      consumesMissingData: isLegendMissingDataShown(viz, 'area'),
      create: (options, context) =>
        toLegendSvg(
          draw_quanti_color_legend(thresholds, classification.colors ?? [], {
            ...options,
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

    if (primitive === 'area' && classification.patternId) {
      const items = entries.map((entry) =>
        getPatternLegendItem(entry.label, entry.color, classification)
      );

      return {
        key: 'categorical-patterns',
        className: 'legend-svg--patterns',
        consumesMissingData: isLegendMissingDataShown(viz, primitive),
        create: (options, context) =>
          toLegendSvg(
            draw_khartis_swatch_legend(items, {
              ...options,
              type: 'pattern',
              ...getMissingDataFooterOptions(
                viz,
                context.includeMissingDataFooter,
                primitive
              )
            })
          )
      };
    }

    const { type, categories } = getCategoricalLegendItems(
      viz,
      entries,
      primitive
    );

    return {
      key: 'categorical-color',
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

  function getPointSizeLegendDraft(
    viz: VisualizationConfig | undefined
  ): LegendSegmentDraft | null {
    const scale = getPointSizeLegendScale(
      viz,
      getColumnStatistics(viz, viz?.mapping.sizeColumn)
    );

    if (!viz || !scale) {
      return null;
    }

    const type = getSymbolLegendType(scale.shape);

    if (scale.kind === 'proportional' && !scale.secondary && type) {
      const values = getNumericColumnValues(viz, viz.mapping.sizeColumn);
      if (values.length > 0) {
        const symbol = getSymbolPrimitive(viz);
        const maxSize = symbol?.maxSize ?? 18;
        const barWidth = symbol?.barWidth ?? DEFAULT_LINEAR_SYMBOL_BAR_WIDTH;
        return {
          key: 'point-size',
          className: 'legend-svg--symbols',
          consumesMissingData: isLegendMissingDataShown(viz, 'point'),
          create: (options, context) =>
            toLegendSvg(
              // Proportional-size legend stays neutral (black outline, no
              // fill): it encodes size only, the symbol color says nothing.
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
        };
      }
    }

    if (scale.secondary) {
      const steps = getDoubleSymbolLegendSteps(viz, scale);
      if (steps.length === 0) {
        return null;
      }

      return {
        key: 'double-point-size',
        className: 'legend-svg--double-symbols',
        consumesMissingData: isLegendMissingDataShown(viz, 'point'),
        create: (options, context) =>
          toLegendSvg(
            draw_khartis_double_symbols_legend(steps, {
              ...options,
              ...getMissingDataFooterOptions(
                viz,
                context.includeMissingDataFooter,
                'point'
              )
            })
          )
      };
    }

    const items = getPointSizeLegendItems(viz, scale);
    if (items.length === 0) {
      return null;
    }

    return {
      key: 'point-size-classes',
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
    };
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
      width: getLineLegendDisplayWidth(scale, step.size),
      color: scale.color,
      opacity: scale.opacity,
      dashed: scale.dashed
    }));

    return {
      key: 'line-width',
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
        category.strokeWidth = Math.max(
          2,
          Math.min(6, viz.style.lineWidth ?? 3)
        );
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
    const colors = getEffectiveClassedColors(
      classification.colors ?? [],
      breaks
    );

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

      if (classification.patternId) {
        return getPatternLegendItem(label, color, classification);
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

  function getDoubleSymbolLegendSteps(
    viz: VisualizationConfig,
    scale: PointSizeLegendScale
  ): KhartisDoubleSymbolsLegendStep[] {
    if (!scale.secondary) {
      return [];
    }

    const classification = getPrimitiveClassification(
      viz,
      PrimitiveFilterType.POINT
    );
    const breaks = classification?.breaks ?? viz.classification?.breaks;
    const classCount = getClassificationClassCount(classification);

    return scale.steps.map((step) => ({
      label: getLegendStepLabel(step, breaks, classCount),
      size: getPointLegendDisplaySize(scale, step.size),
      symbol: getShapePath(scale.shape),
      fill: scale.fillColor,
      secondaryFill: scale.secondary?.fillColor ?? scale.fillColor,
      stroke: scale.strokeColor,
      opacity: scale.fillOpacity,
      positionMode: scale.positionMode
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
    if (!includeFooter || !text.missingData?.show) {
      return {};
    }

    return {
      footerItems: [getTextMissingDataLegendItem(text)],
      footerType: 'symbol'
    };
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
    if (
      !includeFooter ||
      !isLegendMissingDataShown(viz, missingDataPrimitive)
    ) {
      return {};
    }

    const item = getMissingDataLegendItem(viz, missingDataPrimitive);
    const footerType = getSwatchType(
      primitive,
      primitive === 'area' && Boolean(item.patternUrl)
    );

    return {
      footerItems: [item],
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

    return {
      label: m.missing_data_text(),
      fill: color,
      stroke: 'rgba(0, 0, 0, 0.15)',
      strokeWidth: 1,
      patternUrl: missingData?.pattern
        ? getPatternTileUrl(
            'cross',
            getPatternOverlayColor(color),
            color,
            undefined
          )
        : null
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
      patternUrl: classification.patternId
        ? getPatternTileUrl(
            classification.patternId,
            getPatternOverlayColor(color),
            color,
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

  const legendState = $derived(getLegendState());
  const formatState = $derived(getFormatState());
  const visibleItems = $derived.by(() => {
    const items = legendState.items.filter((i) => i.visible);
    if (scopeVizId) {
      return items.filter((item) => item.variableId === scopeVizId);
    }
    if (!facetsStore.enabled) {
      return items;
    }

    // In a map collection the base visualization is hidden, so its legend must
    // not appear; only the generated facets get a legend. With a shared scale
    // every facet shares the same breaks, so a single legend stands for all.
    const generatedIds = new Set(facetsStore.generatedVisualizationIds);
    const facetItems = items.filter(
      (item) => item.variableId != null && generatedIds.has(item.variableId)
    );

    if (facetsStore.scaleMode === SCALE_MODE.SHARED) {
      return facetItems.slice(0, 1);
    }

    return facetItems;
  });

  const vizByItemId = $derived.by(() => {
    void visualizationStore.version;
    const map = new SvelteMap<string, VisualizationConfig>();
    for (const item of legendState.items) {
      if (item.variableId) {
        const viz = visualizationStore.visualizations.find(
          (v) => v.id === item.variableId
        );
        if (viz) map.set(item.id, viz);
      }
    }
    return map;
  });

  $effect(() => {
    void visualizationStore.version;
    legendActions.syncWithVisualizations();
  });

  const bgColor = $derived(legendState.style.background.color);
  const bgOpacity = $derived(
    Math.max(0, Math.min(100, legendState.style.background.opacity)) / 100
  );
  const bgHsl = $derived(
    `hsl(${bgColor.hue} ${bgColor.saturation}% ${bgColor.lightness}% / ${bgOpacity})`
  );
  const textColor = $derived(legendState.style.textColor);
  const textHex = $derived(
    hslToHex(textColor.hue, textColor.saturation, textColor.lightness)
  );
  const isLegendActive = $derived(
    !inline &&
      globalState.selectedStep === ToolbarStep.Styling &&
      globalState.selectedTool === StylingTools.Legend
  );
  const pageScale = $derived(Math.max(globalState.zoom.pageZoomScale, 0.1));
  const layoutTokens = $derived.by(() =>
    resolveLayoutSizingTokens(getFormatLayoutSizingContext(formatState))
  );

  function getPositionClass(position: LegendPosition): string {
    switch (position) {
      case LegendPosition.TOP_LEFT:
        return 'top-left';
      case LegendPosition.TOP_RIGHT:
        return 'top-right';
      case LegendPosition.BOTTOM_LEFT:
        return 'bottom-left';
      case LegendPosition.BOTTOM_RIGHT:
        return 'bottom-right';
      case LegendPosition.BOTTOM_CENTER:
        return 'bottom-center';
      default:
        return 'top-right';
    }
  }

  const positionClass = $derived.by(() => {
    if (inline || legendState.dragPosition) {
      return '';
    }
    return getPositionClass(legendState.position);
  });

  const containerStyle = $derived.by(() => {
    const scale = getPageScale();
    const hasBackground = legendState.style.background.enabled;
    const shellPaddingInline = hasBackground
      ? Math.max(4, Math.round(layoutTokens.legend.paddingInline * 0.35))
      : 0;
    const shellPaddingBlock = hasBackground
      ? Math.max(3, Math.round(layoutTokens.legend.paddingBlock * 0.35))
      : 0;
    const transform =
      !inline &&
      !legendState.dragPosition &&
      legendState.position === LegendPosition.BOTTOM_CENTER
        ? `translateX(-50%) scale(${scale})`
        : `scale(${scale})`;
    const legendFontSize = clampFontSize(
      legendState.style.fontSize,
      layoutTokens.legend.fontSize
    );
    const styles: string[] = [
      `--legend-page-scale: ${scale}`,
      `--legend-padding-inline: ${shellPaddingInline}px`,
      `--legend-padding-block: ${shellPaddingBlock}px`,
      `--legend-item-gap: ${Math.max(8, Math.round(layoutTokens.legend.fontSize * 0.7))}px`,
      `font-family: ${resolveFontFamilyStack(legendState.style.fontFamily)}`,
      `font-size: ${legendFontSize}px`,
      `color: ${textHex}`,
      'border-radius: 0px',
      `transform: ${transform}`,
      `transform-origin: ${inline ? 'bottom right' : getLegendTransformOrigin(legendState.position, Boolean(legendState.dragPosition))}`
    ];

    if (hasBackground) {
      styles.push(`background-color: ${bgHsl}`);
      styles.push('box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15)');
    } else {
      styles.push('background-color: transparent');
      styles.push('box-shadow: none');
    }

    if (!inline && legendState.dragPosition) {
      styles.push(`left: ${legendState.dragPosition.x * scale}px`);
      styles.push(`top: ${legendState.dragPosition.y * scale}px`);
    }

    return styles.join('; ');
  });

  let overlayElement = $state<HTMLDivElement | null>(null);
  let legendElement = $state<HTMLDivElement | null>(null);
  let isDragging = $state(false);
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let isLegendCentered = $state(false);

  function getPageScale(): number {
    return pageScale;
  }

  function getLegendTransformOrigin(
    position: LegendPosition,
    isCustomPosition: boolean
  ): string {
    if (isCustomPosition) {
      return 'top left';
    }

    switch (position) {
      case LegendPosition.TOP_LEFT:
        return 'top left';
      case LegendPosition.BOTTOM_LEFT:
        return 'bottom left';
      case LegendPosition.BOTTOM_RIGHT:
        return 'bottom right';
      case LegendPosition.BOTTOM_CENTER:
        return 'bottom center';
      case LegendPosition.TOP_RIGHT:
      default:
        return 'top right';
    }
  }

  function arePointsEqual(
    left: { x: number; y: number } | null,
    right: { x: number; y: number } | null
  ): boolean {
    return left?.x === right?.x && left?.y === right?.y;
  }

  function getOverlaySize(): { width: number; height: number } | null {
    if (!overlayElement) {
      return null;
    }

    return {
      width: overlayElement.offsetWidth / getPageScale(),
      height: overlayElement.offsetHeight / getPageScale()
    };
  }

  function getLegendSize(): { width: number; height: number } | null {
    if (!legendElement) {
      return null;
    }

    return {
      width: legendElement.offsetWidth,
      height: legendElement.offsetHeight
    };
  }

  function normalizeLegendDragPosition(
    position: { x: number; y: number },
    snapEnabled = formatState.gridEnabled
  ): { x: number; y: number } {
    const overlaySize = getOverlaySize();
    const legendSize = getLegendSize();

    if (!overlaySize || !legendSize) {
      return position;
    }

    return snapPointWithinBounds(
      position,
      getDragBounds(overlaySize, legendSize),
      snapEnabled
    );
  }

  $effect(() => {
    void formatState.width;
    void formatState.height;
    void formatState.margins.top;
    void formatState.margins.right;
    void formatState.margins.bottom;
    void formatState.margins.left;
    void legendState.items;
    void legendState.style.fontFamily;
    void legendState.style.fontSize;
    void legendState.style.background.enabled;

    if (isDragging || !legendState.dragPosition) {
      return;
    }

    const normalizedPosition = normalizeLegendDragPosition(
      legendState.dragPosition,
      untrack(() => formatState.gridEnabled)
    );

    if (!arePointsEqual(normalizedPosition, legendState.dragPosition)) {
      legendActions.setDragPosition(normalizedPosition);
    }
  });

  function stopDragging(): void {
    isDragging = false;
    setStylingToolPopoverDragging(false);
    window.removeEventListener(EVENT.POINTERMOVE, handlePointerMove);
    window.removeEventListener(EVENT.POINTERUP, handlePointerUp);
  }

  function handlePointerUp(): void {
    stopDragging();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!isDragging || !overlayElement) {
      return;
    }

    const scale = getPageScale();
    const rect = overlayElement.getBoundingClientRect();
    const position = normalizeLegendDragPosition({
      x: (event.clientX - rect.left) / scale - dragOffsetX,
      y: (event.clientY - rect.top) / scale - dragOffsetY
    });

    legendActions.setDragPosition(position);
  }

  function handleLegendPointerDown(event: PointerEvent): void {
    if (!isLegendActive) {
      return;
    }

    if (!overlayElement || !legendElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const scale = getPageScale();
    const overlayRect = overlayElement.getBoundingClientRect();
    const legendRect = legendElement.getBoundingClientRect();

    const currentX = (legendRect.left - overlayRect.left) / scale;
    const currentY = (legendRect.top - overlayRect.top) / scale;
    const dragPosition = normalizeLegendDragPosition(
      legendState.dragPosition ?? {
        x: currentX,
        y: currentY
      }
    );

    if (!arePointsEqual(dragPosition, legendState.dragPosition)) {
      legendActions.setDragPosition(dragPosition);
    }

    dragOffsetX = (event.clientX - overlayRect.left) / scale - dragPosition.x;
    dragOffsetY = (event.clientY - overlayRect.top) / scale - dragPosition.y;

    isDragging = true;
    setStylingToolPopoverDragging(true);
    window.addEventListener(EVENT.POINTERMOVE, handlePointerMove);
    window.addEventListener(EVENT.POINTERUP, handlePointerUp);
  }

  function handleLegendClick(event: MouseEvent | KeyboardEvent): void {
    event.stopPropagation();
    legendActions.markAsOpened();
    activateStylingToolFromMap(StylingTools.Legend);
  }

  function centerLegendInViewport(target: EventTarget | null): void {
    const targetElement =
      target instanceof HTMLElement ? target : legendElement;
    const delta = getElementCenteringDelta(
      getFocusViewportElement(overlayElement),
      targetElement
    );

    if (!delta) {
      return;
    }

    if (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5) {
      return;
    }

    globalActions.panPageBy(delta.x, delta.y);
  }

  function resetLegendCentering(): void {
    if (!isLegendCentered) {
      return;
    }

    isLegendCentered = false;
    globalActions.resetPagePan();
  }

  function handleLegendFocusClick(event: MouseEvent): void {
    handleLegendClick(event);
    isLegendCentered = true;

    const currentTarget = event.currentTarget;
    if (currentTarget instanceof HTMLElement) {
      currentTarget.focus({ preventScroll: true });
    }

    void tick().then(() => {
      centerLegendInViewport(currentTarget);
    });
  }

  function handleLegendBlur(): void {
    resetLegendCentering();
  }

  function handleLegendKeyDown(event: KeyboardEvent): void {
    if (event.key !== KEY.ENTER && event.key !== KEY.SPACE) {
      return;
    }

    event.preventDefault();
    handleLegendClick(event);
    isLegendCentered = true;
    void tick().then(() => {
      centerLegendInViewport(event.currentTarget);
    });
  }

  $effect(() => {
    if (!isLegendCentered) {
      return;
    }

    if (hidden || !legendState.visible || visibleItems.length === 0) {
      resetLegendCentering();
      return;
    }

    if (!isLegendActive) {
      resetLegendCentering();
    }
  });

  onDestroy(() => {
    isLegendCentered = false;
    stopDragging();
  });
</script>

{#if legendState.visible && visibleItems.length > 0}
  <div
    class="legend-overlay"
    class:hidden={hidden}
    class:inline={inline}
    bind:this={overlayElement}
  >
    <div
      bind:this={legendElement}
      class="legend-container {positionClass}"
      class:draggable={isLegendActive}
      class:dragging={isDragging}
      data-workspace-pan-ignore="true"
      style={containerStyle}
      role="button"
      tabindex="0"
      aria-label={m.tool_legend()}
      ondblclick={handleLegendFocusClick}
      onblur={handleLegendBlur}
      onkeydown={handleLegendKeyDown}
      onpointerdown={handleLegendPointerDown}
    >
      {#each visibleItems as item (item.id)}
        {@const viz = vizByItemId.get(item.id)}
        {@const legendSegments = getLegendSegments(item, viz)}
        <div class="legend-item">
          {#if legendSegments.length > 0}
            {#each legendSegments as segment (segment.key)}
              <LegendSvg
                markup={segment.svg.markup}
                width={segment.svg.width}
                height={segment.svg.height}
                class={segment.className}
                textColor={textHex}
              />
            {/each}
          {:else}
            {#if item.title}
              <h4 class="legend-title">{item.title}</h4>
            {/if}
            {#if item.subtitle}
              <p class="legend-subtitle">{item.subtitle}</p>
            {/if}
            {#if item.note}
              <p class="legend-note">{item.note}</p>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .legend-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: var(--z-content);
  }

  .legend-overlay.hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  :global(.is-exporting-map) .legend-overlay.hidden {
    opacity: 1;
    visibility: visible;
  }

  /* Per-facet anchored legend: fills its cell and pins the legend to the
     bottom-right corner of the map, without viewport-absolute positioning. */
  .legend-overlay.inline {
    position: absolute;
    inset: 0;
  }

  .legend-overlay.inline .legend-container {
    position: absolute;
    right: 6px;
    bottom: 6px;
    cursor: default;
    pointer-events: none;
  }

  .legend-container {
    --legend-page-scale: 1;
    --legend-padding-inline: 0px;
    --legend-padding-block: 0px;
    --legend-item-gap: 4px;
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: var(--legend-item-gap);
    background: transparent;
    padding: var(--legend-padding-block) var(--legend-padding-inline);
    border-radius: 0;
    box-shadow: none;
    max-width: 90%;
    overflow-wrap: anywhere;
    pointer-events: auto;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }

  .legend-container.draggable {
    cursor: grab;
  }

  .legend-container.draggable:hover {
    outline: 1px dashed #726e6e;
  }

  .legend-container.dragging {
    cursor: grabbing;
    user-select: none;
    background-color: var(--cds-layer-hover-01, #f4f4f4) !important;
  }

  .legend-container.top-left {
    top: calc(12px * var(--legend-page-scale));
    left: calc(12px * var(--legend-page-scale));
  }

  .legend-container.top-right {
    top: calc(12px * var(--legend-page-scale));
    right: calc(12px * var(--legend-page-scale));
  }

  .legend-container.bottom-left {
    bottom: calc(12px * var(--legend-page-scale));
    left: calc(12px * var(--legend-page-scale));
  }

  .legend-container.bottom-right {
    bottom: calc(12px * var(--legend-page-scale));
    right: calc(12px * var(--legend-page-scale));
  }

  .legend-container.bottom-center {
    bottom: calc(12px * var(--legend-page-scale));
    left: 50%;
  }

  .legend-item {
    min-width: 0;
    padding-bottom: var(--legend-item-gap);
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }

  .legend-item:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  .legend-title {
    margin: 0 0 3px 0;
    font-size: 1em;
    font-weight: 600;
    color: inherit;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .legend-subtitle {
    margin: 0 0 2px 0;
    color: inherit;
    font-size: 0.9em;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .legend-note {
    margin: 0;
    color: inherit;
    font-size: 0.85em;
    font-style: italic;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  :global(.legend-svg) {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0;
    overflow: visible;
  }
</style>
