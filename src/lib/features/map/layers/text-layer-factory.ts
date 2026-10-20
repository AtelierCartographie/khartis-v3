import type { Color, Layer } from '@deck.gl/core';
import { TextLayer } from '@deck.gl/layers';
import type { TextLayerProps } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';

import {
  ColorMode,
  DEFAULT_COLORS,
  ShapeType,
  SizeMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';
import {
  getPrimitiveClassification,
  getSymbolPrimitive,
  getTextPrimitive,
  PrimitiveFilterType,
  ScaleType
} from '$lib/features/commons/stores/visualization.store.svelte';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  computeTextLines,
  measureTextWidth
} from '$lib/features/commons/utils/text-measure.utils';

import { DeckLayerId, GeometryType } from '../constants';
import type {
  GeometryInfo,
  LayerContext,
  RGBColor,
  ThematicLayer
} from '../types';
import {
  getAbsoluteDomainMax,
  getClassedSizeForValue,
  getColorForValue,
  getProportionalSymbolSizeForValue,
  shouldApplyCategorical,
  shouldApplyChoropleth,
  shouldApplyProportionalSymbols
} from '../utils/data-styling.utils';
import { labelLayoutStore } from '../stores/label-layout.store.svelte';
import {
  computeLabelLeader,
  resolveLabelAlignment,
  type LabelOffset
} from '../utils/label-layout.utils';
import {
  resolveLabelStack,
  resolveManualLabelPlacement,
  resolveTextLabelPlacement,
  type LabelStackParams
} from '../utils/text-label-placement.utils';
import {
  LabelLeaderLayer,
  type LabelLeaderSegment
} from './label-leader-layer';
import { sortBySizeDescending, withOpacity } from './layer-helpers';
import {
  isMissingThematicValue,
  resolvePointMissingColumn
} from './layer-highlight.utils';
import { createThematicLayerId } from './layer-id.utils';
import { getTextRepresentativePointSource } from './layer-source.utils';
import { normalizeOpacity, resolvePageDisplayScale } from './layer-style.utils';
import {
  buildSplitDatasetRowMapping,
  hasSplitRenderingContext,
  resolveScopedAttributeTable,
  resolveScopedRowIds,
  resolveSplitMappingFeatureIdColumn
} from './split-rendering-accessors';
import {
  resolveProportionalSymbolScale,
  resolveSymbolMissingDataStyle
} from './symbol-layer.utils';
import {
  DEFAULT_TEXT_LINE_HEIGHT,
  extendTextCharacterSet,
  resolveTextFontSettings,
  resolveTextOutlineWidth
} from './text-character-set';
import {
  collectTextLayerGlyphs,
  createTextLayerDataFromBinary,
  keepTextDataInRowScope,
  resolveAccessorValue,
  resolveMissingTextLabel,
  resolveTextAnchor,
  resolveTextDatumText,
  resolveVariableTextSizeBounds,
  resolveVerticalPadding,
  toTextValue,
  type TextLayerDatum
} from './text-layer-data.utils';
import {
  DEFAULT_HALO_WIDTH,
  DEFAULT_LABEL_COLOR,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_MASK_PADDING,
  DEFAULT_TEXT_SIZE,
  TEXT_COLLISION_SAFE_PADDING,
  TRANSPARENT_BACKGROUND_COLOR,
  resolveDeckTextFontFamily,
  resolveDeckTextFontWeight
} from './text-layer-style.utils';
import { THEMATIC_OVERLAY_PARAMETERS } from './polygon-pattern-layer.utils';
import {
  resolveEffectiveCategoryColorMap,
  resolveStyleColor
} from './layer-color.utils';

const LABEL_MAX_WIDTH_EM = 10;
const LABEL_LEADER_WIDTH_PX = 0.75;
const LABEL_LEADER_MIN_GAP_PX = 6;
const LABEL_LEADER_MIN_GAP_EM = 0.5;
const LABEL_LEADER_SYMBOL_GAP_PX = 3;
// No glyph is wider than an em, so a label this short never wraps at
// LABEL_MAX_WIDTH_EM and its lines need no measuring.
const LABEL_SINGLE_LINE_MAX_CHARACTERS = LABEL_MAX_WIDTH_EM;

/**
 * What the label drag interaction needs from a rendered text layer. It rides
 * on the layer's data array, like `khartisSourceTable`, so a pick on any
 * visualization's labels finds it.
 */
export interface LabelEditingContext {
  vizId: string;
  pageDisplayScale: number;
  resolveFeatureKey: (datum: TextLayerDatum) => string | null;
  hasManualPosition: (datum: TextLayerDatum) => boolean;
  /** Centre of the label block, in page pixels from the anchor. */
  resolveBlockCenter: (datum: TextLayerDatum) => LabelOffset;
  buildDragPreview: (datum: TextLayerDatum, center: LabelOffset) => Layer[];
}

export function getLabelEditingContext(
  layer: Pick<Layer, 'props'> | null | undefined
): LabelEditingContext | null {
  const data = layer?.props.data as
    { khartisLabelEditing?: LabelEditingContext } | undefined;
  return data?.khartisLabelEditing ?? null;
}

function toLeaderColor(color: Color): [number, number, number, number] {
  return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[3] ?? 255];
}

interface LabelTextMetrics {
  lines: number;
  width: number;
}

function isSingleLineLabel(text: string): boolean {
  return (
    text.length <= LABEL_SINGLE_LINE_MAX_CHARACTERS && !text.includes('\n')
  );
}

function measureLabelText(
  text: string,
  size: number,
  fontFamily: string,
  fontWeight: string | number
): LabelTextMetrics {
  const weight = String(fontWeight);
  const lines = computeTextLines(
    text,
    size,
    LABEL_MAX_WIDTH_EM * size,
    fontFamily,
    weight
  );
  return {
    lines: Math.max(1, lines.length),
    width: Math.max(
      0,
      ...lines.map((line) => measureTextWidth(line, size, fontFamily, weight))
    )
  };
}

export function createTextOverlayLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): ThematicLayer[] {
  const viz = ctx.viz;
  const textConfig = getTextPrimitive(viz);
  if (!viz || !textConfig?.enabled || !textConfig.labelColumn) {
    return [];
  }
  if (!fontAssetsStore.ready) {
    return [];
  }
  const pageDisplayScale = resolvePageDisplayScale(ctx);
  const textStatistics = ctx.textStatistics ?? ctx.statistics;

  const secondaryLabelsConfig = textConfig.secondaryLabels;
  const textValueColumn = textConfig.valueColumn;
  const textCategoryColumn = textConfig.categoryColumn;
  const secondaryLabelColumn = secondaryLabelsConfig.enabled
    ? secondaryLabelsConfig.labelColumn
    : undefined;
  const labelOpacity = normalizeOpacity(secondaryLabelsConfig.opacity, 1);
  const textOpacity = normalizeOpacity(textConfig.opacity, 1);
  const colorMode = textConfig.colorMode;
  const sizeMode = textConfig.sizeMode;
  const textClassification =
    getPrimitiveClassification(viz, PrimitiveFilterType.TEXT) ??
    viz.classification;
  const shouldRenderLabelLayer =
    secondaryLabelsConfig.enabled && !!secondaryLabelColumn && labelOpacity > 0;
  const shouldRenderTextLayer = textOpacity > 0 && colorMode !== ColorMode.NONE;

  if (!shouldRenderLabelLayer && !shouldRenderTextLayer) {
    return [];
  }

  let textLayerData: TextLayerDatum[] | null = null;
  let secondaryLabelLayerData: TextLayerDatum[] | null = null;
  const representativePointSource = getTextRepresentativePointSource(ctx);
  // Attributes are read from the SAME table as the geometry so row indices
  // stay aligned.
  const textPointSource =
    representativePointSource ??
    (geometryInfo.type === GeometryType.POINT
      ? { table: jsTable, geometryInfo }
      : null);
  // A label whose row the Texts filter excludes must read as missing, not fall
  // back to the whole dataset.
  const scopedTextTable = resolveScopedAttributeTable(ctx);
  const textAttributeTable =
    scopedTextTable ??
    (representativePointSource ? jsTable : (textPointSource?.table ?? jsTable));
  const textFeatureIdColumn =
    scopedTextTable && textPointSource
      ? resolveSplitMappingFeatureIdColumn(
          textPointSource.table,
          ctx.splitFeatureIdColumn
        )
      : undefined;
  const textAttributeRowByGeometryRow =
    scopedTextTable && textFeatureIdColumn && textPointSource
      ? buildSplitDatasetRowMapping(
          textPointSource.table,
          scopedTextTable,
          textFeatureIdColumn
        )
      : undefined;

  if (textPointSource) {
    try {
      textLayerData = createTextLayerDataFromBinary(
        textPointSource.table,
        textPointSource.geometryInfo,
        textConfig.labelColumn,
        undefined,
        ctx.customProjection,
        textAttributeTable,
        textAttributeRowByGeometryRow
      );
      if (secondaryLabelColumn) {
        secondaryLabelLayerData = createTextLayerDataFromBinary(
          textPointSource.table,
          textPointSource.geometryInfo,
          secondaryLabelColumn,
          undefined,
          ctx.customProjection,
          textAttributeTable,
          textAttributeRowByGeometryRow
        );
      }
    } catch (error) {
      logger.error('Failed to build binary text layer data', LogCategory.MAP, {
        error,
        flow: 'text_binary_layer_data',
        extra: {
          geometryType: geometryInfo.type,
          geoColumn: geometryInfo.geoColumn,
          hasRepresentativePointSource: Boolean(representativePointSource),
          hasSecondaryLabel: Boolean(secondaryLabelColumn)
        }
      });
      textLayerData = null;
      secondaryLabelLayerData = null;
    }
  }

  if (!textLayerData) {
    return [];
  }

  // Split rendering already narrows the attribute table to the Texts scope;
  // a dataset drawn from its own geometry has to drop the rows itself.
  const scopedTextRowIds = hasSplitRenderingContext(ctx)
    ? undefined
    : resolveScopedRowIds(ctx);
  if (scopedTextRowIds) {
    textLayerData = keepTextDataInRowScope(
      textLayerData,
      textAttributeTable,
      scopedTextRowIds
    );
    if (secondaryLabelLayerData) {
      secondaryLabelLayerData = keepTextDataInRowScope(
        secondaryLabelLayerData,
        textAttributeTable,
        scopedTextRowIds
      );
    }
  }

  const vizId = viz.id;
  const labelLayout = labelLayoutStore.layouts[vizId];
  const draggedFeatureKey =
    labelLayoutStore.draggedLabel?.vizId === vizId
      ? labelLayoutStore.draggedLabel.featureKey
      : null;
  // A joined basemap names features by its own id; a dataset drawn from its
  // own geometry by the row id it got at import. Both survive a reload.
  const geometryFeatureIdVector =
    textFeatureIdColumn && textPointSource
      ? textPointSource.table.getChild(textFeatureIdColumn)
      : null;
  const attributeRowIdVector = textAttributeTable.getChild(INTERNAL_COLUMN.ID);
  const featureKeyByDatum = new Map<TextLayerDatum, string | null>();
  const resolveFeatureKey = (datum: TextLayerDatum): string | null => {
    const cached = featureKeyByDatum.get(datum);
    if (cached !== undefined) return cached;
    const featureId = geometryFeatureIdVector?.get(datum.featureId);
    const rowId = attributeRowIdVector?.get(datum.rowIndex);
    const key =
      featureId !== null && featureId !== undefined
        ? `f:${String(featureId)}`
        : rowId !== null && rowId !== undefined
          ? `r:${String(rowId)}`
          : null;
    featureKeyByDatum.set(datum, key);
    return key;
  };
  const resolveManualCenter = (
    datum: TextLayerDatum
  ): LabelOffset | undefined => {
    if (!labelLayout) return undefined;
    const key = resolveFeatureKey(datum);
    return key ? labelLayoutStore.getOffset(vizId, key) : undefined;
  };
  const isDraggedDatum = (datum: TextLayerDatum): boolean =>
    draggedFeatureKey !== null &&
    resolveFeatureKey(datum) === draggedFeatureKey;

  const layers: ThematicLayer[] = [];
  const labelColor = resolveStyleColor(
    secondaryLabelsConfig.color,
    DEFAULT_LABEL_COLOR
  );
  const textColor = resolveStyleColor(textConfig.color, DEFAULT_TEXT_COLOR);
  const missingTextColor = resolveStyleColor(
    textConfig.missingData?.color,
    hexToRgb(DEFAULT_COLORS.missingData)
  );
  const missingTextLabel = resolveMissingTextLabel(
    textConfig.missingData?.label
  );
  const labelBaseSize = secondaryLabelsConfig.size ?? DEFAULT_TEXT_SIZE;
  const textBaseSize = textConfig.size ?? DEFAULT_TEXT_SIZE;
  const variableTextSizeColumn =
    sizeMode === SizeMode.PROPORTIONAL || sizeMode === SizeMode.CLASSES
      ? textValueColumn
      : undefined;
  const variableTextSizeVector = variableTextSizeColumn
    ? textAttributeTable.getChild(variableTextSizeColumn)
    : null;
  const canApplyVariableTextSize =
    (sizeMode === SizeMode.PROPORTIONAL || sizeMode === SizeMode.CLASSES) &&
    !!variableTextSizeColumn &&
    !!variableTextSizeVector;
  const { minSize: minLabelSize, maxSize: maxLabelSize } =
    resolveVariableTextSizeBounds(labelBaseSize);
  const { minSize: minTextSize, maxSize: maxTextSize } =
    resolveVariableTextSizeBounds(textBaseSize);
  const thematicValueVector = textValueColumn
    ? textAttributeTable.getChild(textValueColumn)
    : null;
  const categoryVector = textCategoryColumn
    ? textAttributeTable.getChild(textCategoryColumn)
    : null;
  const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
    textAttributeTable,
    viz,
    ctx.textCategoryColorMap ?? ctx.categoryColorMap,
    textCategoryColumn,
    PrimitiveFilterType.TEXT
  );
  const textSizeClassCountHint =
    textClassification?.numClasses ?? textClassification?.colors?.length;

  const createChoroplethTextColorAccessor = (
    vector: ReturnType<ArrowTable['getChild']>,
    breaks: number[] | undefined,
    colors: string[] | undefined,
    fallback: RGBColor,
    opacity: number
  ) => {
    if (!vector || !breaks?.length || !colors?.length) {
      return withOpacity(fallback, opacity);
    }

    return (datum: TextLayerDatum): Color => {
      const rawValue = vector.get(datum.rowIndex);
      const numericValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return withOpacity(fallback, opacity);
      }

      const rgb = getColorForValue(numericValue, breaks, colors);
      return withOpacity(rgb, opacity);
    };
  };

  const createCategoricalTextColorAccessor = (
    vector: ReturnType<ArrowTable['getChild']>,
    fallback: RGBColor,
    opacity: number,
    disabledLabels: string[] = []
  ) => {
    if (!vector || !effectiveCategoryColorMap?.size) {
      return withOpacity(fallback, opacity);
    }

    const disabled = new Set(disabledLabels.map(String));
    return (datum: TextLayerDatum): Color => {
      const category = toTextValue(vector.get(datum.rowIndex));
      if (category && disabled.has(category)) {
        return [0, 0, 0, 0];
      }
      const rgb = category
        ? (effectiveCategoryColorMap.get(category) ?? fallback)
        : fallback;
      return withOpacity(rgb, opacity);
    };
  };

  const createTextSizeAccessor = (defaultSize: number) => {
    if (!canApplyVariableTextSize || !variableTextSizeVector) {
      return defaultSize;
    }

    const minSize = defaultSize === labelBaseSize ? minLabelSize : minTextSize;
    const maxSize = defaultSize === labelBaseSize ? maxLabelSize : maxTextSize;

    return (datum: TextLayerDatum): number => {
      if (datum.isMissingData) {
        return defaultSize;
      }
      const rawValue = variableTextSizeVector.get(datum.rowIndex);
      const numericValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);

      if (!Number.isFinite(numericValue)) {
        return defaultSize;
      }

      if (sizeMode === SizeMode.CLASSES && textClassification?.breaks?.length) {
        return getClassedSizeForValue(
          numericValue,
          textClassification.breaks,
          minSize,
          maxSize,
          textSizeClassCountHint
        );
      }

      return getProportionalSymbolSizeForValue(
        numericValue,
        getAbsoluteDomainMax(textStatistics.min, textStatistics.max),
        maxSize,
        ScaleType.SQRT
      );
    };
  };

  // The two label layers name the same feature, so they read one colour rule:
  // a class or a category paints the secondary label exactly as the primary.
  const createTextColorAccessor = (fallback: RGBColor, opacity: number) => {
    if (colorMode === ColorMode.CLASSES) {
      return createChoroplethTextColorAccessor(
        thematicValueVector,
        textClassification?.breaks,
        textClassification?.colors,
        fallback,
        opacity
      );
    }

    if (colorMode === ColorMode.CATEGORIES) {
      return createCategoricalTextColorAccessor(
        categoryVector,
        fallback,
        opacity,
        textClassification?.disabledLabels ?? []
      );
    }

    return withOpacity(fallback, opacity);
  };

  const labelSizeAccessor = createTextSizeAccessor(labelBaseSize);
  const textSizeAccessor = createTextSizeAccessor(textBaseSize);
  const pointStatistics = ctx.pointStatistics ?? ctx.statistics;
  const pointConfig = getSymbolPrimitive(viz);
  const pointValueColumn = pointConfig?.valueColumn;
  const pointSizeColumn = pointConfig?.sizeColumn;
  const pointClassification =
    getPrimitiveClassification(viz, PrimitiveFilterType.POINT) ??
    viz.classification;
  const useProportionalSymbols = shouldApplyProportionalSymbols(viz);
  const useClassedSymbols =
    pointConfig?.mode === SymbolMode.CLASSES &&
    !!pointValueColumn &&
    !!pointClassification?.breaks &&
    pointClassification.breaks.length >= 1;
  const useCategoricalPointColor = shouldApplyCategorical(
    viz,
    PrimitiveFilterType.POINT
  );
  const usePointChoropleth = shouldApplyChoropleth(
    viz,
    PrimitiveFilterType.POINT
  );
  const pointMissingColumn = resolvePointMissingColumn(
    viz,
    useProportionalSymbols,
    useClassedSymbols,
    useCategoricalPointColor,
    usePointChoropleth
  );
  const pointMissingVector = pointMissingColumn
    ? textAttributeTable.getChild(pointMissingColumn)
    : null;
  const pointSizeVector =
    useProportionalSymbols && pointSizeColumn
      ? textAttributeTable.getChild(pointSizeColumn)
      : null;
  const pointValueVector =
    useClassedSymbols && pointValueColumn
      ? textAttributeTable.getChild(pointValueColumn)
      : null;
  const uniquePointRadius = Math.max(1, (pointConfig?.size ?? 10) / 2);
  const minPointRadius = Math.max(1, pointConfig?.minSize ?? 1);
  const maxPointRadius = Math.max(
    minPointRadius,
    pointConfig?.maxSize ?? uniquePointRadius
  );
  const proportionalMaxPointRadius = Math.max(
    0,
    pointConfig?.maxSize ?? uniquePointRadius
  );
  const proportionalSymbolScale = resolveProportionalSymbolScale(
    pointConfig?.shape ?? ShapeType.CIRCLE
  );
  const { show: showMissingPoints, radius: missingPointRadius } =
    resolveSymbolMissingDataStyle(pointConfig, uniquePointRadius);
  const classCountHint =
    pointClassification?.numClasses ?? pointClassification?.colors?.length;
  const hasPointSymbols = Boolean(viz && pointConfig?.enabled);
  const secondaryLabelValueVector = secondaryLabelColumn
    ? textAttributeTable.getChild(secondaryLabelColumn)
    : null;

  const backgroundBorderWidth = 0;
  const backgroundBorderColor = TRANSPARENT_BACKGROUND_COLOR;
  const primaryHaloWidth = textConfig.halo
    ? (textConfig.haloWidth ?? DEFAULT_HALO_WIDTH)
    : 0;
  const secondaryHaloWidth = secondaryLabelsConfig.halo
    ? (secondaryLabelsConfig.haloWidth ?? DEFAULT_HALO_WIDTH)
    : 0;
  const sharedBackgroundPadding = textConfig.dxpMasking
    ? DEFAULT_TEXT_MASK_PADDING
    : TEXT_COLLISION_SAFE_PADDING;
  const backgroundColorAccessor = textConfig.dxpMasking
    ? withOpacity(resolveStyleColor(textConfig.haloColor, [255, 255, 255]), 1)
    : TRANSPARENT_BACKGROUND_COLOR;
  const paddingY = resolveVerticalPadding(sharedBackgroundPadding);
  const resolvePointRadiusForDatum = (datum: TextLayerDatum): number => {
    if (!hasPointSymbols) {
      return 0;
    }

    if (
      pointMissingVector &&
      isMissingThematicValue(pointMissingVector.get(datum.rowIndex))
    ) {
      return showMissingPoints ? missingPointRadius : 0;
    }

    if (
      useClassedSymbols &&
      pointValueVector &&
      pointClassification?.breaks?.length
    ) {
      const rawValue = pointValueVector.get(datum.rowIndex);
      const numericValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return minPointRadius;
      }

      return getClassedSizeForValue(
        numericValue,
        pointClassification.breaks,
        minPointRadius,
        maxPointRadius,
        classCountHint
      );
    }

    if (useProportionalSymbols && pointSizeVector) {
      const rawValue = pointSizeVector.get(datum.rowIndex);
      const numericValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return 0;
      }

      return getProportionalSymbolSizeForValue(
        numericValue,
        getAbsoluteDomainMax(pointStatistics.min, pointStatistics.max),
        proportionalMaxPointRadius,
        proportionalSymbolScale
      );
    }

    return uniquePointRadius;
  };
  const primaryLabelVector = textAttributeTable.getChild(
    textConfig.labelColumn
  );
  // Both label layers name the same row, so stacking reads the texts by row
  // rather than from the datum, whose text depends on the layer.
  const resolveSecondaryLabelText = (rowIndex: number): string | null =>
    shouldRenderLabelLayer && secondaryLabelValueVector
      ? toTextValue(secondaryLabelValueVector.get(rowIndex))
      : null;
  const resolvePrimaryLabelText = (rowIndex: number): string =>
    toTextValue(primaryLabelVector?.get(rowIndex)) ?? missingTextLabel;
  const resolvePrimaryTextAnchor = (datum: TextLayerDatum) =>
    resolvePointRadiusForDatum(datum) > 0
      ? 'start'
      : resolveTextAnchor(textConfig.align);
  const resolveSecondaryTextAnchor = (datum: TextLayerDatum) =>
    resolvePointRadiusForDatum(datum) > 0
      ? 'start'
      : resolveTextAnchor(secondaryLabelsConfig.align);
  // Placement is computed in page pixels; symbols and glyphs both follow the
  // page zoom, so the gap between them has to as well.
  const toDisplayOffset = ([x, y]: [number, number]): [number, number] => [
    x * pageDisplayScale,
    y * pageDisplayScale
  ];

  const primaryFontFamily = resolveDeckTextFontFamily(textConfig.fontFamily);
  const primaryFontWeight = resolveDeckTextFontWeight(
    textConfig.bold ? '700' : '400',
    textConfig.italic
  );
  const secondaryFontFamily = resolveDeckTextFontFamily(
    secondaryLabelsConfig.fontFamily
  );
  const secondaryFontWeight = resolveDeckTextFontWeight(
    secondaryLabelsConfig.bold ? '700' : '400',
    secondaryLabelsConfig.italic
  );
  const textMetricsCache = new Map<string, LabelTextMetrics>();
  const measureText = (
    text: string,
    size: number,
    fontFamily: string,
    fontWeight: string | number,
    needsWidth: boolean
  ): LabelTextMetrics => {
    if (!needsWidth && isSingleLineLabel(text)) {
      return { lines: 1, width: 0 };
    }
    const key = `${fontFamily}|${fontWeight}|${size}|${text}`;
    const cached = textMetricsCache.get(key);
    if (cached) return cached;
    const metrics = measureLabelText(text, size, fontFamily, fontWeight);
    textMetricsCache.set(key, metrics);
    return metrics;
  };
  const resolveTextMetrics = (datum: TextLayerDatum, needsWidth: boolean) => {
    const primarySize = resolveAccessorValue(textSizeAccessor, datum);
    const secondarySize = resolveAccessorValue(labelSizeAccessor, datum);
    const secondaryText = resolveSecondaryLabelText(datum.rowIndex);
    return {
      primary: measureText(
        resolvePrimaryLabelText(datum.rowIndex),
        primarySize,
        primaryFontFamily,
        primaryFontWeight,
        needsWidth
      ),
      primarySize,
      secondary: secondaryText
        ? measureText(
            secondaryText,
            secondarySize,
            secondaryFontFamily,
            secondaryFontWeight,
            needsWidth
          )
        : null,
      secondarySize
    };
  };
  const stackParamsByRow = new Map<number, LabelStackParams>();
  const resolveLabelStackParams = (datum: TextLayerDatum): LabelStackParams => {
    const cached = stackParamsByRow.get(datum.rowIndex);
    if (cached) return cached;
    const metrics = resolveTextMetrics(datum, false);
    const params: LabelStackParams = {
      hasSecondaryLabel: metrics.secondary !== null,
      primaryHeight:
        metrics.primary.lines * metrics.primarySize * DEFAULT_TEXT_LINE_HEIGHT,
      secondaryHeight: metrics.secondary
        ? metrics.secondary.lines *
          metrics.secondarySize *
          DEFAULT_TEXT_LINE_HEIGHT
        : 0
    };
    stackParamsByRow.set(datum.rowIndex, params);
    return params;
  };
  const resolveDefaultPlacement = (datum: TextLayerDatum) =>
    resolveTextLabelPlacement({
      hasPointSymbol: resolvePointRadiusForDatum(datum) > 0,
      pointRadius: resolvePointRadiusForDatum(datum),
      ...resolveLabelStackParams(datum)
    });
  const resolvePrimaryTextWidth = (datum: TextLayerDatum): number =>
    shouldRenderTextLayer ? resolveTextMetrics(datum, true).primary.width : 0;
  const resolveBlockHalfSize = (datum: TextLayerDatum): LabelOffset => {
    const metrics = resolveTextMetrics(datum, true);
    const textWidth = Math.max(
      shouldRenderTextLayer ? metrics.primary.width : 0,
      metrics.secondary?.width ?? 0
    );
    return [
      textWidth / 2 + (sharedBackgroundPadding[0] ?? 0),
      resolveLabelStack(resolveLabelStackParams(datum)).halfHeight + paddingY
    ];
  };
  const placeManualLabel = (datum: TextLayerDatum, center: LabelOffset) => {
    const halfSize = resolveBlockHalfSize(datum);
    const alignment = resolveLabelAlignment(center, halfSize);
    return {
      alignment,
      ...resolveManualLabelPlacement(
        center,
        halfSize[0] - (sharedBackgroundPadding[0] ?? 0),
        alignment,
        resolveLabelStackParams(datum)
      )
    };
  };
  const manualPlacementByRow = new Map<
    number,
    ReturnType<typeof placeManualLabel>
  >();
  const resolveManualPlacement = (datum: TextLayerDatum) => {
    const center = resolveManualCenter(datum);
    if (!center) return undefined;
    const cached = manualPlacementByRow.get(datum.rowIndex);
    if (cached) return cached;
    const placement = placeManualLabel(datum, center);
    manualPlacementByRow.set(datum.rowIndex, placement);
    return placement;
  };
  const resolveDefaultBlockCenter = (datum: TextLayerDatum): LabelOffset => {
    const [offsetX, offsetY] =
      resolveDefaultPlacement(datum).primaryPixelOffset;
    const halfWidth = resolvePrimaryTextWidth(datum) / 2;
    const anchor = resolvePrimaryTextAnchor(datum);
    const centerX =
      anchor === 'start'
        ? offsetX + halfWidth
        : anchor === 'end'
          ? offsetX - halfWidth
          : offsetX;
    const { primaryShift } = resolveLabelStack(resolveLabelStackParams(datum));
    return [centerX, offsetY - primaryShift];
  };
  const leaderColorAccessor = createTextColorAccessor(textColor, textOpacity);
  const buildLeaderSegments = (
    datum: TextLayerDatum,
    center: LabelOffset
  ): LabelLeaderSegment[] => {
    const points = computeLabelLeader({
      center,
      halfSize: resolveBlockHalfSize(datum),
      symbolRadius: resolvePointRadiusForDatum(datum),
      symbolGap: LABEL_LEADER_SYMBOL_GAP_PX,
      minGap: Math.max(
        LABEL_LEADER_MIN_GAP_PX,
        LABEL_LEADER_MIN_GAP_EM * resolveAccessorValue(textSizeAccessor, datum)
      )
    });
    if (!points) return [];
    const color = toLeaderColor(
      datum.isMissingData
        ? withOpacity(missingTextColor, textOpacity)
        : resolveAccessorValue(leaderColorAccessor, datum)
    );
    return points.slice(1).map((target, index) => ({
      position: datum.position,
      source: toDisplayOffset(points[index]),
      target: toDisplayOffset(target),
      color
    }));
  };
  const leaderLayerId = createThematicLayerId(
    DeckLayerId.LABEL_LEADER_LAYER,
    ctx
  );
  const createLeaderLayer = (
    id: string,
    segments: LabelLeaderSegment[]
  ): ThematicLayer =>
    new LabelLeaderLayer<LabelLeaderSegment>({
      id,
      data: segments,
      getSourcePosition: (segment) => segment.position,
      getTargetPosition: (segment) => segment.position,
      getSourcePixelOffset: (segment) => segment.source,
      getTargetPixelOffset: (segment) => segment.target,
      getColor: (segment) => segment.color,
      getWidth: LABEL_LEADER_WIDTH_PX,
      widthUnits: 'pixels',
      widthScale: pageDisplayScale,
      pickable: false,
      parameters: THEMATIC_OVERLAY_PARAMETERS,
      ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
      ...(ctx.beforeId && { beforeId: ctx.beforeId })
    }) as unknown as ThematicLayer;
  let secondaryDatumByFeatureId: Map<number, TextLayerDatum> | null = null;
  const findSecondaryDatum = (
    datum: TextLayerDatum
  ): TextLayerDatum | undefined => {
    if (!shouldRenderLabelLayer || !secondaryLabelLayerData) return undefined;
    secondaryDatumByFeatureId ??= new Map(
      secondaryLabelLayerData
        .filter((candidate) => !candidate.isMissingData)
        .map((candidate) => [candidate.featureId, candidate])
    );
    return secondaryDatumByFeatureId.get(datum.featureId);
  };
  let primaryTextLayer: TextLayer<TextLayerDatum> | null = null;
  let secondaryTextLayer: TextLayer<TextLayerDatum> | null = null;
  const buildLabelDragPreview = (
    datum: TextLayerDatum,
    center: LabelOffset
  ): Layer[] => {
    const preview: Layer[] = [];
    const placement = placeManualLabel(datum, center);
    const segments = buildLeaderSegments(datum, center);
    if (segments.length > 0) {
      preview.push(
        createLeaderLayer(`${leaderLayerId}-drag-preview`, segments)
      );
    }
    const secondaryDatum = findSecondaryDatum(datum);
    if (secondaryTextLayer && secondaryDatum) {
      preview.push(
        secondaryTextLayer.clone({
          id: `${secondaryTextLayer.id}-drag-preview`,
          data: [secondaryDatum],
          getTextAnchor: placement.alignment,
          getPixelOffset: toDisplayOffset(placement.secondaryPixelOffset)
        })
      );
    }
    if (primaryTextLayer) {
      preview.push(
        primaryTextLayer.clone({
          id: `${primaryTextLayer.id}-drag-preview`,
          data: [datum],
          pickable: false,
          getTextAnchor: placement.alignment,
          getPixelOffset: toDisplayOffset(placement.primaryPixelOffset)
        })
      );
    }
    return preview;
  };

  if (labelLayout) {
    const showMissingText = textConfig.missingData?.show ?? true;
    const leaderSegments = textLayerData.flatMap((datum) => {
      const center = resolveManualCenter(datum);
      if (!center || isDraggedDatum(datum)) return [];
      const isRendered = shouldRenderTextLayer
        ? !datum.isMissingData || showMissingText
        : findSecondaryDatum(datum) !== undefined;
      return isRendered ? buildLeaderSegments(datum, center) : [];
    });
    if (leaderSegments.length > 0) {
      layers.push(createLeaderLayer(leaderLayerId, leaderSegments));
    }
  }

  const labelPlacementTriggers = [
    pointConfig?.enabled,
    pointConfig?.mode,
    pointConfig?.size,
    pointConfig?.minSize,
    pointConfig?.maxSize,
    pointConfig?.sizeColumn,
    pointConfig?.valueColumn,
    proportionalSymbolScale,
    pointConfig?.categoryColumn,
    pointMissingColumn,
    pointStatistics.min,
    pointStatistics.max,
    pointConfig?.missingData?.show,
    pointConfig?.missingData?.size,
    textBaseSize,
    labelBaseSize,
    sharedBackgroundPadding,
    pageDisplayScale,
    textConfig.labelColumn,
    textConfig.fontFamily,
    textConfig.bold,
    textConfig.italic,
    secondaryLabelsConfig.fontFamily,
    secondaryLabelsConfig.bold,
    secondaryLabelsConfig.italic,
    sizeMode,
    variableTextSizeColumn,
    textStatistics.max
  ];

  if (shouldRenderLabelLayer && secondaryLabelLayerData) {
    const labelData = sortBySizeDescending(
      secondaryLabelLayerData.filter(
        (datum) => !datum.isMissingData && !isDraggedDatum(datum)
      ),
      (datum) => resolveAccessorValue(labelSizeAccessor, datum)
    );
    if (labelData.length > 0) {
      const labelLayerId = createThematicLayerId(DeckLayerId.LABEL_LAYER, ctx);
      const labelCharacterSet = extendTextCharacterSet(
        collectTextLayerGlyphs(labelData)
      );
      const labelLayerProps: TextLayerProps<TextLayerDatum> = {
        id: labelLayerId,
        data: labelData,
        getPosition: (d) => d.position,
        getText: (d) => d.primaryText ?? '',
        getColor: createTextColorAccessor(labelColor, labelOpacity),
        getSize: labelSizeAccessor,
        sizeUnits: 'pixels',
        sizeScale: pageDisplayScale,
        getTextAnchor: (d) =>
          resolveManualPlacement(d)?.alignment ?? resolveSecondaryTextAnchor(d),
        getAlignmentBaseline: 'center',
        getPixelOffset: (d) =>
          toDisplayOffset(
            (resolveManualPlacement(d) ?? resolveDefaultPlacement(d))
              .secondaryPixelOffset
          ),
        maxWidth: LABEL_MAX_WIDTH_EM,
        fontFamily: resolveDeckTextFontFamily(secondaryLabelsConfig.fontFamily),
        fontWeight: resolveDeckTextFontWeight(
          secondaryLabelsConfig.bold ? '700' : '400',
          secondaryLabelsConfig.italic
        ),
        characterSet: labelCharacterSet,
        fontSettings: resolveTextFontSettings(labelBaseSize * pageDisplayScale),
        lineHeight: DEFAULT_TEXT_LINE_HEIGHT,
        outlineColor: withOpacity(
          resolveStyleColor(secondaryLabelsConfig.haloColor, [255, 255, 255]),
          normalizeOpacity(secondaryLabelsConfig.haloOpacity, 1)
        ),
        outlineWidth: resolveTextOutlineWidth(
          secondaryHaloWidth,
          labelBaseSize
        ),
        background: true,
        getBackgroundColor: backgroundColorAccessor,
        getBorderWidth: backgroundBorderWidth,
        getBorderColor: backgroundBorderColor,
        backgroundPadding: sharedBackgroundPadding,
        backgroundBorderRadius: 2,
        billboard: true,
        pickable: false,
        parameters: THEMATIC_OVERLAY_PARAMETERS,
        ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
        ...(ctx.beforeId && { beforeId: ctx.beforeId }),
        updateTriggers: {
          getText: [secondaryLabelColumn],
          getColor: [
            colorMode,
            textValueColumn,
            textCategoryColumn,
            textClassification?.breaks,
            textClassification?.colors,
            textClassification?.labels,
            textClassification?.disabledLabels,
            secondaryLabelsConfig.color,
            labelOpacity
          ],
          getSize: [
            secondaryLabelsConfig.size,
            sizeMode,
            variableTextSizeColumn,
            textStatistics.max,
            textClassification?.breaks,
            textClassification?.numClasses
          ],
          getTextAnchor: [
            secondaryLabelsConfig.align,
            ...labelPlacementTriggers,
            secondaryLabelColumn,
            labelLayout
          ],
          getPixelOffset: [
            ...labelPlacementTriggers,
            secondaryLabelColumn,
            labelLayout
          ],
          outlineColor: [
            secondaryLabelsConfig.haloColor,
            secondaryLabelsConfig.haloOpacity
          ],
          outlineWidth: [
            secondaryLabelsConfig.halo,
            secondaryLabelsConfig.haloWidth,
            labelBaseSize
          ],
          getBackgroundColor: [textConfig.dxpMasking, textConfig.haloColor],
          getBorderWidth: [],
          getBorderColor: []
        }
      };

      secondaryTextLayer = new TextLayer<TextLayerDatum>(labelLayerProps);
      layers.push(secondaryTextLayer as ThematicLayer);
    }
  }

  if (shouldRenderTextLayer) {
    const textData = sortBySizeDescending(
      textLayerData.filter(
        (datum) =>
          (!datum.isMissingData || (textConfig.missingData?.show ?? true)) &&
          !isDraggedDatum(datum)
      ),
      (datum) => resolveAccessorValue(textSizeAccessor, datum)
    );
    if (textData.length > 0) {
      // Each datum names its attribute row, so hovering a label reads the row
      // it was drawn from, split rendering included.
      const labelEditing: LabelEditingContext = {
        vizId,
        pageDisplayScale,
        resolveFeatureKey,
        hasManualPosition: (datum) => resolveManualCenter(datum) !== undefined,
        resolveBlockCenter: (datum) =>
          resolveManualCenter(datum) ?? resolveDefaultBlockCenter(datum),
        buildDragPreview: buildLabelDragPreview
      };
      Object.assign(textData, {
        khartisSourceTable: textAttributeTable,
        khartisLabelEditing: labelEditing
      });
      const textLayerId = createThematicLayerId(DeckLayerId.TEXT_LAYER, ctx);
      const textCharacterSet = extendTextCharacterSet(
        collectTextLayerGlyphs(textData, [missingTextLabel])
      );
      const baseTextColorAccessor = createTextColorAccessor(
        textColor,
        textOpacity
      );
      const textColorAccessor = (datum: TextLayerDatum): Color => {
        if (datum.isMissingData) {
          return withOpacity(missingTextColor, textOpacity);
        }

        return typeof baseTextColorAccessor === 'function'
          ? baseTextColorAccessor(datum)
          : baseTextColorAccessor;
      };

      primaryTextLayer = new TextLayer<TextLayerDatum>({
        id: textLayerId,
        data: textData,
        getPosition: (d) => d.position,
        getText: (d) => resolveTextDatumText(d, missingTextLabel),
        getColor: textColorAccessor,
        getSize: textSizeAccessor,
        sizeUnits: 'pixels',
        sizeScale: pageDisplayScale,
        getTextAnchor: (d) =>
          resolveManualPlacement(d)?.alignment ?? resolvePrimaryTextAnchor(d),
        getAlignmentBaseline: 'center',
        getPixelOffset: (d) =>
          toDisplayOffset(
            (resolveManualPlacement(d) ?? resolveDefaultPlacement(d))
              .primaryPixelOffset
          ),
        maxWidth: LABEL_MAX_WIDTH_EM,
        fontFamily: resolveDeckTextFontFamily(textConfig.fontFamily),
        fontWeight: resolveDeckTextFontWeight(
          textConfig.bold ? '700' : '400',
          textConfig.italic
        ),
        characterSet: textCharacterSet,
        fontSettings: resolveTextFontSettings(textBaseSize * pageDisplayScale),
        lineHeight: DEFAULT_TEXT_LINE_HEIGHT,
        outlineColor: withOpacity(
          resolveStyleColor(textConfig.haloColor, [255, 255, 255]),
          normalizeOpacity(textConfig.haloOpacity, 1)
        ),
        outlineWidth: resolveTextOutlineWidth(primaryHaloWidth, textBaseSize),
        background: true,
        getBackgroundColor: backgroundColorAccessor,
        getBorderWidth: backgroundBorderWidth,
        getBorderColor: backgroundBorderColor,
        backgroundPadding: sharedBackgroundPadding,
        backgroundBorderRadius: 2,
        billboard: true,
        pickable: true,
        parameters: THEMATIC_OVERLAY_PARAMETERS,
        ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
        ...(ctx.beforeId && { beforeId: ctx.beforeId }),
        updateTriggers: {
          getText: [
            textConfig.labelColumn,
            textConfig.missingData?.show,
            textConfig.missingData?.label
          ],
          getColor: [
            colorMode,
            textValueColumn,
            textCategoryColumn,
            textClassification?.breaks,
            textClassification?.colors,
            textClassification?.labels,
            textClassification?.disabledLabels,
            textConfig.color,
            textOpacity,
            textConfig.missingData?.color
          ],
          getSize: [
            textConfig.size,
            sizeMode,
            variableTextSizeColumn,
            textStatistics.max,
            textClassification?.breaks,
            textClassification?.numClasses
          ],
          getTextAnchor: [
            textConfig.align,
            ...labelPlacementTriggers,
            secondaryLabelColumn,
            labelLayout
          ],
          getPixelOffset: [
            ...labelPlacementTriggers,
            secondaryLabelColumn,
            labelLayout
          ],
          outlineColor: [textConfig.haloColor, textConfig.haloOpacity],
          outlineWidth: [textConfig.halo, textConfig.haloWidth, textBaseSize],
          getBackgroundColor: [textConfig.dxpMasking, textConfig.haloColor],
          getBorderWidth: [],
          getBorderColor: []
        }
      });
      layers.push(primaryTextLayer as ThematicLayer);
    }
  }

  return layers;
}
