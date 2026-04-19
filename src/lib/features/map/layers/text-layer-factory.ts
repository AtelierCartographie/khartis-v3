import { TextLayer } from '@deck.gl/layers';
import type { Color } from '@deck.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  ColorMode,
  DEFAULT_COLORS,
  FillMode,
  SizeMode
} from '$lib/features/main-toolbar/constants';
import { ScaleType } from '$lib/features/commons/store/visualization.store.svelte';
import { DeckLayerId, GeometryType } from '../constants/map.constants';
import type {
  GeometryInfo,
  LayerContext,
  RGBColor,
  ThematicLayer
} from '../types';
import { getColorForValue, getSizeForValue } from '../utils/data-styling.utils';
import {
  createTextCollisionProps,
  createTextLayerData,
  createTextLayerDataFromBinary,
  createThematicLayerId,
  DEFAULT_HALO_WIDTH,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_FONT,
  DEFAULT_TEXT_FONT_SETTINGS,
  DEFAULT_TEXT_MASK_PADDING,
  DEFAULT_TEXT_SIZE,
  filterTextLayerDataByYear,
  getCachedGeoJSON,
  getRepresentativePointSource,
  normalizeOpacity,
  resolveDeckTextFontWeight,
  resolveEffectiveCategoryColorMap,
  resolveMissingTextLabel,
  resolveStyleColor,
  resolveTextAnchor,
  resolveTextDatumText,
  resolveVariableTextSizeBounds,
  TEXT_COLLISION_PRIORITY,
  TEXT_COLLISION_SAFE_PADDING,
  toTextValue,
  TRANSPARENT_BACKGROUND_COLOR,
  type TextLayerDatum
} from './layer-factory';
import { withOpacity } from './layer-helpers';

function requiresRepresentativePointSource(
  geometryType: GeometryInfo['type'] | GeometryType | undefined
): boolean {
  return (
    geometryType === GeometryType.POLYGON ||
    geometryType === GeometryType.MULTIPOLYGON ||
    geometryType === GeometryType.LINESTRING ||
    geometryType === GeometryType.MULTILINESTRING ||
    geometryType === GeometryType.MULTIPOINT
  );
}

export function createTextOverlayLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): ThematicLayer[] {
  const viz = ctx.viz;
  if (!viz?.mapping.labelColumn) {
    return [];
  }

  const textOpacity = normalizeOpacity(viz.style.textOpacity, 1);
  const colorMode = viz.modes?.color ?? ColorMode.UNIQUE;
  const sizeMode = viz.modes?.size ?? SizeMode.FIXED;
  const shouldRenderTextLayer = textOpacity > 0 && colorMode !== ColorMode.NONE;

  if (!shouldRenderTextLayer) {
    return [];
  }

  const isNativeGeoArrow =
    geometryInfo.isNativeGeoArrow ||
    (geometryInfo.encoding && geometryInfo.encoding.startsWith('geoarrow.'));
  let textLayerData: TextLayerDatum[] | null = null;
  let textLayerDataWithSecondary: TextLayerDatum[] | null = null;
  const representativePointSource = getRepresentativePointSource(ctx);
  const textPointSource =
    representativePointSource ??
    (geometryInfo.type === GeometryType.POINT
      ? {
          table: jsTable,
          geometryInfo
        }
      : null);

  if (textPointSource) {
    try {
      textLayerData = createTextLayerDataFromBinary(
        textPointSource.table,
        textPointSource.geometryInfo,
        viz.mapping.labelColumn,
        undefined,
        ctx.customProjection
      );
      if (viz.mapping.secondaryLabelColumn) {
        textLayerDataWithSecondary = createTextLayerDataFromBinary(
          textPointSource.table,
          textPointSource.geometryInfo,
          viz.mapping.labelColumn,
          viz.mapping.secondaryLabelColumn,
          ctx.customProjection
        );
      }
    } catch {
      textLayerData = null;
      textLayerDataWithSecondary = null;
    }
  }

  if (
    !textLayerData &&
    isNativeGeoArrow &&
    requiresRepresentativePointSource(geometryInfo.type)
  ) {
    return [];
  }

  // Fallback: GeoJSON conversion (for WKB/GeoJSON-encoded data, or if binary failed)
  if (!textLayerData) {
    let geojsonData: FeatureCollection | null;
    try {
      geojsonData = getCachedGeoJSON(jsTable, geometryInfo.geoColumn);
    } catch (error) {
      logger.warn(
        'Failed to convert geometry for text overlays, skipping labels/texts',
        LogCategory.MAP,
        {
          datasetId: ctx.datasetId,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      return [];
    }
    if (!geojsonData) return [];
    textLayerData = createTextLayerData(geojsonData, viz.mapping.labelColumn);
    if (viz.mapping.secondaryLabelColumn) {
      textLayerDataWithSecondary = createTextLayerData(
        geojsonData,
        viz.mapping.labelColumn,
        viz.mapping.secondaryLabelColumn
      );
    }
  }

  const layers: ThematicLayer[] = [];
  const textColor = resolveStyleColor(viz.style.textColor, DEFAULT_TEXT_COLOR);
  const missingTextColor = resolveStyleColor(
    viz.missingData?.color,
    hexToRgb(DEFAULT_COLORS.missingData)
  );
  const missingTextLabel = resolveMissingTextLabel(viz.missingData?.label);
  const textBaseSize = viz.style.textSize ?? DEFAULT_TEXT_SIZE;
  const variableTextSizeColumn = viz.mapping.sizeColumn;
  const variableTextSizeVector = variableTextSizeColumn
    ? jsTable.getChild(variableTextSizeColumn)
    : null;
  const canApplyVariableTextSize =
    sizeMode === SizeMode.PROPORTIONAL &&
    !!variableTextSizeColumn &&
    !!variableTextSizeVector;
  const { minSize: minTextSize, maxSize: maxTextSize } =
    resolveVariableTextSizeBounds(textBaseSize);
  const labelValueVector = jsTable.getChild(viz.mapping.labelColumn);
  const categoryVector = viz.mapping.categoryColumn
    ? jsTable.getChild(viz.mapping.categoryColumn)
    : null;
  const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
    jsTable,
    viz,
    ctx.categoryColorMap,
    viz.mapping.categoryColumn
  );

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
    opacity: number
  ) => {
    if (!vector || !effectiveCategoryColorMap?.size) {
      return withOpacity(fallback, opacity);
    }

    return (datum: TextLayerDatum): Color => {
      const category = toTextValue(vector.get(datum.rowIndex));
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

    return (datum: TextLayerDatum): number => {
      const rawValue = variableTextSizeVector.get(datum.rowIndex);
      const numericValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);

      if (!Number.isFinite(numericValue)) {
        return defaultSize;
      }

      return getSizeForValue(
        numericValue,
        ctx.statistics.min,
        ctx.statistics.max,
        minTextSize,
        maxTextSize,
        ScaleType.SQRT
      );
    };
  };

  const textSizeAccessor = createTextSizeAccessor(textBaseSize);

  if (shouldRenderTextLayer) {
    const textSource = textLayerDataWithSecondary ?? textLayerData;
    if (!textSource) return layers;
    const textData = filterTextLayerDataByYear(
      textSource.filter(
        (datum) => !datum.isMissingData || (viz.missingData?.show ?? true)
      ),
      jsTable,
      ctx.yearFilter
    );
    if (textData.length > 0) {
      const textLayerId = createThematicLayerId(DeckLayerId.TEXT_LAYER, ctx);
      const baseTextColorAccessor =
        colorMode === ColorMode.CLASSES
          ? createChoroplethTextColorAccessor(
              labelValueVector,
              viz.classification?.breaks,
              viz.classification?.colors,
              textColor,
              textOpacity
            )
          : colorMode === ColorMode.CATEGORIES
            ? createCategoricalTextColorAccessor(
                categoryVector,
                textColor,
                textOpacity
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
          getTextAnchor: resolveTextAnchor(viz.style.textAlign),
          getAlignmentBaseline: 'center',
          fontFamily: DEFAULT_TEXT_FONT,
          fontWeight: resolveDeckTextFontWeight(
            viz.style.textBold ? '700' : '400',
            viz.style.textItalic
          ),
          characterSet: 'auto',
          fontSettings: DEFAULT_TEXT_FONT_SETTINGS,
          outlineColor: withOpacity(
            resolveStyleColor(viz.style.textHaloColor, [255, 255, 255]),
            1
          ),
          outlineWidth: viz.style.textHalo
            ? (viz.style.textHaloWidth ?? DEFAULT_HALO_WIDTH)
            : 0,
          background: true,
          getBackgroundColor: viz.style.textDxpMasking
            ? withOpacity(
                resolveStyleColor(viz.style.textHaloColor, [255, 255, 255]),
                1
              )
            : viz.modes?.fill === FillMode.UNIQUE &&
                typeof viz.style.fillColor === 'string'
              ? withOpacity(
                  hexToRgb(viz.style.fillColor),
                  normalizeOpacity(viz.style.fillOpacity, 1)
                )
              : TRANSPARENT_BACKGROUND_COLOR,
          getBorderWidth: 0,
          backgroundPadding:
            viz.style.textDxpMasking || viz.modes?.fill === FillMode.UNIQUE
              ? DEFAULT_TEXT_MASK_PADDING
              : TEXT_COLLISION_SAFE_PADDING,
          backgroundBorderRadius: 2,
          ...createTextCollisionProps(
            ctx,
            viz.style.textCollisionDetection ?? true,
            TEXT_COLLISION_PRIORITY
          ),
          billboard: true,
          pickable: false,
          ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
          ...(ctx.beforeId && { beforeId: ctx.beforeId }),
          updateTriggers: {
            getText: [
              viz.mapping.labelColumn,
              viz.mapping.secondaryLabelColumn,
              viz.missingData?.show,
              viz.missingData?.label
            ],
            getColor: [
              colorMode,
              viz.mapping.labelColumn,
              viz.mapping.categoryColumn,
              viz.classification?.breaks,
              viz.classification?.colors,
              viz.classification?.labels,
              viz.style.textColor,
              textOpacity,
              viz.missingData?.color
            ],
            getSize: [
              viz.style.textSize,
              sizeMode,
              variableTextSizeColumn,
              ctx.statistics.min,
              ctx.statistics.max
            ],
            getTextAnchor: [viz.style.textAlign],
            outlineColor: [viz.style.textHaloColor],
            outlineWidth: [viz.style.textHalo, viz.style.textHaloWidth],
            getBackgroundColor: [
              viz.style.textDxpMasking,
              viz.style.textHaloColor,
              viz.modes?.fill,
              viz.style.fillColor,
              viz.style.fillOpacity
            ]
          }
        }) as ThematicLayer
      );
    }
  }

  return layers;
}
