import type { Layer } from '@deck.gl/core';
import { PathLayer } from '@deck.gl/layers';
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
  VisualizationType
} from '$lib/features/commons/stores/visualization.store.svelte';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';

import { ArrowExtension, DeckLayerId } from '../constants';
import type { DeckDataRow, GeometryInfo, LayerContext } from '../types';
import {
  shouldApplyLineCategorical,
  shouldApplyLineChoropleth
} from '../utils/data-styling.utils';
import {
  pathColorAttr,
  pathDashArrayAttr,
  pathWidthAttr
} from '../utils/geoarrow-stream-bridge.utils';
import { resolveHoverHighlightProps } from '../utils/hover-highlight-props.utils';
import {
  createCategoricalColorAccessor,
  createChoroplethColorAccessor,
  createClassedSizeAccessor,
  createProportionalLineWidthAccessor,
  resolveMissingDataRenderProps,
  withOpacity,
  withOpacityPreservingAlpha,
  withRowHighlight,
  withRowHighlightAccessor
} from './layer-helpers';
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
import {
  createSplitAwareRowAccessor as ctxRowAccessor,
  OUT_OF_SCOPE_COLOR,
  OUT_OF_SCOPE_SIZE
} from './split-rendering-accessors';

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
  const { encoding: arrowExtension, isNativeGeoArrow } = geometryInfo;
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
  const maxLineWidth = lineConfig?.maxWidth ?? resolvedLineWidth;
  const lineWidthFloorPixels = useProportionalWidth ? 0 : 1;
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

  if (isNativeGeoArrowLine || isNativeGeoArrow) {
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
      ? pathColorAttr(
          lineData,
          ctxRowAccessor(ctx, jsTable, lineColorFn, OUT_OF_SCOPE_COLOR)
        )
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
          ? createProportionalLineWidthAccessor(
              lineSizeColumn!,
              minValue,
              maxValue,
              maxLineWidth
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
      ? pathWidthAttr(
          lineData,
          ctxRowAccessor(ctx, jsTable, widthFn, OUT_OF_SCOPE_SIZE)
        )
      : null;

    const dashArrayBinaryAttr = usesMissingLineDash
      ? pathDashArrayAttr(
          lineData,
          ctxRowAccessor(
            ctx,
            jsTable,
            (row) =>
              isMissingLineRow(row) ? lineMissingDashArray : lineDashArray,
            lineDashArray
          )
        )
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
    if (dashArrayBinaryAttr) {
      pathBinaryData.attributes.getDashArray = dashArrayBinaryAttr;
    }

    const lineLayer = new PathLayer({
      id: layerId,
      ...(pathProps as unknown as Record<string, unknown>),
      ...(!colorBinaryAttr && {
        getColor: withOpacity(resolvedLineColor, normalizedLineOpacity)
      }),
      extensions: lineUsesDashExtension ? [DASH_EXTENSION] : [],
      ...(!dashArrayBinaryAttr && { getDashArray: lineDashArray }),
      dashJustified: true,
      capRounded: lineCapRounded,
      widthUnits: 'pixels',
      widthScale: pageDisplayScale,
      ...(!widthBinaryAttr && { getWidth: resolvedLineWidth }),
      widthMinPixels: lineWidthFloorPixels,
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
        getDashArray: [
          lineDashed,
          lineConfig?.dashedPattern,
          lineMissingData?.dashed,
          lineMissingData?.dashedPattern,
          showLineMissingData
        ],
        getWidth: [
          usesVariableLineWidth,
          lineHasMissingDataStyle,
          lineSizeColumn,
          lineValueColumn,
          minValue,
          maxValue,
          lineThicknessClassification?.breaks,
          maxLineWidth,
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

  return [];
}
