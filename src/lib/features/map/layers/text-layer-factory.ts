import type { Color } from '@deck.gl/core';
import { TextLayer } from '@deck.gl/layers';
import type { TextLayerProps } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';

import {
  ColorMode,
  DEFAULT_COLORS,
  ShapeType,
  SizeMode,
  SLIDER_LIMITS,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
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
import { resolveTextLabelPlacement } from '../utils/text-label-placement.utils';
import { sortBySizeDescending, withOpacity } from './layer-helpers';
import { getCachedGeoJSON } from './layer-geojson-cache';
import {
  isMissingThematicValue,
  resolvePointMissingColumn
} from './layer-highlight.utils';
import { createThematicLayerId } from './layer-id.utils';
import {
  getTextRepresentativePointSource,
  requiresRepresentativePointSource
} from './layer-source.utils';
import { normalizeOpacity, resolvePageDisplayScale } from './layer-style.utils';
import {
  buildSplitDatasetRowMapping,
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
  createTextLayerData,
  createTextLayerDataFromBinary,
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

  const isNativeGeoArrow =
    geometryInfo.isNativeGeoArrow ||
    (geometryInfo.encoding && geometryInfo.encoding.startsWith('geoarrow.'));
  let textLayerData: TextLayerDatum[] | null = null;
  let secondaryLabelLayerData: TextLayerDatum[] | null = null;
  const representativePointSource = getTextRepresentativePointSource(ctx);
  // Raw point datasets render labels from the main table; `textPointTable` is
  // its TEXT-filtered counterpart (built in use-map-layers) so Texts filters
  // apply to labels while Symbols filters stay on the circles. Attributes are
  // read from the SAME table to keep row indices aligned with the geometry.
  const textPointSource =
    representativePointSource ??
    (geometryInfo.type === GeometryType.POINT
      ? {
          table: ctx.textPointTable ?? jsTable,
          geometryInfo
        }
      : null);
  const textAttributeTable =
    ctx.splitDatasetTable ??
    (representativePointSource ? jsTable : (textPointSource?.table ?? jsTable));
  const textFeatureIdColumn =
    ctx.splitDatasetTable && textPointSource
      ? resolveSplitMappingFeatureIdColumn(
          textPointSource.table,
          ctx.splitFeatureIdColumn
        )
      : undefined;
  const textAttributeRowByGeometryRow =
    ctx.splitDatasetTable && textFeatureIdColumn && textPointSource
      ? buildSplitDatasetRowMapping(
          textPointSource.table,
          ctx.splitDatasetTable,
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
      logger.warn(
        'Failed to build binary text layer data; falling back to GeoJSON',
        LogCategory.MAP,
        {
          error,
          flow: 'text_binary_geojson_fallback',
          extra: {
            geometryType: geometryInfo.type,
            geoColumn: geometryInfo.geoColumn,
            hasRepresentativePointSource: Boolean(representativePointSource),
            hasSecondaryLabel: Boolean(secondaryLabelColumn)
          }
        }
      );
      textLayerData = null;
      secondaryLabelLayerData = null;
    }
  }

  if (
    !textLayerData &&
    isNativeGeoArrow &&
    requiresRepresentativePointSource(geometryInfo.type)
  ) {
    return [];
  }

  if (!textLayerData) {
    let geojsonData: FeatureCollection | null;
    try {
      geojsonData = getCachedGeoJSON(jsTable, geometryInfo.geoColumn);
    } catch (error) {
      logger.error(
        'Failed to read GeoJSON for text layer',
        LogCategory.MAP,
        error
      );
      return [];
    }
    if (!geojsonData) return [];
    textLayerData = createTextLayerData(geojsonData, textConfig.labelColumn);
    if (secondaryLabelColumn) {
      secondaryLabelLayerData = createTextLayerData(
        geojsonData,
        secondaryLabelColumn
      );
    }
  }

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
    pointClassification.breaks.length >= 2;
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
  const hasSecondaryLabelForDatum = (datum: TextLayerDatum): boolean =>
    Boolean(
      secondaryLabelValueVector &&
      toTextValue(secondaryLabelValueVector.get(datum.rowIndex))
    );
  const resolvePrimaryPlacement = (datum: TextLayerDatum) =>
    resolveTextLabelPlacement({
      hasPointSymbol: resolvePointRadiusForDatum(datum) > 0,
      pointRadius: resolvePointRadiusForDatum(datum),
      hasSecondaryLabel: hasSecondaryLabelForDatum(datum),
      primarySize: resolveAccessorValue(textSizeAccessor, datum),
      secondarySize: resolveAccessorValue(labelSizeAccessor, datum),
      paddingY
    });
  const resolveSecondaryPlacement = (datum: TextLayerDatum) =>
    resolveTextLabelPlacement({
      hasPointSymbol: resolvePointRadiusForDatum(datum) > 0,
      pointRadius: resolvePointRadiusForDatum(datum),
      hasSecondaryLabel: true,
      primarySize: resolveAccessorValue(textSizeAccessor, datum),
      secondarySize: resolveAccessorValue(labelSizeAccessor, datum),
      paddingY
    });
  const resolvePrimaryTextAnchor = (datum: TextLayerDatum) =>
    resolvePointRadiusForDatum(datum) > 0
      ? 'start'
      : resolveTextAnchor(textConfig.align);
  const resolveSecondaryTextAnchor = (datum: TextLayerDatum) =>
    resolvePointRadiusForDatum(datum) > 0
      ? 'start'
      : resolveTextAnchor(secondaryLabelsConfig.align);

  if (shouldRenderLabelLayer && secondaryLabelLayerData) {
    const labelData = sortBySizeDescending(
      secondaryLabelLayerData.filter((datum) => !datum.isMissingData),
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
        getColor: withOpacity(labelColor, labelOpacity),
        getSize: labelSizeAccessor,
        sizeUnits: 'pixels',
        sizeScale: pageDisplayScale,
        getTextAnchor: resolveSecondaryTextAnchor,
        getAlignmentBaseline: (d) =>
          resolveSecondaryPlacement(d).secondaryAlignmentBaseline,
        getPixelOffset: (d) =>
          resolveSecondaryPlacement(d).secondaryPixelOffset,
        maxWidth: 10,
        fontFamily: resolveDeckTextFontFamily(secondaryLabelsConfig.fontFamily),
        fontWeight: resolveDeckTextFontWeight(
          secondaryLabelsConfig.bold ? '700' : '400',
          secondaryLabelsConfig.italic
        ),
        characterSet: labelCharacterSet,
        fontSettings: resolveTextFontSettings(
          secondaryLabelsConfig.halo &&
            (secondaryLabelsConfig.haloWidth ?? DEFAULT_HALO_WIDTH) > 0
            ? 'halo-on'
            : 'halo-off'
        ),
        lineHeight: DEFAULT_TEXT_LINE_HEIGHT,
        outlineColor: withOpacity(
          resolveStyleColor(secondaryLabelsConfig.haloColor, [255, 255, 255]),
          1
        ),
        outlineWidth: resolveTextOutlineWidth(
          secondaryHaloWidth,
          SLIDER_LIMITS.haloWidth.max
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
          getColor: [secondaryLabelsConfig.color, labelOpacity],
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
            pointConfig?.enabled,
            pointConfig?.mode,
            pointConfig?.size,
            pointConfig?.minSize,
            pointConfig?.maxSize,
            pointConfig?.sizeColumn,
            pointConfig?.valueColumn,
            proportionalSymbolScale,
            pointMissingColumn,
            pointStatistics.min,
            pointStatistics.max
          ],
          getPixelOffset: [
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
            secondaryLabelColumn
          ],
          getAlignmentBaseline: [
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
            sharedBackgroundPadding
          ],
          outlineColor: [secondaryLabelsConfig.haloColor],
          outlineWidth: [
            secondaryLabelsConfig.halo,
            secondaryLabelsConfig.haloWidth
          ],
          getBackgroundColor: [textConfig.dxpMasking, textConfig.haloColor],
          getBorderWidth: [],
          getBorderColor: []
        }
      };

      layers.push(
        new TextLayer<TextLayerDatum>(labelLayerProps) as ThematicLayer
      );
    }
  }

  if (shouldRenderTextLayer) {
    const textData = sortBySizeDescending(
      textLayerData.filter(
        (datum) =>
          !datum.isMissingData || (textConfig.missingData?.show ?? true)
      ),
      (datum) => resolveAccessorValue(textSizeAccessor, datum)
    );
    if (textData.length > 0) {
      const textLayerId = createThematicLayerId(DeckLayerId.TEXT_LAYER, ctx);
      const textCharacterSet = extendTextCharacterSet(
        collectTextLayerGlyphs(textData, [missingTextLabel])
      );
      const baseTextColorAccessor =
        colorMode === ColorMode.CLASSES
          ? createChoroplethTextColorAccessor(
              thematicValueVector,
              textClassification?.breaks,
              textClassification?.colors,
              textColor,
              textOpacity
            )
          : colorMode === ColorMode.CATEGORIES
            ? createCategoricalTextColorAccessor(
                categoryVector,
                textColor,
                textOpacity,
                textClassification?.disabledLabels ?? []
              )
            : withOpacity(textColor, textOpacity);
      const textColorAccessor = (datum: TextLayerDatum): Color => {
        if (datum.isMissingData) {
          return withOpacity(missingTextColor, textOpacity);
        }

        return typeof baseTextColorAccessor === 'function'
          ? baseTextColorAccessor(datum)
          : baseTextColorAccessor;
      };

      layers.push(
        new TextLayer<TextLayerDatum>({
          id: textLayerId,
          data: textData,
          getPosition: (d) => d.position,
          getText: (d) => resolveTextDatumText(d, missingTextLabel),
          getColor: textColorAccessor,
          getSize: textSizeAccessor,
          sizeUnits: 'pixels',
          sizeScale: pageDisplayScale,
          getTextAnchor: resolvePrimaryTextAnchor,
          getAlignmentBaseline: (d) =>
            resolvePrimaryPlacement(d).primaryAlignmentBaseline,
          getPixelOffset: (d) => resolvePrimaryPlacement(d).primaryPixelOffset,
          maxWidth: 10,
          fontFamily: resolveDeckTextFontFamily(textConfig.fontFamily),
          fontWeight: resolveDeckTextFontWeight(
            textConfig.bold ? '700' : '400',
            textConfig.italic
          ),
          characterSet: textCharacterSet,
          fontSettings: resolveTextFontSettings(
            textConfig.halo && (textConfig.haloWidth ?? DEFAULT_HALO_WIDTH) > 0
              ? 'halo-on'
              : 'halo-off'
          ),
          lineHeight: DEFAULT_TEXT_LINE_HEIGHT,
          outlineColor: withOpacity(
            resolveStyleColor(textConfig.haloColor, [255, 255, 255]),
            1
          ),
          outlineWidth: resolveTextOutlineWidth(
            primaryHaloWidth,
            SLIDER_LIMITS.haloWidth.max
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
              pointConfig?.enabled,
              pointConfig?.mode,
              pointConfig?.size,
              pointConfig?.minSize,
              pointConfig?.maxSize,
              pointConfig?.sizeColumn,
              pointConfig?.valueColumn,
              proportionalSymbolScale,
              pointMissingColumn,
              pointStatistics.min,
              pointStatistics.max
            ],
            getPixelOffset: [
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
              secondaryLabelColumn
            ],
            getAlignmentBaseline: [
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
              secondaryLabelColumn
            ],
            outlineColor: [textConfig.haloColor],
            outlineWidth: [textConfig.halo, textConfig.haloWidth],
            getBackgroundColor: [textConfig.dxpMasking, textConfig.haloColor],
            getBorderWidth: [],
            getBorderColor: []
          }
        }) as ThematicLayer
      );
    }
  }

  return layers;
}
