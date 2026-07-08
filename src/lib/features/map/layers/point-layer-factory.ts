import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';

import {
  CategoryShapeMode,
  DEFAULT_LINEAR_SYMBOL_BAR_WIDTH,
  FillMode,
  SHAPE_ORDINAL,
  ShapeType,
  SymbolMode,
  StrokeMode
} from '$lib/features/commons/constants/visualization.constants';
import type { ClassificationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  getEnabledPrimitiveFilters,
  getPolygonPrimitive,
  getPrimitiveClassification,
  getSymbolFillCategoryColumn,
  getSymbolFillClassification,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  PrimitiveFilterType
} from '$lib/features/commons/stores/visualization.store.svelte';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import * as m from '$lib/paraglide/messages';
import {
  resolveClassificationPatternConfig,
  resolveSingleClassPattern
} from '$lib/features/commons/services/pattern-palette.service';
import { getPatternPaletteAtlas } from './pattern-texture';

import { ArrowExtension, DeckLayerId, GeometryType } from '../constants';
import type {
  DeckDataRow,
  GeometryInfo,
  LayerContext,
  RGBColor,
  ThematicLayer
} from '../types';
import {
  getAbsoluteDomainMax,
  getColorForValue,
  shouldApplyCategorical,
  shouldApplyChoropleth,
  shouldApplyProportionalSymbols,
  shouldHideSymbolFill
} from '../utils/data-styling.utils';
import {
  pointColorAttr,
  pointRadiusAttr,
  rowAccessor
} from '../utils/geoarrow-stream-bridge.utils';
import { resolveHoverHighlightProps } from '../utils/hover-highlight-props.utils';
import { createScatterplotLayerProps } from 'geoarrow-deck-stream';
import type { BinaryPointData } from 'geoarrow-deck-stream';
import {
  cloneScatterBinaryData,
  sortScatterBinaryDataByRadius
} from './binary-scatter-data';
import { createDotDensityLayers } from './density-layer-factory';
import {
  buildCategoryColorMapFromLabels,
  resolveEffectiveCategoryColorMap
} from './layer-color.utils';
import {
  getCachedGeoJSON,
  getCachedProjectedGeoJSON
} from './layer-geojson-cache';
import {
  HIGHLIGHT_DIMMING_FACTOR,
  isMissingThematicValue,
  resolveHighlightedOpacityForRow,
  resolvePointMissingColumn,
  toMutableRgba
} from './layer-highlight.utils';
import { createThematicLayerId } from './layer-id.utils';
import {
  createClassedSizeAccessor,
  createCategoricalColorAccessor,
  createGeoJsonCategoricalColorAccessor,
  createGeoJsonChoroplethColorAccessor,
  createGeoJsonClassedSizeAccessor,
  createGeoJsonProportionalSymbolSizeAccessor,
  createChoroplethColorAccessor,
  createProportionalSymbolSizeAccessor,
  createStrokeClassificationAccessor,
  HIGHLIGHT_FILL_COLOR,
  withGeoJsonRowHighlight,
  withGeoJsonRowHighlightAccessor,
  withOpacity,
  withOpacityPreservingAlpha
} from './layer-helpers';
import { resolvePointParser } from './layer-geometry-parsers';
import {
  attachBinaryPickingMetadata,
  getRepresentativePointSource
} from './layer-source.utils';
import { resolvePageDisplayScale } from './layer-style.utils';
import { THEMATIC_OVERLAY_PARAMETERS } from './polygon-pattern-layer.utils';
import {
  createSplitAwareRowAccessor as ctxRowAccessor,
  hasSplitRenderingContext
} from './split-rendering-accessors';
import {
  buildShapeAttribute,
  resolveCategoryShapeMaps,
  resolveProportionalSymbolScale,
  resolveSymbolMissingDataStyle,
  resolveSymbolStrokeStyle,
  usesDoubleProportionalSymbols
} from './symbol-layer.utils';
import { MultiShapeLayer } from './multi-shape-layer';

const SYMBOL_STROKE_WIDTH_DIVISOR = 3;

function createDoubleProportionalPointLayers(
  pointData: BinaryPointData,
  jsTable: ArrowTable,
  symbolRowTable: ArrowTable,
  ctx: LayerContext,
  layerId: string
): Layer<DeckDataRow>[] {
  // Outside the split (joined-basemap) path the binary `featureIds` index into
  // the representative-point table, so per-row attributes must be read from it
  // — keeping symbols aligned with their polygon when a POINT filter subsets
  // the points. The split path keeps reading the matched geometry table.
  const attributeTable = hasSplitRenderingContext(ctx)
    ? jsTable
    : symbolRowTable;
  const {
    viz,
    symbolFillColor: fillColor,
    strokeColor,
    fillOpacity: rawFillOpacity,
    strokeWidth,
    strokeOpacity: rawStrokeOpacity,
    statistics,
    categoryColorMap,
    secondaryStatistics,
    highlightedRowIds,
    modelMatrix,
    beforeId
  } = ctx;
  const pageDisplayScale = resolvePageDisplayScale(ctx);
  const pointStatistics = ctx.pointStatistics ?? statistics;
  const pointCategoryColorMap = ctx.pointCategoryColorMap ?? categoryColorMap;
  const pointSecondaryStatistics =
    ctx.pointSecondaryStatistics ?? secondaryStatistics ?? pointStatistics;

  if (!viz || !usesDoubleProportionalSymbols(viz)) {
    return [];
  }

  const pointConfig = getSymbolPrimitive(viz);
  if (!pointConfig) {
    return [];
  }

  const pointSizeColumn = pointConfig.sizeColumn;
  const pointValueColumn = pointConfig.valueColumn;
  const pointFillValueColumn = getSymbolFillValueColumn(viz);
  const pointFillCategoryColumn = getSymbolFillCategoryColumn(viz);
  const pointStrokeValueColumn =
    pointConfig.strokeValueColumn ?? pointValueColumn;
  const pointStrokeCategoryColumn = pointConfig.strokeCategoryColumn;
  if (!pointSizeColumn || !pointValueColumn) {
    return [];
  }

  const {
    color: pointStrokeColor,
    width: pointStrokeWidth,
    opacity: pointStrokeOpacity,
    dashed: pointStrokeDashed,
    dashSpec: pointStrokeDashSpec,
    show: showPointStroke
  } = resolveSymbolStrokeStyle(pointConfig, {
    color: strokeColor,
    width: strokeWidth,
    opacity: rawStrokeOpacity
  });
  const pointFillOpacity = pointConfig.opacity ?? rawFillOpacity;
  const secondaryFillColor = hexToRgb(pointConfig.fillColorB ?? '#ff832b');
  const pointShape = pointConfig.shape ?? ShapeType.CIRCLE;
  const pointBarWidth = pointConfig.barWidth ?? DEFAULT_LINEAR_SYMBOL_BAR_WIDTH;
  const minPointRadius = Math.max(1, pointConfig.minSize ?? 1);
  const maxPointRadius = Math.max(0, pointConfig.maxSize ?? minPointRadius);
  const proportionalSymbolScale = resolveProportionalSymbolScale(pointShape);
  const {
    show: showMissingPoints,
    color: missingPointColor,
    radius: missingPointRadius,
    shape: missingPointShape
  } = resolveSymbolMissingDataStyle(pointConfig, minPointRadius);
  const commonScale = pointConfig.commonScale !== false;
  const positionMode = pointConfig.positionMode ?? 'overlay';
  const hideSymbolFill = shouldHideSymbolFill(viz);
  const breakValueA = pointConfig.breakValueA ?? null;
  const breakValueB = pointConfig.breakValueB ?? null;
  const hlVersion = ctx.highlightVersion ?? 0;
  const pointClassification =
    getPrimitiveClassification(viz, PrimitiveFilterType.POINT) ??
    viz.classification;
  const pointFillClassification =
    getSymbolFillClassification(viz) ?? viz.classification;
  const symbolPattern =
    pointConfig.mode === SymbolMode.CATEGORIES
      ? resolveSymbolPattern(pointClassification)
      : pointConfig.fillMode === FillMode.CATEGORIES
        ? resolveSymbolPattern(pointFillClassification)
        : null;
  const useFillChoropleth = Boolean(
    pointConfig.fillMode === FillMode.CLASSES &&
    pointFillValueColumn &&
    pointFillClassification?.breaks &&
    pointFillClassification?.colors &&
    pointFillClassification.breaks.length >= 2
  );
  const useFillCategorical = Boolean(
    pointConfig.fillMode === FillMode.CATEGORIES &&
    pointFillCategoryColumn &&
    pointFillClassification?.colors?.length
  );
  const effectiveCategoryColorMap =
    useFillCategorical && pointFillCategoryColumn
      ? resolveEffectiveCategoryColorMap(
          jsTable,
          viz,
          pointCategoryColorMap,
          pointFillCategoryColumn,
          PrimitiveFilterType.POINT
        )
      : pointCategoryColorMap;
  const disabledFillLabels = new Set(
    (pointFillClassification?.disabledLabels ?? []).map(String)
  );
  const isDisabledFillCategory = (row: DeckDataRow): boolean =>
    useFillCategorical &&
    pointFillCategoryColumn !== undefined &&
    disabledFillLabels.has(String(row[pointFillCategoryColumn]));
  const primaryStats = pointStatistics;
  const secondaryStats = pointSecondaryStatistics;
  const primaryDomainMax = getAbsoluteDomainMax(
    primaryStats.min,
    primaryStats.max
  );
  const secondaryDomainMax = getAbsoluteDomainMax(
    secondaryStats.min,
    secondaryStats.max
  );
  const sharedMax = commonScale
    ? Math.max(primaryDomainMax, secondaryDomainMax)
    : primaryDomainMax;
  const primaryScaleMax = commonScale ? sharedMax : primaryDomainMax;
  const secondaryScaleMax = commonScale ? sharedMax : secondaryDomainMax;
  const primaryRadiusAccessor = createProportionalSymbolSizeAccessor(
    pointSizeColumn,
    primaryScaleMax,
    maxPointRadius,
    proportionalSymbolScale
  );
  const secondaryRadiusAccessor = createProportionalSymbolSizeAccessor(
    pointValueColumn,
    secondaryScaleMax,
    maxPointRadius,
    proportionalSymbolScale
  );

  const createRadiusAccessor =
    (columnName: string, accessor: (row: DeckDataRow) => number) =>
    (row: DeckDataRow): number => {
      if (isDisabledFillCategory(row)) {
        return 0;
      }
      if (isMissingThematicValue(row[columnName])) {
        return showMissingPoints ? missingPointRadius : 0;
      }

      return accessor(row);
    };

  const createFillAccessor =
    (
      columnName: string,
      baseColor: RGBColor,
      alternateColor: RGBColor,
      breakValue: number | null
    ) =>
    (row: DeckDataRow): [number, number, number, number] => {
      const rowOpacity = resolveHighlightedOpacityForRow(
        row,
        pointFillOpacity,
        highlightedRowIds
      );

      const missingColorColumn =
        useFillChoropleth || useFillCategorical
          ? useFillChoropleth
            ? pointFillValueColumn
            : pointFillCategoryColumn
          : columnName;
      if (
        missingColorColumn &&
        isMissingThematicValue(row[missingColorColumn])
      ) {
        return showMissingPoints
          ? toMutableRgba(withOpacity(missingPointColor, rowOpacity))
          : [0, 0, 0, 0];
      }

      if (
        useFillChoropleth &&
        pointFillValueColumn &&
        pointFillClassification?.breaks &&
        pointFillClassification?.colors
      ) {
        const rawFillValue = row[pointFillValueColumn];
        const numericFillValue =
          typeof rawFillValue === 'number'
            ? rawFillValue
            : Number(rawFillValue);
        if (!Number.isFinite(numericFillValue)) {
          return showMissingPoints
            ? toMutableRgba(withOpacity(missingPointColor, rowOpacity))
            : [0, 0, 0, 0];
        }
        const [r, g, b] = getColorForValue(
          numericFillValue,
          pointFillClassification.breaks,
          pointFillClassification.colors
        );
        return [
          r,
          g,
          b,
          Math.round(Math.min(Math.max(rowOpacity, 0), 1) * 255)
        ];
      }

      if (useFillCategorical && pointFillCategoryColumn) {
        const categoryLabel = String(row[pointFillCategoryColumn]);
        if (disabledFillLabels.has(categoryLabel)) {
          return [0, 0, 0, 0];
        }
        const mapped = effectiveCategoryColorMap?.get(categoryLabel);
        if (mapped) {
          return [
            mapped[0],
            mapped[1],
            mapped[2],
            Math.round(Math.min(Math.max(rowOpacity, 0), 1) * 255)
          ];
        }
      }

      const rawValue = row[columnName];
      const numericValue =
        typeof rawValue === 'number'
          ? rawValue
          : typeof rawValue === 'string'
            ? Number(rawValue)
            : Number.NaN;
      const color =
        breakValue !== null &&
        Number.isFinite(numericValue) &&
        numericValue < breakValue
          ? alternateColor
          : baseColor;

      return toMutableRgba(withOpacity(color, rowOpacity));
    };

  const strokeClassificationAccessor = createStrokeClassificationAccessor({
    strokeMode: pointConfig.strokeMode ?? 'unique',
    strokeClassification: pointConfig.strokeClassification,
    valueColumn: pointStrokeValueColumn,
    categoryColumn: pointStrokeCategoryColumn,
    fallbackLabels: pointClassification?.labels,
    fallbackBreaks: pointClassification?.breaks,
    missingColor: missingPointColor,
    showMissing: showMissingPoints,
    hexToRgb
  });

  const createLineAccessor =
    (columnName: string) =>
    (row: DeckDataRow): [number, number, number, number] => {
      if (isDisabledFillCategory(row)) {
        return [0, 0, 0, 0];
      }
      if (isMissingThematicValue(row[columnName]) && !showMissingPoints) {
        return [0, 0, 0, 0];
      }

      if (!showPointStroke) {
        return [0, 0, 0, 0];
      }

      if (strokeClassificationAccessor) {
        const [r, g, b] = strokeClassificationAccessor(row);
        const alpha = Math.round(
          Math.min(
            Math.max(
              resolveHighlightedOpacityForRow(
                row,
                pointStrokeOpacity,
                highlightedRowIds
              ),
              0
            ),
            1
          ) * 255
        );
        return [r, g, b, alpha];
      }

      return toMutableRgba(
        withOpacity(
          pointStrokeColor,
          resolveHighlightedOpacityForRow(
            row,
            pointStrokeOpacity,
            highlightedRowIds
          )
        )
      );
    };

  const primaryFillByFeatureId = rowAccessor(
    attributeTable,
    createFillAccessor(
      pointSizeColumn,
      fillColor,
      secondaryFillColor,
      breakValueA
    )
  );
  const secondaryFillByFeatureId = rowAccessor(
    attributeTable,
    createFillAccessor(
      pointValueColumn,
      secondaryFillColor,
      fillColor,
      breakValueB
    )
  );
  const primaryLineByFeatureId = rowAccessor(
    attributeTable,
    createLineAccessor(pointSizeColumn)
  );
  const secondaryLineByFeatureId = rowAccessor(
    attributeTable,
    createLineAccessor(pointValueColumn)
  );
  const primaryRadiusByFeatureId = rowAccessor(
    attributeTable,
    createRadiusAccessor(pointSizeColumn, primaryRadiusAccessor)
  );
  const secondaryRadiusByFeatureId = rowAccessor(
    attributeTable,
    createRadiusAccessor(pointValueColumn, secondaryRadiusAccessor)
  );

  const shapeOrdinal =
    SHAPE_ORDINAL[pointShape] ?? SHAPE_ORDINAL[ShapeType.CIRCLE];
  const missingShapeOrdinal =
    SHAPE_ORDINAL[missingPointShape] ?? SHAPE_ORDINAL[ShapeType.CIRCLE];
  const juxtapositionOffset = 0.5;
  const juxtapositionShapeScale = 0.7;

  const offsetForRole = (
    role: 'primary' | 'secondary'
  ): {
    offsetX: number;
    offsetY: number;
    halfMask: 0 | 1 | 2;
    radiusScale: number;
    shapeScale: number;
  } => {
    if (positionMode === 'juxtaposition') {
      return {
        offsetX:
          role === 'primary' ? juxtapositionOffset : -juxtapositionOffset,
        offsetY: 0,
        halfMask: 0,
        radiusScale: 2,
        shapeScale: juxtapositionShapeScale
      };
    }
    if (positionMode === 'division') {
      return {
        offsetX: 0,
        offsetY: 0,
        halfMask: role === 'primary' ? 2 : 1,
        radiusScale: 1,
        shapeScale: 1
      };
    }
    return {
      offsetX: 0,
      offsetY: 0,
      halfMask: 0,
      radiusScale: 1,
      shapeScale: 1
    };
  };

  const createScatterLayer = (
    suffix: string,
    fillByFeatureId: (featureId: number) => [number, number, number, number],
    lineByFeatureId: (featureId: number) => [number, number, number, number],
    radiusByFeatureId: (featureId: number) => number,
    pickable: boolean,
    triggerColumn: string,
    role: 'primary' | 'secondary'
  ) => {
    const layoutProps = offsetForRole(role);
    const scatterProps = createScatterplotLayerProps(pointData);
    const scatterBinaryData = cloneScatterBinaryData(scatterProps);
    attachBinaryPickingMetadata(
      scatterBinaryData,
      attributeTable,
      pointData,
      ctx
    );
    scatterBinaryData.attributes.getFillColor = pointColorAttr(
      pointData,
      fillByFeatureId
    );
    scatterBinaryData.attributes.getLineColor = pointColorAttr(
      pointData,
      lineByFeatureId
    );
    scatterBinaryData.attributes.getRadius = pointRadiusAttr(
      pointData,
      radiusByFeatureId
    );
    scatterBinaryData.attributes.getShape = buildShapeAttribute(
      scatterBinaryData.featureIds,
      attributeTable,
      triggerColumn,
      shapeOrdinal,
      missingShapeOrdinal
    );
    sortScatterBinaryDataByRadius(scatterBinaryData);

    return new MultiShapeLayer({
      id: `${layerId}-${suffix}`,
      ...(scatterProps as unknown as Record<string, unknown>),
      ...({
        offsetX: layoutProps.offsetX,
        offsetY: layoutProps.offsetY,
        halfMask: layoutProps.halfMask,
        shapeScale: layoutProps.shapeScale
      } as Record<string, unknown>),
      stroked: showPointStroke,
      filled: !hideSymbolFill,
      dashed: showPointStroke && pointStrokeDashed,
      dashLength: pointStrokeDashSpec.shader.dash,
      gapLength: pointStrokeDashSpec.shader.gap,
      dotLength: pointStrokeDashSpec.shader.dot,
      dotGap: pointStrokeDashSpec.shader.dotGap,
      barWidth: pointBarWidth,
      ...symbolPatternLayerProps(symbolPattern),
      opacity: 1,
      radiusScale: layoutProps.radiusScale * pageDisplayScale,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      lineWidthScale: showPointStroke
        ? (pointStrokeWidth / SYMBOL_STROKE_WIDTH_DIVISOR) * pageDisplayScale
        : 0,
      pickable,
      parameters: THEMATIC_OVERLAY_PARAMETERS,
      ...resolveHoverHighlightProps(),
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getFillColor: [
          triggerColumn,
          pointFillOpacity,
          fillColor,
          pointConfig.fillColorB,
          pointFillValueColumn,
          pointFillCategoryColumn,
          pointFillClassification?.breaks,
          pointFillClassification?.colors,
          pointFillClassification?.labels,
          pointFillClassification?.disabledLabels,
          effectiveCategoryColorMap,
          pointConfig.missingData?.show,
          pointConfig.missingData?.color,
          breakValueA,
          breakValueB,
          hideSymbolFill,
          hlVersion
        ],
        getLineColor: [
          triggerColumn,
          pointFillCategoryColumn,
          pointFillClassification?.categoryValues,
          pointFillClassification?.disabledLabels,
          pointStrokeColor,
          pointStrokeOpacity,
          pointStrokeValueColumn,
          pointStrokeCategoryColumn,
          showPointStroke,
          pointConfig.strokeClassification?.breaks,
          pointConfig.strokeClassification?.colors,
          pointConfig.strokeClassification?.labels,
          pointConfig.strokeClassification?.disabledLabels,
          pointConfig.missingData?.show,
          hlVersion
        ],
        getRadius: [
          triggerColumn,
          primaryScaleMax,
          secondaryScaleMax,
          pointConfig.minSize,
          pointConfig.maxSize,
          proportionalSymbolScale,
          pointFillCategoryColumn,
          pointFillClassification?.categoryValues,
          pointFillClassification?.disabledLabels,
          pointConfig.missingData?.show,
          pointConfig.missingData?.size,
          commonScale,
          positionMode
        ],
        getShape: [shapeOrdinal, missingShapeOrdinal, triggerColumn]
      }
    }) as ThematicLayer;
  };

  return [
    createScatterLayer(
      'double-primary',
      primaryFillByFeatureId,
      primaryLineByFeatureId,
      primaryRadiusByFeatureId,
      true,
      pointSizeColumn,
      'primary'
    ),
    createScatterLayer(
      'double-secondary',
      secondaryFillByFeatureId,
      secondaryLineByFeatureId,
      secondaryRadiusByFeatureId,
      false,
      pointValueColumn,
      'secondary'
    )
  ];
}

export function createRepresentativePointSymbolLayers(
  jsTable: ArrowTable,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    viz,
    symbolFillColor: fillColor,
    strokeColor,
    fillOpacity: rawFillOpacity,
    strokeWidth,
    strokeOpacity: rawStrokeOpacity,
    statistics,
    categoryColorMap,
    highlightedRowIds,
    modelMatrix,
    beforeId
  } = ctx;
  const pageDisplayScale = resolvePageDisplayScale(ctx);
  const pointStatistics = ctx.pointStatistics ?? statistics;
  const pointCategoryColorMap = ctx.pointCategoryColorMap ?? categoryColorMap;

  if (!viz) {
    return [];
  }

  const pointConfig = getSymbolPrimitive(viz);
  const primitiveFilters = getEnabledPrimitiveFilters(viz);
  if (
    !pointConfig?.enabled ||
    !primitiveFilters.includes(PrimitiveFilterType.POINT)
  ) {
    return [];
  }

  const pointValueColumn = pointConfig.valueColumn;
  const pointCategoryColumn = pointConfig.categoryColumn;
  const pointSizeColumn = pointConfig.sizeColumn;
  const pointFillValueColumn = getSymbolFillValueColumn(viz);
  const pointFillCategoryColumn = getSymbolFillCategoryColumn(viz);
  const pointStrokeValueColumn =
    pointConfig.strokeValueColumn ?? pointValueColumn;
  const pointStrokeCategoryColumn =
    pointConfig.strokeCategoryColumn ?? pointCategoryColumn;
  const {
    color: pointStrokeColor,
    width: pointStrokeWidth,
    opacity: pointStrokeOpacity,
    dashed: pointStrokeDashed,
    dashSpec: pointStrokeDashSpec,
    show: showPointStroke
  } = resolveSymbolStrokeStyle(pointConfig, {
    color: strokeColor,
    width: strokeWidth,
    opacity: rawStrokeOpacity
  });
  const hideSymbolFill = shouldHideSymbolFill(viz);

  const representativePointSource = getRepresentativePointSource(ctx);
  if (!representativePointSource) {
    return [];
  }

  const pointData = resolvePointParser(ctx.customProjection)(
    representativePointSource.table
  );

  // The binary point `featureIds` index into the representative-point table, so
  // every per-row symbol accessor must read its attributes from that same table
  // — not from `jsTable`. When a Symbols (POINT) filter is active the two tables
  // are filtered with different primitives and diverge, which would otherwise
  // shift each symbol onto the wrong polygon's data. The split (joined-basemap)
  // path is unaffected: its accessor maps by feature-id column, not row order.
  const symbolRowTable = representativePointSource.table;

  const pointLayerId = createThematicLayerId(DeckLayerId.POINT_LAYER, ctx);

  if (usesDoubleProportionalSymbols(viz)) {
    return createDoubleProportionalPointLayers(
      pointData,
      jsTable,
      symbolRowTable,
      ctx,
      pointLayerId
    );
  }

  const hlVersion = ctx.highlightVersion ?? 0;
  const pointClassification =
    getPrimitiveClassification(viz, PrimitiveFilterType.POINT) ??
    viz.classification;
  const pointFillClassification =
    getSymbolFillClassification(viz) ?? viz.classification;
  const symbolPattern =
    pointConfig.mode === SymbolMode.CATEGORIES
      ? resolveSymbolPattern(pointClassification)
      : pointConfig.fillMode === FillMode.CATEGORIES
        ? resolveSymbolPattern(pointFillClassification)
        : null;
  const pointColorCategoryColumn =
    pointConfig.mode === SymbolMode.CATEGORIES
      ? pointCategoryColumn
      : pointFillCategoryColumn;
  const pointColorClassification =
    pointConfig.mode === SymbolMode.CATEGORIES
      ? pointClassification
      : pointFillClassification;
  const useProportionalSymbols = shouldApplyProportionalSymbols(viz);
  const useClassedSymbols =
    pointConfig.mode === SymbolMode.CLASSES &&
    !!pointValueColumn &&
    !!pointClassification?.breaks &&
    pointClassification.breaks.length >= 2;
  const useCategoricalColor = shouldApplyCategorical(
    viz,
    PrimitiveFilterType.POINT
  );
  const useChoropleth = shouldApplyChoropleth(viz, PrimitiveFilterType.POINT);
  const { min: minValue, max: maxValue } = pointStatistics;
  const proportionalDomainMax = getAbsoluteDomainMax(minValue, maxValue);
  const pointFillOpacity = pointConfig.opacity ?? rawFillOpacity;
  const pointMissingColumn = resolvePointMissingColumn(
    viz,
    useProportionalSymbols,
    useClassedSymbols,
    useCategoricalColor,
    useChoropleth
  );
  const pointShape = pointConfig.shape ?? ShapeType.CIRCLE;
  const pointBarWidth = pointConfig.barWidth ?? DEFAULT_LINEAR_SYMBOL_BAR_WIDTH;
  const uniquePointRadius = Math.max(1, (pointConfig.size ?? 10) / 2);
  const minPointRadius = Math.max(1, pointConfig.minSize ?? 1);
  const maxPointRadius = Math.max(
    minPointRadius,
    pointConfig.maxSize ?? uniquePointRadius
  );
  const proportionalMaxPointRadius = Math.max(
    0,
    pointConfig.maxSize ?? uniquePointRadius
  );
  const proportionalSymbolScale = resolveProportionalSymbolScale(pointShape);
  const {
    show: showMissingPoints,
    color: missingPointColor,
    radius: missingPointRadius,
    shape: missingPointShape
  } = resolveSymbolMissingDataStyle(pointConfig, uniquePointRadius);
  const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
    jsTable,
    viz,
    pointCategoryColorMap,
    pointColorCategoryColumn,
    PrimitiveFilterType.POINT
  );
  const baseFillAccessor = useChoropleth
    ? createChoroplethColorAccessor(
        pointFillValueColumn!,
        pointFillClassification!.breaks!,
        pointFillClassification!.colors!,
        missingPointColor,
        showMissingPoints
      )
    : useCategoricalColor
      ? createCategoricalColorAccessor(
          pointColorCategoryColumn!,
          effectiveCategoryColorMap,
          missingPointColor,
          showMissingPoints,
          pointColorClassification?.disabledLabels ?? []
        )
      : null;
  const baseRadiusAccessor = useClassedSymbols
    ? createClassedSizeAccessor(
        pointValueColumn!,
        pointClassification!.breaks!,
        minPointRadius,
        maxPointRadius,
        pointClassification?.numClasses ?? pointClassification?.colors?.length
      )
    : useProportionalSymbols
      ? createProportionalSymbolSizeAccessor(
          pointSizeColumn!,
          proportionalDomainMax,
          proportionalMaxPointRadius,
          proportionalSymbolScale
        )
      : null;

  const strokeClassificationAccessor = createStrokeClassificationAccessor({
    strokeMode: pointConfig.strokeMode ?? 'unique',
    strokeClassification: pointConfig.strokeClassification,
    valueColumn: pointStrokeValueColumn,
    categoryColumn: pointStrokeCategoryColumn,
    fallbackLabels:
      pointStrokeCategoryColumn === pointColorCategoryColumn
        ? pointColorClassification?.labels
        : pointClassification?.labels,
    fallbackBreaks:
      pointStrokeValueColumn === pointFillValueColumn
        ? pointFillClassification?.breaks
        : pointClassification?.breaks,
    missingColor: missingPointColor,
    showMissing: showMissingPoints,
    hexToRgb
  });
  const disabledPointCategoryLabels = new Set(
    (pointColorClassification?.disabledLabels ?? []).map(String)
  );
  const isDisabledPointCategoryRow = (row: DeckDataRow): boolean =>
    pointConfig.mode === SymbolMode.CATEGORIES &&
    pointCategoryColumn !== undefined &&
    disabledPointCategoryLabels.has(String(row[pointCategoryColumn]));

  const resolveFillColorForRow = (
    row: DeckDataRow
  ): [number, number, number, number] => {
    if (isDisabledPointCategoryRow(row)) {
      return [0, 0, 0, 0];
    }
    const rowOpacity = resolveHighlightedOpacityForRow(
      row,
      pointFillOpacity,
      highlightedRowIds
    );

    if (pointMissingColumn && isMissingThematicValue(row[pointMissingColumn])) {
      return showMissingPoints
        ? toMutableRgba(withOpacity(missingPointColor, rowOpacity))
        : [0, 0, 0, 0];
    }

    if (baseFillAccessor) {
      const [r, g, b, sourceAlpha] = baseFillAccessor(row);
      if (sourceAlpha === 0) {
        return [r, g, b, 0];
      }
      const alpha = Math.round(Math.min(Math.max(rowOpacity, 0), 1) * 255);
      return [r, g, b, alpha];
    }

    return toMutableRgba(withOpacity(fillColor, rowOpacity));
  };

  const resolveLineColorForRow = (
    row: DeckDataRow
  ): [number, number, number, number] => {
    if (isDisabledPointCategoryRow(row)) {
      return [0, 0, 0, 0];
    }
    if (
      pointMissingColumn &&
      isMissingThematicValue(row[pointMissingColumn]) &&
      !showMissingPoints
    ) {
      return [0, 0, 0, 0];
    }

    const rowStrokeOpacity = resolveHighlightedOpacityForRow(
      row,
      pointStrokeOpacity,
      highlightedRowIds
    );

    if (!showPointStroke) {
      return [0, 0, 0, 0];
    }

    if (strokeClassificationAccessor) {
      const [r, g, b, sourceAlpha] = strokeClassificationAccessor(row);
      if (sourceAlpha === 0) {
        return [r, g, b, 0];
      }
      const alpha = Math.round(
        Math.min(Math.max(rowStrokeOpacity, 0), 1) * 255
      );
      return [r, g, b, alpha];
    }

    return toMutableRgba(withOpacity(pointStrokeColor, rowStrokeOpacity));
  };

  const resolveRadiusForRow = (row: DeckDataRow): number => {
    if (isDisabledPointCategoryRow(row)) {
      return 0;
    }
    if (pointMissingColumn && isMissingThematicValue(row[pointMissingColumn])) {
      return showMissingPoints ? missingPointRadius : 0;
    }

    if (baseRadiusAccessor) {
      return baseRadiusAccessor(row);
    }

    return uniquePointRadius;
  };

  const fillColorByFeatureId = ctxRowAccessor(
    ctx,
    symbolRowTable,
    resolveFillColorForRow,
    representativePointSource.table
  );
  const lineColorByFeatureId = ctxRowAccessor(
    ctx,
    symbolRowTable,
    resolveLineColorForRow,
    representativePointSource.table
  );
  const radiusByFeatureId = ctxRowAccessor(
    ctx,
    symbolRowTable,
    resolveRadiusForRow,
    representativePointSource.table
  );

  const scatterProps = createScatterplotLayerProps(pointData);
  const scatterBinaryData = cloneScatterBinaryData(scatterProps);
  attachBinaryPickingMetadata(
    scatterBinaryData,
    representativePointSource.table,
    pointData,
    ctx
  );
  scatterBinaryData.attributes.getFillColor = pointColorAttr(
    pointData,
    fillColorByFeatureId
  );
  scatterBinaryData.attributes.getLineColor = pointColorAttr(
    pointData,
    lineColorByFeatureId
  );
  scatterBinaryData.attributes.getRadius = pointRadiusAttr(
    pointData,
    radiusByFeatureId
  );

  const shapeOrdinal =
    SHAPE_ORDINAL[pointShape] ?? SHAPE_ORDINAL[ShapeType.CIRCLE];
  const missingShapeOrdinal =
    SHAPE_ORDINAL[missingPointShape] ?? SHAPE_ORDINAL[ShapeType.CIRCLE];

  const categoryShapeMode =
    pointConfig.categoryShape ?? CategoryShapeMode.UNIQUE;
  const useCategoryShape =
    pointConfig.mode === SymbolMode.CATEGORIES &&
    categoryShapeMode !== CategoryShapeMode.UNIQUE &&
    !!pointCategoryColumn;
  const symbolAttributeTable = ctx.splitDatasetTable ?? jsTable;
  const categoryShapeVector =
    useCategoryShape && pointCategoryColumn
      ? symbolAttributeTable.getChild(pointCategoryColumn)
      : null;
  const { categoryShapeMap, categoryRankRadiusMap } = resolveCategoryShapeMaps({
    useCategoryShape,
    categoryShapeMode,
    categoryVector: categoryShapeVector,
    attributeTable: symbolAttributeTable,
    classification: pointClassification,
    baseShape: pointShape,
    minRadius: minPointRadius,
    maxRadius: maxPointRadius,
    orderedRadiusMinimumDelta: 2
  });

  const shapeByFeatureId = ctxRowAccessor(
    ctx,
    symbolRowTable,
    (row) => {
      if (
        pointMissingColumn &&
        isMissingThematicValue(row[pointMissingColumn])
      ) {
        return missingShapeOrdinal;
      }
      if (useCategoryShape && categoryShapeMap && pointCategoryColumn) {
        const raw = row[pointCategoryColumn];
        if (raw !== null && raw !== undefined) {
          const key = String(raw);
          const mapped = categoryShapeMap.get(key);
          if (mapped !== undefined) return mapped;
        }
      }
      return shapeOrdinal;
    },
    representativePointSource.table
  );
  scatterBinaryData.attributes.getShape = {
    value: (() => {
      const featureIds = scatterBinaryData.featureIds;
      if (!featureIds) {
        return new Float32Array([shapeOrdinal]);
      }
      const out = new Float32Array(featureIds.length);
      for (let i = 0; i < featureIds.length; i += 1) {
        out[i] = shapeByFeatureId(featureIds[i]);
      }
      return out;
    })(),
    size: 1
  };

  if (categoryRankRadiusMap && pointCategoryColumn) {
    const categoryRankRadiusByFeatureId = ctxRowAccessor(
      ctx,
      symbolRowTable,
      (row) => {
        if (isDisabledPointCategoryRow(row)) {
          return 0;
        }
        if (
          pointMissingColumn &&
          isMissingThematicValue(row[pointMissingColumn])
        ) {
          return showMissingPoints ? missingPointRadius : 0;
        }
        const raw = row[pointCategoryColumn];
        if (raw !== null && raw !== undefined) {
          const mapped = categoryRankRadiusMap.get(String(raw));
          if (mapped !== undefined) {
            return mapped;
          }
        }
        return uniquePointRadius;
      },
      representativePointSource.table
    );
    const featureIds = scatterBinaryData.featureIds;
    const length = featureIds
      ? featureIds.length
      : symbolAttributeTable.numRows;
    const radiusArr = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      radiusArr[i] = categoryRankRadiusByFeatureId(
        featureIds ? featureIds[i] : i
      );
    }
    scatterBinaryData.attributes.getRadius = { value: radiusArr, size: 1 };
  }

  if (useProportionalSymbols) {
    sortScatterBinaryDataByRadius(scatterBinaryData);
  }

  return [
    new MultiShapeLayer({
      id: `${pointLayerId}-centroids`,
      ...(scatterProps as unknown as Record<string, unknown>),
      stroked: showPointStroke,
      filled: !hideSymbolFill,
      dashed: showPointStroke && pointStrokeDashed,
      dashLength: pointStrokeDashSpec.shader.dash,
      gapLength: pointStrokeDashSpec.shader.gap,
      dotLength: pointStrokeDashSpec.shader.dot,
      dotGap: pointStrokeDashSpec.shader.dotGap,
      barWidth: pointBarWidth,
      ...symbolPatternLayerProps(symbolPattern),
      opacity: 1,
      radiusScale: pageDisplayScale,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      lineWidthScale: showPointStroke
        ? (pointStrokeWidth / SYMBOL_STROKE_WIDTH_DIVISOR) * pageDisplayScale
        : 0,
      pickable: true,
      parameters: THEMATIC_OVERLAY_PARAMETERS,
      ...resolveHoverHighlightProps(),
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getFillColor: [
          useChoropleth,
          pointFillValueColumn,
          pointFillClassification?.breaks,
          pointFillClassification?.colors,
          useCategoricalColor,
          pointColorCategoryColumn,
          effectiveCategoryColorMap,
          fillColor,
          pointFillOpacity,
          pointMissingColumn,
          pointConfig.missingData?.show,
          pointConfig.missingData?.color,
          hideSymbolFill,
          pointColorClassification?.disabledLabels,
          hlVersion
        ],
        getLineColor: [
          pointStrokeColor,
          pointStrokeOpacity,
          pointMissingColumn,
          pointConfig.missingData?.show,
          pointConfig.mode,
          pointCategoryColumn,
          pointColorClassification?.categoryValues,
          pointColorClassification?.disabledLabels,
          pointStrokeValueColumn,
          pointStrokeCategoryColumn,
          showPointStroke,
          pointConfig.strokeMode,
          pointConfig.strokeClassification?.colors,
          pointConfig.strokeClassification?.breaks,
          pointConfig.strokeClassification?.labels,
          pointConfig.strokeClassification?.disabledLabels,
          hlVersion
        ],
        getRadius: [
          useProportionalSymbols,
          useClassedSymbols,
          pointSizeColumn,
          pointValueColumn,
          maxValue,
          pointClassification?.breaks,
          pointConfig.size,
          pointConfig.minSize,
          pointConfig.maxSize,
          proportionalSymbolScale,
          pointConfig.mode,
          pointCategoryColumn,
          pointColorClassification?.categoryValues,
          pointColorClassification?.disabledLabels,
          pointMissingColumn,
          pointConfig.missingData?.show,
          pointConfig.missingData?.size
        ],
        getShape: [
          shapeOrdinal,
          missingShapeOrdinal,
          pointMissingColumn,
          categoryShapeMode,
          useCategoryShape,
          pointCategoryColumn,
          pointClassification?.labels
        ]
      }
    })
  ];
}

interface SymbolPatternRenderProps {
  patternAtlas: HTMLCanvasElement;
  patternFrame: [number, number, number, number];
  patternScale: number;
  patternAngle: number;
  patternColor: [number, number, number];
  patternColorize: boolean;
  khartisMotifOptions: {
    type: string;
    angle: number;
    scale: number;
    size: number;
    patchSize: boolean;
  };
  khartisPatternColor: [number, number, number];
  khartisPatternColorize: boolean;
}

function resolveSymbolPattern(
  classification: ClassificationConfig | undefined
): SymbolPatternRenderProps | null {
  const config = resolveClassificationPatternConfig(classification);
  const pattern = resolveSingleClassPattern(config);
  if (!config || !pattern) {
    return null;
  }
  const { atlas, mapping } = getPatternPaletteAtlas([pattern]);
  const frame = mapping['c0'];
  if (!frame) {
    return null;
  }
  const patternColor = hexToRgb(pattern.fill);
  const colorize = config.colorize ?? false;

  return {
    patternAtlas: atlas,
    patternFrame: [frame.x, frame.y, frame.width, frame.height],
    patternScale: pattern.scale * 10,
    patternAngle: pattern.angle,
    patternColor,
    patternColorize: colorize,
    khartisMotifOptions: {
      type: pattern.type,
      angle: pattern.angle,
      scale: pattern.scale,
      size: pattern.size,
      patchSize: pattern.patchSize
    },
    khartisPatternColor: patternColor,
    khartisPatternColorize: colorize
  };
}

function symbolPatternLayerProps(
  pattern: SymbolPatternRenderProps | null
): Record<string, unknown> {
  if (!pattern) {
    return { patternEnabled: false };
  }
  return {
    patternEnabled: true,
    patternAtlas: pattern.patternAtlas,
    patternFrame: pattern.patternFrame,
    patternScale: pattern.patternScale,
    patternAngle: pattern.patternAngle,
    patternColor: pattern.patternColor,
    patternColorize: pattern.patternColorize,
    khartisMotifOptions: pattern.khartisMotifOptions,
    khartisPatternColor: pattern.khartisPatternColor,
    khartisPatternColorize: pattern.khartisPatternColorize
  };
}

export type { LayerContext };

export function createPointLayerStack(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    viz,
    symbolFillColor: fillColor,
    strokeColor,
    fillOpacity: rawFillOpacity,
    strokeWidth,
    strokeOpacity: rawStrokeOpacity,
    statistics,
    categoryColorMap,
    highlightedRowIds,
    modelMatrix,
    beforeId
  } = ctx;
  const pageDisplayScale = resolvePageDisplayScale(ctx);
  const pointStatistics = ctx.pointStatistics ?? statistics;
  const pointCategoryColorMap = ctx.pointCategoryColorMap ?? categoryColorMap;
  const hasHighlights = highlightedRowIds && highlightedRowIds.size > 0;
  const hlVersion = ctx.highlightVersion ?? 0;
  const { geoColumn, isNativeGeoArrow, isWkbEncoded, isGeoJsonEncoded } =
    geometryInfo;
  const arrowExtension = geometryInfo.encoding;
  const pointConfig = viz ? getSymbolPrimitive(viz) : undefined;
  const pointValueColumn = pointConfig?.valueColumn;
  const pointCategoryColumn = pointConfig?.categoryColumn;
  const pointSizeColumn = pointConfig?.sizeColumn;
  const pointStrokeValueColumn =
    pointConfig?.strokeValueColumn ?? pointValueColumn;
  const pointStrokeCategoryColumn =
    pointConfig?.strokeCategoryColumn ?? pointCategoryColumn;
  const {
    color: pointStrokeColor,
    width: pointStrokeWidth,
    opacity: pointStrokeOpacity,
    dashed: pointStrokeDashed,
    dashSpec: pointStrokeDashSpec,
    show: showPointStroke
  } = resolveSymbolStrokeStyle(pointConfig, {
    color: strokeColor,
    width: strokeWidth,
    opacity: rawStrokeOpacity
  });
  const pointFillOpacity = pointConfig?.opacity ?? rawFillOpacity;

  const densityActive =
    viz &&
    getPolygonPrimitive(viz)?.fillMode === FillMode.DENSITY &&
    Boolean(viz.density);

  if (viz && !pointConfig?.enabled && !densityActive) {
    return [];
  }

  const pointClassification = viz
    ? (getPrimitiveClassification(viz, PrimitiveFilterType.POINT) ??
      viz.classification)
    : undefined;
  const pointFillClassification = viz
    ? getSymbolFillClassification(viz)
    : undefined;
  const pointFillValueColumn = viz ? getSymbolFillValueColumn(viz) : undefined;
  const symbolPattern =
    pointConfig?.mode === SymbolMode.CATEGORIES
      ? resolveSymbolPattern(pointClassification)
      : pointConfig?.fillMode === FillMode.CATEGORIES
        ? resolveSymbolPattern(pointFillClassification ?? pointClassification)
        : null;
  const useProportionalSymbols = viz && shouldApplyProportionalSymbols(viz);
  const useClassedSymbols =
    pointConfig?.mode === SymbolMode.CLASSES &&
    !!pointValueColumn &&
    !!pointClassification?.breaks &&
    pointClassification.breaks.length >= 2;
  const usesVariablePointSize = useProportionalSymbols || useClassedSymbols;
  const useCategoricalColor =
    viz && shouldApplyCategorical(viz, PrimitiveFilterType.POINT);
  const useChoropleth =
    viz && shouldApplyChoropleth(viz, PrimitiveFilterType.POINT);
  const hideSymbolFill = shouldHideSymbolFill(viz);
  const { min: minValue, max: maxValue } = pointStatistics;
  const proportionalDomainMax = getAbsoluteDomainMax(minValue, maxValue);
  const pointMissingColumn = resolvePointMissingColumn(
    viz,
    Boolean(useProportionalSymbols),
    Boolean(useClassedSymbols),
    Boolean(useCategoricalColor),
    Boolean(useChoropleth)
  );
  const layerId = createThematicLayerId(DeckLayerId.POINT_LAYER, ctx);
  const pointShape = pointConfig?.shape ?? ShapeType.CIRCLE;
  const pointBarWidth =
    pointConfig?.barWidth ?? DEFAULT_LINEAR_SYMBOL_BAR_WIDTH;
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
  const proportionalSymbolScale = resolveProportionalSymbolScale(pointShape);
  const {
    show: showMissingPoints,
    color: missingPointColor,
    radius: missingPointRadius,
    shape: missingPointShape
  } = resolveSymbolMissingDataStyle(pointConfig, uniquePointRadius);

  const isNativeGeoArrowPoint =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_POINT ||
      arrowExtension === ArrowExtension.GEOARROW_MULTIPOINT);

  if (densityActive) {
    return createDotDensityLayers(jsTable, ctx, layerId);
  }

  if (geometryInfo.type === GeometryType.MULTIPOINT) {
    return createRepresentativePointSymbolLayers(jsTable, ctx);
  }

  const shouldUseGeoJsonPointLayer =
    !isNativeGeoArrowPoint &&
    !isNativeGeoArrow &&
    (isWkbEncoded || isGeoJsonEncoded) &&
    pointShape === ShapeType.CIRCLE &&
    missingPointShape === ShapeType.CIRCLE &&
    !(pointStrokeDashed && showPointStroke);

  if (shouldUseGeoJsonPointLayer) {
    let geojsonData;
    try {
      const rawGeoJSON = getCachedGeoJSON(jsTable, geoColumn);
      geojsonData = rawGeoJSON
        ? getCachedProjectedGeoJSON(rawGeoJSON, ctx.customProjection)
        : rawGeoJSON;
    } catch (error) {
      logger.error(
        'Failed to read GeoJSON for proportional polygon layer',
        LogCategory.MAP,
        error
      );
      return [];
    }
    if (!geojsonData) {
      showWarning(
        m.error_geometry_conversion_title(),
        m.error_geometry_conversion_message()
      );
      return [];
    }
    const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
      jsTable,
      viz,
      pointCategoryColorMap,
      pointCategoryColumn,
      PrimitiveFilterType.POINT
    );

    const baseFillColor =
      useChoropleth && viz
        ? createGeoJsonChoroplethColorAccessor(
            pointValueColumn!,
            pointClassification!.breaks!,
            pointClassification!.colors!,
            fillColor
          )
        : useCategoricalColor && viz
          ? createGeoJsonCategoricalColorAccessor(
              pointCategoryColumn!,
              effectiveCategoryColorMap,
              fillColor,
              fillColor,
              true,
              pointClassification?.disabledLabels ?? []
            )
          : fillColor;
    const pointStrokeColors = pointConfig?.strokeClassification?.colors;
    const pointStrokeBreaks =
      pointConfig?.strokeClassification?.breaks ?? pointClassification?.breaks;
    const pointStrokeGeoJsonColorMap = buildCategoryColorMapFromLabels(
      pointConfig?.strokeClassification?.labels ?? pointClassification?.labels,
      pointConfig?.strokeClassification?.colors
    );

    const geoJsonFillColor =
      hasHighlights && highlightedRowIds
        ? typeof baseFillColor === 'function'
          ? withGeoJsonRowHighlightAccessor(
              baseFillColor,
              pointFillOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              highlightedRowIds
            )
          : withGeoJsonRowHighlight(
              baseFillColor,
              pointFillOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              highlightedRowIds
            )
        : baseFillColor;

    const baseGeoJsonLineColor =
      pointConfig?.strokeMode === StrokeMode.CLASSES &&
      pointStrokeValueColumn &&
      pointStrokeBreaks &&
      pointStrokeColors?.length
        ? (feature: { properties?: Record<string, unknown> }) =>
            withOpacityPreservingAlpha(
              createGeoJsonChoroplethColorAccessor(
                pointStrokeValueColumn,
                pointStrokeBreaks,
                pointStrokeColors,
                pointStrokeColor,
                missingPointColor,
                showMissingPoints
              )(feature),
              pointStrokeOpacity
            ) as [number, number, number, number]
        : pointConfig?.strokeMode === StrokeMode.CATEGORIES &&
            pointStrokeCategoryColumn &&
            pointStrokeColors?.length
          ? (feature: { properties?: Record<string, unknown> }) =>
              withOpacityPreservingAlpha(
                createGeoJsonCategoricalColorAccessor(
                  pointStrokeCategoryColumn,
                  pointStrokeGeoJsonColorMap,
                  pointStrokeColor,
                  missingPointColor,
                  showMissingPoints,
                  pointConfig?.strokeClassification?.disabledLabels ?? []
                )(feature),
                pointStrokeOpacity
              ) as [number, number, number, number]
          : null;

    const geoJsonLineColor =
      hasHighlights && highlightedRowIds
        ? baseGeoJsonLineColor
          ? withGeoJsonRowHighlightAccessor(
              baseGeoJsonLineColor,
              pointStrokeOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              highlightedRowIds
            )
          : withGeoJsonRowHighlight(
              pointStrokeColor,
              pointStrokeOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              highlightedRowIds
            )
        : (baseGeoJsonLineColor ??
          withOpacity(pointStrokeColor, pointStrokeOpacity));

    const geoJsonRadius =
      useClassedSymbols && viz
        ? createGeoJsonClassedSizeAccessor(
            pointValueColumn!,
            pointClassification!.breaks!,
            minPointRadius,
            maxPointRadius,
            pointClassification?.numClasses ??
              pointClassification?.colors?.length,
            uniquePointRadius
          )
        : useProportionalSymbols && viz
          ? createGeoJsonProportionalSymbolSizeAccessor(
              pointSizeColumn!,
              proportionalDomainMax,
              proportionalMaxPointRadius,
              proportionalSymbolScale
            )
          : uniquePointRadius;
    const isMissingGeoJsonPoint = (feature: {
      properties?: Record<string, unknown> | null;
    }): boolean =>
      pointMissingColumn
        ? isMissingThematicValue(feature.properties?.[pointMissingColumn])
        : false;
    const disabledPointCategoryLabels = new Set(
      (pointClassification?.disabledLabels ?? []).map(String)
    );
    const isDisabledGeoJsonPoint = (feature: {
      properties?: Record<string, unknown> | null;
    }): boolean =>
      pointConfig?.mode === SymbolMode.CATEGORIES &&
      pointCategoryColumn !== undefined &&
      disabledPointCategoryLabels.has(
        String(feature.properties?.[pointCategoryColumn])
      );
    const getGeoJsonPointRadius = (feature: {
      properties?: Record<string, unknown> | null;
    }): number =>
      typeof geoJsonRadius === 'function'
        ? geoJsonRadius(feature)
        : geoJsonRadius;
    const sortedGeoJsonData = useProportionalSymbols
      ? {
          ...geojsonData,
          features: [...geojsonData.features].sort(
            (a, b) => getGeoJsonPointRadius(b) - getGeoJsonPointRadius(a)
          )
        }
      : geojsonData;

    return [
      new GeoJsonLayer({
        id: layerId,
        data: sortedGeoJsonData,
        pointType: 'circle',
        filled: !hideSymbolFill,
        stroked: showPointStroke,
        getFillColor: (feature: { properties?: Record<string, unknown> }) => {
          if (isDisabledGeoJsonPoint(feature)) {
            return [0, 0, 0, 0];
          }
          if (isMissingGeoJsonPoint(feature)) {
            return showMissingPoints
              ? withOpacity(
                  missingPointColor,
                  hasHighlights ? 1 : pointFillOpacity
                )
              : [0, 0, 0, 0];
          }

          return typeof geoJsonFillColor === 'function'
            ? geoJsonFillColor(feature)
            : geoJsonFillColor;
        },
        getLineColor: (feature: { properties?: Record<string, unknown> }) => {
          if (isDisabledGeoJsonPoint(feature)) {
            return [0, 0, 0, 0];
          }
          if (isMissingGeoJsonPoint(feature) && !showMissingPoints) {
            return [0, 0, 0, 0];
          }

          if (!showPointStroke) {
            return [0, 0, 0, 0];
          }

          return typeof geoJsonLineColor === 'function'
            ? geoJsonLineColor(feature)
            : geoJsonLineColor;
        },
        getPointRadius: (feature: { properties?: Record<string, unknown> }) => {
          if (isDisabledGeoJsonPoint(feature)) {
            return 0;
          }
          if (isMissingGeoJsonPoint(feature)) {
            return showMissingPoints ? missingPointRadius : 0;
          }

          return getGeoJsonPointRadius(feature);
        },
        pointRadiusUnits: 'pixels',
        pointRadiusScale: pageDisplayScale,
        lineWidthUnits: 'pixels',
        getLineWidth: showPointStroke
          ? (pointStrokeWidth / SYMBOL_STROKE_WIDTH_DIVISOR) * pageDisplayScale
          : 0,
        opacity: hasHighlights ? 1 : pointFillOpacity,
        pickable: true,
        ...resolveHoverHighlightProps(),
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillColor: [
            useChoropleth,
            pointValueColumn,
            pointClassification?.breaks,
            pointClassification?.colors,
            useCategoricalColor,
            pointCategoryColumn,
            pointCategoryColorMap,
            pointClassification?.labels,
            pointClassification?.categoryValues,
            pointClassification?.disabledLabels,
            fillColor,
            pointMissingColumn,
            pointConfig?.missingData?.show,
            pointConfig?.missingData?.color,
            hlVersion
          ],
          getPointRadius: [
            usesVariablePointSize,
            pointSizeColumn,
            pointValueColumn,
            maxValue,
            pointClassification?.breaks,
            pointConfig?.minSize,
            pointConfig?.maxSize,
            proportionalSymbolScale,
            pointMissingColumn,
            pointConfig?.missingData?.show,
            pointConfig?.missingData?.size,
            pointClassification?.disabledLabels
          ],
          getLineColor: [
            pointStrokeColor,
            pointStrokeOpacity,
            pointStrokeValueColumn,
            pointStrokeCategoryColumn,
            showPointStroke,
            pointConfig?.strokeClassification?.breaks,
            pointConfig?.strokeClassification?.colors,
            pointConfig?.strokeClassification?.labels,
            pointConfig?.strokeClassification?.disabledLabels,
            pointClassification?.disabledLabels,
            pointMissingColumn,
            pointConfig?.missingData?.show,
            hlVersion
          ]
        }
      })
    ];
  }

  const pointData = resolvePointParser(ctx.customProjection)(jsTable);
  if (usesDoubleProportionalSymbols(viz)) {
    return createDoubleProportionalPointLayers(
      pointData,
      jsTable,
      jsTable,
      ctx,
      layerId
    );
  }
  const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
    jsTable,
    viz,
    pointCategoryColorMap,
    pointCategoryColumn,
    PrimitiveFilterType.POINT
  );

  const baseFillAccessor =
    useChoropleth && viz
      ? createChoroplethColorAccessor(
          (pointFillValueColumn ?? pointValueColumn)!,
          (pointFillClassification ?? pointClassification)!.breaks!,
          (pointFillClassification ?? pointClassification)!.colors!
        )
      : useCategoricalColor && viz
        ? createCategoricalColorAccessor(
            pointCategoryColumn!,
            effectiveCategoryColorMap,
            HIGHLIGHT_FILL_COLOR,
            true,
            (pointConfig?.fillMode === FillMode.CATEGORIES
              ? (pointFillClassification ?? pointClassification)
              : pointClassification
            )?.disabledLabels ?? []
          )
        : null;

  const usesPointCategories =
    pointConfig?.mode === SymbolMode.CATEGORIES ||
    pointConfig?.fillMode === FillMode.CATEGORIES;
  const disabledPointCategoryLabels = new Set(
    [
      ...(pointConfig?.mode === SymbolMode.CATEGORIES
        ? (pointClassification?.disabledLabels ?? [])
        : []),
      ...(pointConfig?.fillMode === FillMode.CATEGORIES
        ? (pointFillClassification?.disabledLabels ?? [])
        : [])
    ].map(String)
  );
  const pointCategoryVector = pointCategoryColumn
    ? jsTable.getChild(pointCategoryColumn)
    : null;
  const pointMissingVector = pointMissingColumn
    ? jsTable.getChild(pointMissingColumn)
    : null;
  const isDisabledPointCategoryValue = (value: unknown): boolean =>
    usesPointCategories && disabledPointCategoryLabels.has(String(value));
  const isDisabledPointCategoryRow = (row: DeckDataRow): boolean =>
    pointCategoryColumn !== undefined &&
    isDisabledPointCategoryValue(row[pointCategoryColumn]);
  const isMissingPointValue = (rowIndex: number): boolean =>
    !!pointMissingVector &&
    isMissingThematicValue(pointMissingVector.get(rowIndex));
  const hasDisabledPointCategories =
    usesPointCategories &&
    pointCategoryColumn !== undefined &&
    disabledPointCategoryLabels.size > 0;

  const fillColorAccessor =
    pointMissingColumn || hasHighlights
      ? (row: DeckDataRow): [number, number, number, number] => {
          if (isDisabledPointCategoryRow(row)) {
            return [0, 0, 0, 0];
          }
          const rowOpacity = resolveHighlightedOpacityForRow(
            row,
            pointFillOpacity,
            highlightedRowIds
          );
          if (
            pointMissingColumn &&
            isMissingThematicValue(row[pointMissingColumn])
          ) {
            return showMissingPoints
              ? toMutableRgba(withOpacity(missingPointColor, rowOpacity))
              : [0, 0, 0, 0];
          }

          if (baseFillAccessor) {
            const [r, g, b, sourceAlpha] = baseFillAccessor(row);
            if (sourceAlpha === 0) {
              return [r, g, b, 0];
            }
            const alpha = Math.round(
              Math.min(Math.max(rowOpacity, 0), 1) * 255
            );
            return [r, g, b, alpha];
          }

          return toMutableRgba(withOpacity(fillColor, rowOpacity));
        }
      : baseFillAccessor;

  const fillColorBinAttr = fillColorAccessor
    ? pointColorAttr(pointData, ctxRowAccessor(ctx, jsTable, fillColorAccessor))
    : null;

  const strokeClassificationAccessor = createStrokeClassificationAccessor({
    strokeMode: pointConfig?.strokeMode ?? 'unique',
    strokeClassification: pointConfig?.strokeClassification,
    valueColumn: pointStrokeValueColumn,
    categoryColumn: pointStrokeCategoryColumn,
    fallbackLabels: pointClassification?.labels,
    fallbackBreaks: pointClassification?.breaks,
    missingColor: missingPointColor,
    showMissing: showMissingPoints,
    hexToRgb
  });

  const lineColorAccessor =
    strokeClassificationAccessor ||
    pointMissingColumn ||
    hasHighlights ||
    hasDisabledPointCategories
      ? (row: DeckDataRow): [number, number, number, number] => {
          if (isDisabledPointCategoryRow(row)) {
            return [0, 0, 0, 0];
          }
          if (
            pointMissingColumn &&
            isMissingThematicValue(row[pointMissingColumn]) &&
            !showMissingPoints
          ) {
            return [0, 0, 0, 0];
          }

          if (!showPointStroke) {
            return [0, 0, 0, 0];
          }

          if (strokeClassificationAccessor) {
            const [r, g, b, sourceAlpha] = strokeClassificationAccessor(row);
            if (sourceAlpha === 0) {
              return [r, g, b, 0];
            }
            const alpha = Math.round(
              Math.min(
                Math.max(
                  resolveHighlightedOpacityForRow(
                    row,
                    pointStrokeOpacity,
                    highlightedRowIds
                  ),
                  0
                ),
                1
              ) * 255
            );
            return [r, g, b, alpha];
          }

          return toMutableRgba(
            withOpacity(
              pointStrokeColor,
              resolveHighlightedOpacityForRow(
                row,
                pointStrokeOpacity,
                highlightedRowIds
              )
            )
          );
        }
      : null;

  const lineColorBinAttr = lineColorAccessor
    ? pointColorAttr(pointData, ctxRowAccessor(ctx, jsTable, lineColorAccessor))
    : null;

  const baseRadiusAccessor =
    useClassedSymbols && viz
      ? createClassedSizeAccessor(
          pointValueColumn!,
          pointClassification!.breaks!,
          minPointRadius,
          maxPointRadius,
          pointClassification?.numClasses ?? pointClassification?.colors?.length
        )
      : useProportionalSymbols && viz
        ? createProportionalSymbolSizeAccessor(
            pointSizeColumn!,
            proportionalDomainMax,
            proportionalMaxPointRadius,
            proportionalSymbolScale
          )
        : null;

  const radiusAccessor =
    pointMissingColumn || baseRadiusAccessor || hasDisabledPointCategories
      ? (row: DeckDataRow): number => {
          if (isDisabledPointCategoryRow(row)) {
            return 0;
          }
          if (
            pointMissingColumn &&
            isMissingThematicValue(row[pointMissingColumn])
          ) {
            return showMissingPoints ? missingPointRadius : 0;
          }

          if (baseRadiusAccessor) {
            return baseRadiusAccessor(row);
          }

          return uniquePointRadius;
        }
      : null;

  const radiusBinAttr = radiusAccessor
    ? pointRadiusAttr(pointData, ctxRowAccessor(ctx, jsTable, radiusAccessor))
    : null;

  const scatterProps = createScatterplotLayerProps(pointData);
  const scatterBinaryData = cloneScatterBinaryData(scatterProps);
  attachBinaryPickingMetadata(scatterBinaryData, jsTable, pointData, ctx);
  if (fillColorBinAttr) {
    scatterBinaryData.attributes.getFillColor = fillColorBinAttr;
  }
  if (lineColorBinAttr) {
    scatterBinaryData.attributes.getLineColor = lineColorBinAttr;
  }
  if (radiusBinAttr) {
    scatterBinaryData.attributes.getRadius = radiusBinAttr;
  }

  const categoryShapeMode =
    pointConfig?.categoryShape ?? CategoryShapeMode.UNIQUE;
  const useCategoryShape =
    pointConfig?.mode === SymbolMode.CATEGORIES &&
    categoryShapeMode !== CategoryShapeMode.UNIQUE &&
    !!pointCategoryColumn;

  const shapeOrdinal =
    SHAPE_ORDINAL[pointShape] ?? SHAPE_ORDINAL[ShapeType.CIRCLE];
  const missingShapeOrdinal =
    SHAPE_ORDINAL[missingPointShape] ?? SHAPE_ORDINAL[ShapeType.CIRCLE];

  const { categoryShapeMap, categoryRankRadiusMap } = resolveCategoryShapeMaps({
    useCategoryShape,
    categoryShapeMode,
    categoryVector: pointCategoryVector,
    attributeTable: jsTable,
    classification: pointClassification,
    baseShape: pointShape,
    minRadius: minPointRadius,
    maxRadius: maxPointRadius,
    orderedRadiusMinimumDelta: 0
  });

  if (useCategoryShape && categoryShapeMap && pointCategoryVector) {
    const featureIds = scatterBinaryData.featureIds;
    const length = featureIds ? featureIds.length : jsTable.numRows;
    const shapeArr = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const rowIdx = featureIds ? featureIds[i] : i;
      if (isMissingPointValue(rowIdx)) {
        shapeArr[i] = missingShapeOrdinal;
        continue;
      }
      const raw = pointCategoryVector.get(rowIdx);
      if (raw !== null && raw !== undefined) {
        const key = String(raw);
        const mapped = categoryShapeMap.get(key);
        if (mapped !== undefined) {
          shapeArr[i] = mapped;
          continue;
        }
      }
      shapeArr[i] = shapeOrdinal;
    }
    scatterBinaryData.attributes.getShape = { value: shapeArr, size: 1 };
  }

  if (categoryRankRadiusMap && pointCategoryVector) {
    const featureIds = scatterBinaryData.featureIds;
    const length = featureIds ? featureIds.length : jsTable.numRows;
    const radiusArr = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const rowIdx = featureIds ? featureIds[i] : i;
      const raw = pointCategoryVector.get(rowIdx);
      if (isDisabledPointCategoryValue(raw)) {
        radiusArr[i] = 0;
        continue;
      }
      if (isMissingPointValue(rowIdx)) {
        radiusArr[i] = showMissingPoints ? missingPointRadius : 0;
        continue;
      }
      if (raw !== null && raw !== undefined) {
        const key = String(raw);
        const mapped = categoryRankRadiusMap.get(key);
        if (mapped !== undefined) {
          radiusArr[i] = mapped;
          continue;
        }
      }
      radiusArr[i] = uniquePointRadius;
    }
    scatterBinaryData.attributes.getRadius = { value: radiusArr, size: 1 };
  }

  const needsMissingShapeAttribute =
    !scatterBinaryData.attributes.getShape &&
    !!pointMissingColumn &&
    missingPointShape !== ShapeType.CIRCLE;
  if (needsMissingShapeAttribute) {
    const featureIds = scatterBinaryData.featureIds;
    const length = featureIds ? featureIds.length : jsTable.numRows;
    const shapeArr = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const rowIdx = featureIds ? featureIds[i] : i;
      shapeArr[i] = isMissingPointValue(rowIdx)
        ? missingShapeOrdinal
        : shapeOrdinal;
    }
    scatterBinaryData.attributes.getShape = { value: shapeArr, size: 1 };
  }

  if (useProportionalSymbols) {
    sortScatterBinaryDataByRadius(scatterBinaryData);
  }

  const baseLayerProps = {
    id: symbolPattern
      ? `${layerId}-pattern-${symbolPattern.khartisMotifOptions.type}`
      : layerId,
    ...(scatterProps as unknown as Record<string, unknown>),
    stroked: showPointStroke,
    filled: !hideSymbolFill,
    ...(!fillColorBinAttr && {
      getFillColor: withOpacity(fillColor, hasHighlights ? 1 : pointFillOpacity)
    }),
    ...(!lineColorBinAttr && {
      getLineColor: showPointStroke
        ? withOpacity(pointStrokeColor, pointStrokeOpacity)
        : ([0, 0, 0, 0] as [number, number, number, number])
    }),
    opacity: hasHighlights ? 1 : pointFillOpacity,
    ...(!radiusBinAttr && { getRadius: uniquePointRadius }),
    ...(!scatterBinaryData.attributes.getShape && { getShape: shapeOrdinal }),
    radiusScale: pageDisplayScale,
    radiusUnits: 'pixels' as const,
    lineWidthUnits: 'pixels' as const,
    lineWidthScale: showPointStroke
      ? (pointStrokeWidth / SYMBOL_STROKE_WIDTH_DIVISOR) * pageDisplayScale
      : 0,
    pickable: true,
    ...resolveHoverHighlightProps(),
    ...(modelMatrix && { modelMatrix }),
    ...(beforeId && { beforeId }),
    updateTriggers: {
      getFillColor: [
        useChoropleth,
        pointValueColumn,
        pointFillValueColumn,
        pointClassification?.breaks,
        pointClassification?.colors,
        pointFillClassification?.breaks,
        pointFillClassification?.colors,
        useCategoricalColor,
        pointCategoryColumn,
        pointCategoryColorMap,
        pointClassification?.labels,
        pointClassification?.categoryValues,
        pointClassification?.disabledLabels,
        fillColor,
        pointMissingColumn,
        pointConfig?.missingData?.show,
        pointConfig?.missingData?.color,
        hideSymbolFill,
        hlVersion
      ],
      getRadius: [
        usesVariablePointSize,
        pointSizeColumn,
        pointValueColumn,
        maxValue,
        pointClassification?.breaks,
        pointConfig?.size,
        pointConfig?.minSize,
        pointConfig?.maxSize,
        proportionalSymbolScale,
        pointMissingColumn,
        pointConfig?.missingData?.show,
        pointConfig?.missingData?.size,
        pointClassification?.disabledLabels
      ],
      getLineColor: [
        pointStrokeColor,
        pointStrokeOpacity,
        pointMissingColumn,
        pointConfig?.missingData?.show,
        pointStrokeValueColumn,
        pointStrokeCategoryColumn,
        pointConfig?.strokeMode,
        showPointStroke,
        pointConfig?.strokeClassification?.colors,
        pointConfig?.strokeClassification?.breaks,
        pointConfig?.strokeClassification?.labels,
        pointConfig?.strokeClassification?.disabledLabels,
        pointClassification?.disabledLabels,
        hlVersion
      ],
      getShape: [
        shapeOrdinal,
        missingShapeOrdinal,
        useCategoryShape,
        categoryShapeMode,
        pointCategoryColumn,
        pointClassification?.labels,
        pointClassification?.categoryValues,
        pointClassification?.categoryShapes,
        pointMissingColumn,
        showMissingPoints
      ]
    }
  };

  return [
    new MultiShapeLayer({
      ...baseLayerProps,
      dashed: showPointStroke && pointStrokeDashed,
      dashLength: pointStrokeDashSpec.shader.dash,
      gapLength: pointStrokeDashSpec.shader.gap,
      dotLength: pointStrokeDashSpec.shader.dot,
      dotGap: pointStrokeDashSpec.shader.dotGap,
      barWidth: pointBarWidth,
      ...symbolPatternLayerProps(symbolPattern)
    })
  ];
}
