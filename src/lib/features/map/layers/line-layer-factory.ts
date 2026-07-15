import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer, PathLayer } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { createPathLayerProps } from '@ateliercartographie/geoarrow-deck-stream';

import {
  DEFAULT_COLORS,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  getEnabledPrimitiveFilters,
  getLinePrimitive,
  getLineThicknessClassification,
  getPrimitiveClassification,
  type PrimitiveFilter,
  PrimitiveFilterType,
  ScaleType,
  VisualizationType
} from '$lib/features/commons/stores/visualization.store.svelte';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import * as m from '$lib/paraglide/messages';

import { ArrowExtension, DeckLayerId } from '../constants';
import type { DeckDataRow, GeometryInfo, LayerContext } from '../types';
import {
  shouldApplyLineCategorical,
  shouldApplyLineChoropleth
} from '../utils/data-styling.utils';
import {
  pathColorAttr,
  pathWidthAttr
} from '../utils/geoarrow-stream-bridge.utils';
import { resolveHoverHighlightProps } from '../utils/hover-highlight-props.utils';
import {
  createCategoricalColorAccessor,
  createChoroplethColorAccessor,
  createClassedSizeAccessor,
  createGeoJsonCategoricalColorAccessor,
  createGeoJsonChoroplethColorAccessor,
  createGeoJsonClassedSizeAccessor,
  createGeoJsonProportionalSizeAccessor,
  createProportionalSizeAccessor,
  resolveMissingDataRenderProps,
  withGeoJsonRowHighlight,
  withGeoJsonRowHighlightAccessor,
  withOpacity,
  withOpacityPreservingAlpha,
  withRowHighlight,
  withRowHighlightAccessor
} from './layer-helpers';
import {
  getCachedGeoJSON,
  getCachedProjectedGeoJSON
} from './layer-geojson-cache';
import { resolvePathParser } from './layer-geometry-parsers';
import { HIGHLIGHT_DIMMING_FACTOR } from './layer-highlight.utils';
import { createThematicLayerId } from './layer-id.utils';
import { attachBinaryPickingMetadata } from './layer-source.utils';
import {
  DASH_EXTENSION,
  isMissingLineCategoryValue,
  isMissingLineNumericValue,
  resolvePageDisplayScale,
  resolveThematicStrokeCapRounded,
  resolveThematicStrokeDashArray
} from './layer-style.utils';
import { orderPrimitiveLayers } from './primitive-layer-order';
import { resolveEffectiveCategoryColorMap } from './layer-color.utils';
import { createSplitAwareRowAccessor as ctxRowAccessor } from './split-rendering-accessors';

export function createLineLayerStack(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext,
  representativePointLayers: Layer<DeckDataRow>[]
): Layer<DeckDataRow>[] {
  const {
    viz,
    fillColor,
    fillOpacity: rawLineFillOpacity,
    strokeWidth,
    statistics,
    categoryColorMap,
    highlightedRowIds: lineHighlightedRowIds,
    modelMatrix,
    beforeId
  } = ctx;
  const pageDisplayScale = resolvePageDisplayScale(ctx);
  const lineStatistics = ctx.lineStatistics ?? statistics;
  const lineCategoryColorMap = ctx.lineCategoryColorMap ?? categoryColorMap;

  const lineConfig = viz ? getLinePrimitive(viz) : undefined;
  const lineValueColumn = lineConfig?.valueColumn;
  const lineCategoryColumn = lineConfig?.categoryColumn;
  const lineSizeColumn = lineConfig?.sizeColumn;
  const styleLineColor = lineConfig?.color;
  const resolvedLineColor =
    typeof styleLineColor === 'string' ? hexToRgb(styleLineColor) : fillColor;
  const styleLineOpacity = lineConfig?.opacity;
  const normalizedLineOpacity =
    typeof styleLineOpacity === 'number'
      ? styleLineOpacity > 1
        ? styleLineOpacity / 100
        : styleLineOpacity
      : rawLineFillOpacity;
  const resolvedLineWidth = lineConfig?.width ?? strokeWidth;
  const lineDashed = lineConfig?.dashed ?? false;
  const lineDashArray = lineDashed
    ? resolveThematicStrokeDashArray(lineConfig?.dashedPattern)
    : ([0, 0] as [number, number]);
  const lineCapRounded =
    lineDashed && resolveThematicStrokeCapRounded(lineConfig?.dashedPattern);

  const hasLineHighlights =
    lineHighlightedRowIds && lineHighlightedRowIds.size > 0;
  const hlVersion = ctx.highlightVersion ?? 0;
  const {
    geoColumn,
    encoding: arrowExtension,
    isNativeGeoArrow
  } = geometryInfo;
  const lineColorClassification = viz
    ? (getPrimitiveClassification(viz, PrimitiveFilterType.LINE) ??
      viz.classification)
    : undefined;
  const lineThicknessClassification = viz
    ? getLineThicknessClassification(viz)
    : undefined;
  const useChoropleth = viz && shouldApplyLineChoropleth(viz);
  const useCategoricalColor = viz && shouldApplyLineCategorical(viz);
  const useProportionalWidth =
    !!lineSizeColumn &&
    (lineConfig?.thicknessMode !== undefined
      ? lineConfig.thicknessMode === ThicknessMode.PROPORTIONAL
      : viz?.type === VisualizationType.PROPORTIONAL);
  const useClassedWidth =
    lineConfig?.thicknessMode === ThicknessMode.CLASSES &&
    !!lineValueColumn &&
    !!lineThicknessClassification?.breaks &&
    lineThicknessClassification.breaks.length >= 1;
  const usesVariableLineWidth = useProportionalWidth || useClassedWidth;
  const { min: minValue, max: maxValue } = lineStatistics;
  const resolvedSizeScale = viz?.symbols?.sizeScale ?? ScaleType.LINEAR;
  const maxLineWidth = lineConfig?.maxWidth ?? resolvedLineWidth;
  const lineMissingData = lineConfig?.missingData;
  const lineHasMissingDataStyle =
    !!lineMissingData &&
    (useChoropleth || useCategoricalColor || usesVariableLineWidth);
  const { color: lineMissingColor, show: showLineMissingData } =
    resolveMissingDataRenderProps(
      lineConfig,
      hexToRgb(DEFAULT_COLORS.missingData)
    );
  const lineMissingColorTuple = withOpacity(
    lineMissingColor,
    showLineMissingData ? normalizedLineOpacity : 0
  ) as [number, number, number, number];
  const lineMissingWidth = showLineMissingData
    ? (lineMissingData?.size ?? resolvedLineWidth)
    : 0;
  const lineMissingDashArray =
    showLineMissingData && lineMissingData?.dashed
      ? resolveThematicStrokeDashArray(lineMissingData.dashedPattern)
      : lineDashArray;
  const usesMissingLineDash =
    lineHasMissingDataStyle &&
    showLineMissingData &&
    (lineMissingData?.dashed ?? false);
  const lineUsesDashExtension = lineDashed || usesMissingLineDash;

  const lineLayerBaseId = createThematicLayerId(DeckLayerId.LINE_LAYER, ctx);
  const layerId = lineUsesDashExtension
    ? `${lineLayerBaseId}-dashed`
    : `${lineLayerBaseId}-solid`;
  const primitiveFilters = getEnabledPrimitiveFilters(viz);
  const primitiveOrder = ctx.primitiveOrder ?? [
    PrimitiveFilterType.POINT,
    PrimitiveFilterType.LINE
  ];

  const isNativeGeoArrowLine =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_LINESTRING ||
      arrowExtension === ArrowExtension.GEOARROW_MULTILINESTRING);

  if ((isNativeGeoArrowLine || isNativeGeoArrow) && !lineUsesDashExtension) {
    const lineData = resolvePathParser(ctx.customProjection)(jsTable);
    const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
      jsTable,
      viz,
      lineCategoryColorMap,
      lineCategoryColumn,
      PrimitiveFilterType.LINE
    );
    const isMissingLineRow = (row: DeckDataRow): boolean => {
      if (!lineHasMissingDataStyle) return false;
      if (
        useCategoricalColor &&
        lineCategoryColumn &&
        isMissingLineCategoryValue(
          row[lineCategoryColumn],
          effectiveCategoryColorMap
        )
      ) {
        return true;
      }
      if (
        useChoropleth &&
        lineValueColumn &&
        isMissingLineNumericValue(row[lineValueColumn])
      ) {
        return true;
      }
      if (
        useClassedWidth &&
        lineValueColumn &&
        isMissingLineNumericValue(row[lineValueColumn])
      ) {
        return true;
      }
      return (
        useProportionalWidth &&
        !!lineSizeColumn &&
        isMissingLineNumericValue(row[lineSizeColumn])
      );
    };

    const choroplethAccessor =
      useChoropleth && viz
        ? createChoroplethColorAccessor(
            lineValueColumn!,
            lineColorClassification!.breaks!,
            lineColorClassification!.colors!,
            lineMissingColor,
            showLineMissingData
          )
        : null;

    const categoricalAccessor =
      useCategoricalColor && viz
        ? createCategoricalColorAccessor(
            lineCategoryColumn!,
            effectiveCategoryColorMap,
            lineMissingColor,
            showLineMissingData,
            lineColorClassification?.disabledLabels ?? []
          )
        : null;

    const baseColorFn = choroplethAccessor ?? categoricalAccessor;

    const baseLineColorAccessor = baseColorFn
      ? (row: DeckDataRow) =>
          withOpacityPreservingAlpha(
            baseColorFn(row),
            normalizedLineOpacity
          ) as [number, number, number, number]
      : lineHasMissingDataStyle
        ? (row: DeckDataRow) =>
            isMissingLineRow(row)
              ? lineMissingColorTuple
              : (withOpacity(resolvedLineColor, normalizedLineOpacity) as [
                  number,
                  number,
                  number,
                  number
                ])
        : null;

    const lineColorFn =
      hasLineHighlights && lineHighlightedRowIds
        ? baseLineColorAccessor
          ? withRowHighlightAccessor(
              baseLineColorAccessor,
              normalizedLineOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              lineHighlightedRowIds
            )
          : withRowHighlight(
              resolvedLineColor,
              normalizedLineOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              lineHighlightedRowIds
            )
        : baseLineColorAccessor;

    const colorBinaryAttr = lineColorFn
      ? pathColorAttr(lineData, ctxRowAccessor(ctx, jsTable, lineColorFn))
      : null;

    const variableWidthFn =
      useClassedWidth && viz
        ? createClassedSizeAccessor(
            lineValueColumn!,
            lineThicknessClassification!.breaks!,
            1,
            maxLineWidth,
            lineThicknessClassification?.numClasses ??
              lineThicknessClassification?.colors?.length
          )
        : useProportionalWidth && viz
          ? createProportionalSizeAccessor(
              lineSizeColumn!,
              minValue,
              maxValue,
              1,
              maxLineWidth,
              resolvedSizeScale
            )
          : null;
    const widthFn =
      variableWidthFn || lineHasMissingDataStyle
        ? (row: DeckDataRow) =>
            isMissingLineRow(row)
              ? lineMissingWidth
              : (variableWidthFn?.(row) ?? resolvedLineWidth)
        : null;

    const widthBinaryAttr = widthFn
      ? pathWidthAttr(lineData, ctxRowAccessor(ctx, jsTable, widthFn))
      : null;

    const pathProps = createPathLayerProps(lineData);
    const pathBinaryData = pathProps.data as {
      attributes: Record<string, unknown>;
      khartisSourceTable?: ArrowTable;
      featureIds?: Uint32Array;
    };
    attachBinaryPickingMetadata(pathBinaryData, jsTable, lineData, ctx);
    if (colorBinaryAttr) {
      pathBinaryData.attributes.getColor = colorBinaryAttr;
    }
    if (widthBinaryAttr) {
      pathBinaryData.attributes.getWidth = widthBinaryAttr;
    }

    const lineLayer = new PathLayer({
      id: layerId,
      ...(pathProps as unknown as Record<string, unknown>),
      ...(!colorBinaryAttr && {
        getColor: withOpacity(resolvedLineColor, normalizedLineOpacity)
      }),
      extensions: lineDashed ? [DASH_EXTENSION] : [],
      getDashArray: lineDashArray,
      dashJustified: true,
      capRounded: lineCapRounded,
      widthUnits: 'pixels',
      widthScale: pageDisplayScale,
      ...(!widthBinaryAttr && { getWidth: resolvedLineWidth }),
      widthMinPixels: 1,
      pickable: true,
      ...resolveHoverHighlightProps(),
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getColor: [
          useChoropleth,
          useCategoricalColor,
          lineValueColumn,
          lineCategoryColumn,
          lineColorClassification?.breaks,
          lineColorClassification?.colors,
          lineCategoryColorMap,
          lineColorClassification?.labels,
          lineColorClassification?.disabledLabels,
          resolvedLineColor,
          normalizedLineOpacity,
          lineMissingColor,
          showLineMissingData,
          hlVersion
        ],
        getDashArray: [lineDashed, lineConfig?.dashedPattern],
        getWidth: [
          usesVariableLineWidth,
          lineHasMissingDataStyle,
          lineSizeColumn,
          lineValueColumn,
          minValue,
          maxValue,
          lineThicknessClassification?.breaks,
          maxLineWidth,
          resolvedSizeScale,
          resolvedLineWidth,
          lineMissingWidth
        ]
      }
    });

    return orderPrimitiveLayers(
      [
        ...(!viz || primitiveFilters.includes(PrimitiveFilterType.LINE)
          ? [
              {
                primitive: PrimitiveFilterType.LINE as PrimitiveFilter,
                layer: lineLayer
              }
            ]
          : []),
        ...representativePointLayers.map((layer) => ({
          primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
          layer
        }))
      ],
      primitiveOrder
    );
  }

  let lineGeojsonData;
  try {
    const rawGeoJSON = getCachedGeoJSON(jsTable, geoColumn);
    lineGeojsonData = rawGeoJSON
      ? getCachedProjectedGeoJSON(rawGeoJSON, ctx.customProjection)
      : rawGeoJSON;
  } catch (error) {
    logger.error(
      'Failed to read GeoJSON for line layer',
      LogCategory.MAP,
      error
    );
    return [];
  }
  if (!lineGeojsonData) {
    showWarning(
      m.error_geometry_conversion_title(),
      m.error_geometry_conversion_message()
    );
    return [];
  }

  const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
    jsTable,
    viz,
    lineCategoryColorMap,
    lineCategoryColumn,
    PrimitiveFilterType.LINE
  );
  const isMissingLineFeature = (feature: {
    properties?: Record<string, unknown> | null;
  }): boolean => {
    if (!lineHasMissingDataStyle) return false;
    const properties = feature.properties;
    if (
      useCategoricalColor &&
      lineCategoryColumn &&
      isMissingLineCategoryValue(
        properties?.[lineCategoryColumn],
        effectiveCategoryColorMap
      )
    ) {
      return true;
    }
    if (
      useChoropleth &&
      lineValueColumn &&
      isMissingLineNumericValue(properties?.[lineValueColumn])
    ) {
      return true;
    }
    if (
      useClassedWidth &&
      lineValueColumn &&
      isMissingLineNumericValue(properties?.[lineValueColumn])
    ) {
      return true;
    }
    return (
      useProportionalWidth &&
      !!lineSizeColumn &&
      isMissingLineNumericValue(properties?.[lineSizeColumn])
    );
  };

  const baseGeoJsonLineColor =
    useChoropleth && viz
      ? (feature: { properties?: Record<string, unknown> }) =>
          withOpacityPreservingAlpha(
            createGeoJsonChoroplethColorAccessor(
              lineValueColumn!,
              lineColorClassification!.breaks!,
              lineColorClassification!.colors!,
              resolvedLineColor,
              lineMissingColor,
              showLineMissingData
            )(feature),
            normalizedLineOpacity
          ) as [number, number, number, number]
      : useCategoricalColor && viz
        ? (feature: { properties?: Record<string, unknown> }) =>
            withOpacityPreservingAlpha(
              createGeoJsonCategoricalColorAccessor(
                lineCategoryColumn!,
                effectiveCategoryColorMap,
                resolvedLineColor,
                lineMissingColor,
                showLineMissingData,
                lineColorClassification?.disabledLabels ?? []
              )(feature),
              normalizedLineOpacity
            ) as [number, number, number, number]
        : lineHasMissingDataStyle
          ? (feature: { properties?: Record<string, unknown> | null }) =>
              isMissingLineFeature(feature)
                ? lineMissingColorTuple
                : (withOpacity(resolvedLineColor, normalizedLineOpacity) as [
                    number,
                    number,
                    number,
                    number
                  ])
          : null;

  const geoJsonLineColor =
    hasLineHighlights && lineHighlightedRowIds
      ? baseGeoJsonLineColor
        ? withGeoJsonRowHighlightAccessor(
            baseGeoJsonLineColor,
            normalizedLineOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            lineHighlightedRowIds
          )
        : withGeoJsonRowHighlight(
            resolvedLineColor,
            normalizedLineOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            lineHighlightedRowIds
          )
      : (baseGeoJsonLineColor ??
        withOpacity(resolvedLineColor, normalizedLineOpacity));

  const geoJsonVariableLineWidth =
    useClassedWidth && viz
      ? createGeoJsonClassedSizeAccessor(
          lineValueColumn!,
          lineThicknessClassification!.breaks!,
          1,
          maxLineWidth,
          lineThicknessClassification?.numClasses ??
            lineThicknessClassification?.colors?.length,
          resolvedLineWidth
        )
      : useProportionalWidth && viz
        ? createGeoJsonProportionalSizeAccessor(
            lineSizeColumn!,
            minValue,
            maxValue,
            1,
            maxLineWidth,
            resolvedSizeScale,
            resolvedLineWidth
          )
        : resolvedLineWidth;
  const geoJsonLineWidth =
    typeof geoJsonVariableLineWidth === 'function' || lineHasMissingDataStyle
      ? (feature: { properties?: Record<string, unknown> | null }) =>
          isMissingLineFeature(feature)
            ? lineMissingWidth
            : typeof geoJsonVariableLineWidth === 'function'
              ? geoJsonVariableLineWidth(feature)
              : geoJsonVariableLineWidth
      : geoJsonVariableLineWidth;
  const geoJsonDashArray = lineUsesDashExtension
    ? (feature: { properties?: Record<string, unknown> | null }) =>
        isMissingLineFeature(feature) ? lineMissingDashArray : lineDashArray
    : lineDashArray;

  const lineLayer = new GeoJsonLayer({
    id: layerId,
    data: lineGeojsonData,
    stroked: true,
    filled: false,
    getLineColor: geoJsonLineColor,
    extensions: lineUsesDashExtension ? [DASH_EXTENSION] : [],
    getDashArray: geoJsonDashArray,
    dashJustified: true,
    capRounded: lineCapRounded,
    lineWidthUnits: 'pixels',
    lineWidthScale: pageDisplayScale,
    getLineWidth: geoJsonLineWidth,
    lineWidthMinPixels: 1,
    pickable: true,
    ...resolveHoverHighlightProps(),
    ...(modelMatrix && { modelMatrix }),
    ...(beforeId && { beforeId }),
    updateTriggers: {
      getLineColor: [
        useChoropleth,
        useCategoricalColor,
        lineValueColumn,
        lineCategoryColumn,
        lineColorClassification?.breaks,
        lineColorClassification?.colors,
        lineCategoryColorMap,
        lineColorClassification?.labels,
        lineColorClassification?.disabledLabels,
        resolvedLineColor,
        normalizedLineOpacity,
        hlVersion
      ],
      getDashArray: [
        lineDashed,
        lineConfig?.dashedPattern,
        lineMissingData?.dashed,
        lineMissingData?.dashedPattern,
        showLineMissingData
      ],
      getLineWidth: [
        usesVariableLineWidth,
        lineHasMissingDataStyle,
        lineSizeColumn,
        lineValueColumn,
        minValue,
        maxValue,
        lineThicknessClassification?.breaks,
        maxLineWidth,
        resolvedSizeScale,
        resolvedLineWidth,
        lineMissingWidth
      ]
    }
  });

  return orderPrimitiveLayers(
    [
      ...(!viz || primitiveFilters.includes(PrimitiveFilterType.LINE)
        ? [
            {
              primitive: PrimitiveFilterType.LINE as PrimitiveFilter,
              layer: lineLayer
            }
          ]
        : []),
      ...representativePointLayers.map((layer) => ({
        primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
        layer
      }))
    ],
    primitiveOrder
  );
}
