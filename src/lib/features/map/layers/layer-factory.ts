import type { Color, Layer } from '@deck.gl/core';
import {
  GeoJsonLayer,
  TextLayer,
  SolidPolygonLayer,
  PathLayer,
  ScatterplotLayer
} from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import RotatableFillStyleExtension from './rotatable-fill-style-extension';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection, Geometry } from 'geojson';
import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import { PRINT_STANDARD_TOKENS } from '$lib/features/commons/utils/layout-sizing.utils';
import * as m from '$lib/paraglide/messages';
import {
  ArrowExtension,
  createLayerId,
  DeckLayerId,
  GeometryType
} from '../constants';
import { arrowTableToGeoJSON, extractGeometryInfo } from '../io';
import type {
  ClassificationConfig,
  PatternParams,
  PrimitiveFilter
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  getEnabledPrimitiveFilters,
  getLinePrimitive,
  getLineThicknessClassification,
  getPolygonPrimitive,
  getPrimitiveCategoryColumn,
  getPrimitiveClassification,
  getPrimitiveSizeColumn,
  getPrimitiveValueColumn,
  getSymbolFillCategoryColumn,
  getSymbolFillClassification,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  getTextPrimitive,
  PrimitiveFilterType,
  ScaleType,
  VisualizationType
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  CATEGORY_SHAPE_CYCLE,
  BasemapDottedPattern,
  CategoryShapeMode,
  ColorMode,
  DEFAULT_COLORS,
  DEFAULT_LINEAR_SYMBOL_BAR_WIDTH,
  DENSITY_DEFAULTS,
  FillMode,
  isLinearShape,
  ProportionalType,
  SHAPE_ORDINAL,
  ShapeType,
  SizeMode,
  SLIDER_LIMITS,
  SymbolMode,
  ThicknessMode,
  StrokeMode
} from '$lib/features/commons/constants/visualization.constants';
import { MultiShapeLayer } from './multi-shape-layer';
import {
  DEFAULT_TEXT_LINE_HEIGHT,
  DECK_TEXT_CHARACTER_SET,
  resolveTextFontSettings
} from './text-character-set';
import type {
  DeckDataRow,
  GeometryInfo,
  LayerContext,
  RGBColor,
  ThematicLayer
} from '../types';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import {
  CARTOGRAPHIC_FONT_FAMILY,
  resolveFontFamilyStack
} from '$lib/features/step-toolbar/fonts.constants';
import {
  getCategoricalColorMap,
  getAbsoluteDomainMax,
  hasCompleteCategoricalColorMap,
  getClassedSizeForValue,
  getColorForValue,
  getProportionalSymbolSizeForValue,
  shouldApplyLineCategorical,
  shouldApplyLineChoropleth,
  shouldApplyCategorical,
  shouldApplyChoropleth,
  shouldApplyProportionalSymbols,
  shouldHideSymbolFill
} from '../utils/data-styling.utils';
import { resolveTextLabelPlacement } from '../utils/text-label-placement.utils';
import {
  createClassedSizeAccessor,
  createCategoricalColorAccessor,
  createGeoJsonClassedSizeAccessor,
  createChoroplethColorAccessor,
  createStrokeClassificationAccessor,
  createGeoJsonCategoricalColorAccessor,
  createGeoJsonChoroplethColorAccessor,
  createGeoJsonProportionalSizeAccessor,
  createGeoJsonProportionalSymbolSizeAccessor,
  HIGHLIGHT_FILL_COLOR,
  createProportionalSizeAccessor,
  createProportionalSymbolSizeAccessor,
  resolveMissingDataRenderProps,
  sortBySizeDescending,
  withGeoJsonRowHighlight,
  withGeoJsonRowHighlightAccessor,
  withOpacity,
  withOpacityPreservingAlpha,
  withRowHighlight,
  withRowHighlightAccessor
} from './layer-helpers';
import {
  getPatternAtlasForPattern,
  isValidPatternId,
  PATTERN_TYPE_MAP,
  type PatternName
} from './pattern-texture';
import { mapPatternTypeToPatternId } from '$lib/features/commons/components/palette-popover/palette.constants';
import {
  createPathLayerProps,
  createScatterplotLayerProps,
  createPolygonFillColorAttribute
} from 'geoarrow-deck-stream';
import type { BinaryPointData, ProjectionLike } from 'geoarrow-deck-stream';
import {
  parsePaths,
  parseSolidPolygons,
  parsePointData,
  parseSolidPolygonsWithProjection,
  parsePathsWithProjection,
  parsePointDataWithProjection,
  pathColorAttr,
  pathWidthAttr,
  pointColorAttr,
  pointRadiusAttr,
  rowAccessor,
  pointPositions,
  projectGeoJSON
} from '../utils/geoarrow-stream-bridge.utils';
import { resolveHoverHighlightProps } from '../utils/hover-highlight-props.utils';
import { resolveMissingDataPointShape as resolveMissingPointShape } from '../utils/legend.utils';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { createCompatibleSolidPolygonLayerProps } from '../utils/solid-polygon-layer-props.utils';
import {
  buildSplitDatasetRowMapping,
  createSplitAwareNullableRowAccessor,
  createSplitAwareRowAccessor as ctxRowAccessor,
  createSplitGeoJsonFeatureAccessor,
  createSplitGeoJsonNullableFeatureAccessor,
  hasSplitRenderingContext,
  resolveSplitMappingFeatureIdColumn
} from './split-rendering-accessors';

export { resolveSplitMappingFeatureIdColumn } from './split-rendering-accessors';

const HIGHLIGHT_DIMMING_FACTOR = 0.3;

export const DEFAULT_TEXT_SIZE = PRINT_STANDARD_TOKENS.annotations.noteFontSize;

const SYMBOL_PATTERN_TYPE = {
  DOTS: 1,
  LINES: 2,
  CROSSHATCH: 3,
  DASHES: 4
} as const;

export const DEFAULT_HALO_WIDTH = 2;
export const DEFAULT_TEXT_FONT = resolveFontFamilyStack(
  CARTOGRAPHIC_FONT_FAMILY
);
const SELECTED_POLYGON_STROKE_COLOR: [number, number, number, number] = [
  15, 98, 254, 255
];
const SELECTED_POLYGON_STROKE_WIDTH = 3;
const DASH_EXTENSION = new PathStyleExtension({ dash: true });
const DEFAULT_MISSING_DATA_PATTERN_ID: PatternName = 'diagonal';
const DEFAULT_DASH_ARRAY: [number, number] = [3, 2];

function resolveThematicStrokeDashArray(
  pattern: BasemapDottedPattern | undefined
): [number, number] {
  switch (pattern) {
    case BasemapDottedPattern.DOTS:
      return [1, 3];
    case BasemapDottedPattern.DASHES:
      return [6, 4];
    case BasemapDottedPattern.DASH_DOT:
      return [2, 2];
    case BasemapDottedPattern.LONG_DASH:
      return [12, 4];
    default:
      return DEFAULT_DASH_ARRAY;
  }
}

function resolveThematicStrokeCapRounded(
  pattern: BasemapDottedPattern | undefined
): boolean {
  return (
    pattern === BasemapDottedPattern.DOTS ||
    pattern === BasemapDottedPattern.DASH_DOT
  );
}

interface SymbolDashSpec {
  // Shader (MultiShapeLayer) representation, in stroke-width multiples.
  // `dot` > 0 renders a real round dot (diameter ~= stroke width) after the gap.
  shader: { dash: number; gap: number; dot: number; dotGap: number };
}

function resolveSymbolDashSpec(
  pattern: BasemapDottedPattern | undefined
): SymbolDashSpec {
  switch (pattern) {
    case BasemapDottedPattern.DOTS:
      return {
        shader: { dash: 0, gap: 0, dot: 1, dotGap: 2.5 }
      };
    case BasemapDottedPattern.DASHES:
      return {
        shader: { dash: 3, gap: 2.5, dot: 0, dotGap: 0 }
      };
    case BasemapDottedPattern.DASH_DOT:
      return {
        shader: { dash: 3, gap: 2.5, dot: 1, dotGap: 2.5 }
      };
    case BasemapDottedPattern.LONG_DASH:
      return {
        shader: { dash: 6, gap: 3, dot: 0, dotGap: 0 }
      };
    default:
      return {
        shader: { dash: 3, gap: 2, dot: 0, dotGap: 0 }
      };
  }
}

function isMissingLineNumericValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  const numericValue = typeof value === 'number' ? value : Number(value);
  return !Number.isFinite(numericValue);
}

function isMissingLineCategoryValue(
  value: unknown,
  colorMap: Map<string, RGBColor> | null
): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  return !colorMap?.has(String(value));
}

export const DEFAULT_TEXT_MASK_PADDING: [number, number] = [3, 1];
export const TEXT_COLLISION_SAFE_PADDING: [number, number] = [4, 4];
export const TEXT_COLLISION_PRIORITY = 1;

export const TRANSPARENT_BACKGROUND_COLOR: Color = [0, 0, 0, 0];
const DEFAULT_LABEL_COLOR = hexToRgb(DEFAULT_COLORS.text);

export const DEFAULT_TEXT_COLOR = hexToRgb(DEFAULT_COLORS.text);

export function resolveDeckTextFontWeight(
  weight: string | number,
  italic = false
): string | number {
  return italic ? `italic ${weight}` : weight;
}

export function resolveDeckTextFontFamily(fontFamily?: string): string {
  return resolveFontFamilyStack(fontFamily) || DEFAULT_TEXT_FONT;
}

type BinaryLayerInteractionData = {
  khartisSourceTable?: ArrowTable;
  khartisSplitDatasetTable?: ArrowTable;

  khartisSplitDatasetRowByGeomRow?: Int32Array;
  featureIds?: Uint32Array;
};

type ScatterBinaryData = {
  attributes: Record<string, unknown>;
  khartisSourceTable?: ArrowTable;
  length?: number;
  featureIds?: Uint32Array;
};

type NumericArray =
  | number[]
  | Float32Array
  | Float64Array
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array;

function createNumericArrayClone(
  source: NumericArray,
  length: number
): NumericArray {
  if (Array.isArray(source)) return new Array<number>(length).fill(0);
  if (source instanceof Float32Array) return new Float32Array(length);
  if (source instanceof Float64Array) return new Float64Array(length);
  if (source instanceof Int8Array) return new Int8Array(length);
  if (source instanceof Uint8Array) return new Uint8Array(length);
  if (source instanceof Uint8ClampedArray) return new Uint8ClampedArray(length);
  if (source instanceof Int16Array) return new Int16Array(length);
  if (source instanceof Uint16Array) return new Uint16Array(length);
  if (source instanceof Int32Array) return new Int32Array(length);
  return new Uint32Array(length);
}

function isNumericArray(value: unknown): value is NumericArray {
  return (
    Array.isArray(value) ||
    value instanceof Float32Array ||
    value instanceof Float64Array ||
    value instanceof Int8Array ||
    value instanceof Uint8Array ||
    value instanceof Uint8ClampedArray ||
    value instanceof Int16Array ||
    value instanceof Uint16Array ||
    value instanceof Int32Array ||
    value instanceof Uint32Array
  );
}

function reorderNumericArray(
  source: NumericArray,
  order: number[],
  itemSize: number
): NumericArray {
  const out = createNumericArrayClone(source, source.length);
  for (let targetIndex = 0; targetIndex < order.length; targetIndex += 1) {
    const sourceIndex = order[targetIndex];
    for (let component = 0; component < itemSize; component += 1) {
      const from = sourceIndex * itemSize + component;
      const to = targetIndex * itemSize + component;
      out[to] = source[from] ?? 0;
    }
  }
  return out;
}

function reorderBinaryAttribute(
  attribute: unknown,
  order: number[],
  length: number
): unknown {
  if (typeof attribute !== 'object' || attribute === null) return attribute;
  const record = attribute as { value?: unknown; size?: unknown };
  const itemSize = typeof record.size === 'number' ? record.size : 1;
  if (itemSize <= 0 || !isNumericArray(record.value)) return attribute;
  if (record.value.length !== length * itemSize) return attribute;

  return {
    ...record,
    value: reorderNumericArray(record.value, order, itemSize)
  };
}

function sortScatterBinaryDataByRadius(scatterBinaryData: ScatterBinaryData) {
  const featureIds = scatterBinaryData.featureIds;
  const radiusAttribute = scatterBinaryData.attributes.getRadius as
    | { value?: unknown; size?: unknown }
    | undefined;
  const radiusValues = radiusAttribute?.value;
  if (
    !featureIds ||
    !radiusAttribute ||
    radiusAttribute.size !== 1 ||
    !isNumericArray(radiusValues) ||
    radiusValues.length !== featureIds.length
  ) {
    return;
  }

  const order = Array.from({ length: featureIds.length }, (_, index) => index);
  order.sort((a, b) => {
    const radiusDelta =
      Number(radiusValues[b] ?? 0) - Number(radiusValues[a] ?? 0);
    return radiusDelta === 0 ? a - b : radiusDelta;
  });

  scatterBinaryData.featureIds = reorderNumericArray(
    featureIds,
    order,
    1
  ) as Uint32Array;
  for (const [key, attribute] of Object.entries(scatterBinaryData.attributes)) {
    scatterBinaryData.attributes[key] = reorderBinaryAttribute(
      attribute,
      order,
      featureIds.length
    );
  }
}

function cloneScatterBinaryData(
  scatterProps: ReturnType<typeof createScatterplotLayerProps>
): ScatterBinaryData {
  const sourceData = scatterProps.data as ScatterBinaryData;
  const clonedData: ScatterBinaryData = {
    ...sourceData,
    attributes: { ...sourceData.attributes }
  };
  (
    scatterProps as unknown as {
      data: ScatterBinaryData;
    }
  ).data = clonedData;
  return clonedData;
}

function resolveProportionalSymbolScale(shape: ShapeType): ScaleType {
  return isLinearShape(shape) ? ScaleType.LINEAR : ScaleType.SQRT;
}

function attachBinaryPickingMetadata(
  target: BinaryLayerInteractionData,
  sourceTable: ArrowTable,
  sourceData: { readonly featureIds?: Uint32Array },
  ctx?: LayerContext
): void {
  if (ctx?.splitDatasetTable && ctx.splitFeatureIdColumn) {
    const featureIdColumn = resolveSplitMappingFeatureIdColumn(
      sourceTable,
      ctx.splitFeatureIdColumn
    );

    target.khartisSourceTable = ctx.splitDatasetTable;
    target.khartisSplitDatasetTable = ctx.splitDatasetTable;
    if (featureIdColumn) {
      target.khartisSplitDatasetRowByGeomRow = buildSplitDatasetRowMapping(
        sourceTable,
        ctx.splitDatasetTable,
        featureIdColumn
      );
    }
  } else {
    target.khartisSourceTable = sourceTable;
  }
  if (sourceData.featureIds instanceof Uint32Array) {
    target.featureIds = sourceData.featureIds;
  }
}

export function getRepresentativePointSource(
  ctx: LayerContext
): { table: ArrowTable; geometryInfo: GeometryInfo } | null {
  const representativePointTable = ctx.representativePointTable;
  if (!representativePointTable) {
    return null;
  }

  const geometryInfo =
    ctx.representativePointGeometryInfo ??
    extractGeometryInfo(representativePointTable);
  if (!geometryInfo) {
    return null;
  }

  if (
    geometryInfo.type !== GeometryType.POINT &&
    geometryInfo.type !== GeometryType.MULTIPOINT
  ) {
    return null;
  }

  return {
    table: representativePointTable,
    geometryInfo
  };
}

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

function usesDoubleProportionalSymbols(viz: LayerContext['viz']): boolean {
  const pointConfig = getSymbolPrimitive(viz);
  return Boolean(
    viz &&
    pointConfig?.mode === SymbolMode.PROPORTIONAL &&
    pointConfig.proportionalType === ProportionalType.DOUBLE &&
    pointConfig.sizeColumn &&
    pointConfig.valueColumn
  );
}

function createDoubleProportionalPointLayers(
  pointData: BinaryPointData,
  jsTable: ArrowTable,
  ctx: LayerContext,
  layerId: string
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
    secondaryStatistics,
    highlightedRowIds,
    modelMatrix,
    beforeId
  } = ctx;
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

  const pointStrokeColor = Array.isArray(pointConfig.strokeColor)
    ? hexToRgb(pointConfig.strokeColor[0] ?? '#000000')
    : typeof pointConfig.strokeColor === 'string'
      ? hexToRgb(pointConfig.strokeColor)
      : strokeColor;
  const pointStrokeWidth = pointConfig.strokeWidth ?? strokeWidth;
  const pointStrokeOpacity = pointConfig.strokeOpacity ?? rawStrokeOpacity;
  const pointStrokeDashed = pointConfig.strokeDashed ?? false;
  const pointStrokeDashSpec = resolveSymbolDashSpec(
    pointConfig.strokeDashedPattern
  );
  const showPointStroke =
    pointConfig.strokeMode !== StrokeMode.NONE &&
    pointStrokeOpacity > 0 &&
    pointStrokeWidth > 0;
  const pointFillOpacity = pointConfig.opacity ?? rawFillOpacity;
  const secondaryFillColor = hexToRgb(pointConfig.fillColorB ?? '#ff832b');
  const pointShape = pointConfig.shape ?? ShapeType.CIRCLE;
  const pointBarWidth = pointConfig.barWidth ?? DEFAULT_LINEAR_SYMBOL_BAR_WIDTH;
  const minPointRadius = Math.max(1, pointConfig.minSize ?? 1);
  const maxPointRadius = Math.max(0, pointConfig.maxSize ?? minPointRadius);
  const proportionalSymbolScale = resolveProportionalSymbolScale(pointShape);
  const missingPointRadius = Math.max(
    1,
    pointConfig.missingData?.size ?? minPointRadius
  );
  const showMissingPoints = pointConfig.missingData?.show ?? true;
  const missingPointColor = hexToRgb(
    pointConfig.missingData?.color ?? DEFAULT_COLORS.missingData
  );
  const missingPointShape = resolveMissingPointShape(
    pointConfig.missingData?.shape
  );
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
  const symbolPatternType =
    pointConfig.mode === SymbolMode.CATEGORIES
      ? resolveSymbolPatternType(pointClassification)
      : pointConfig.fillMode === FillMode.CATEGORIES
        ? resolveSymbolPatternType(pointFillClassification)
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
    jsTable,
    createFillAccessor(
      pointSizeColumn,
      fillColor,
      secondaryFillColor,
      breakValueA
    )
  );
  const secondaryFillByFeatureId = rowAccessor(
    jsTable,
    createFillAccessor(
      pointValueColumn,
      secondaryFillColor,
      fillColor,
      breakValueB
    )
  );
  const primaryLineByFeatureId = rowAccessor(
    jsTable,
    createLineAccessor(pointSizeColumn)
  );
  const secondaryLineByFeatureId = rowAccessor(
    jsTable,
    createLineAccessor(pointValueColumn)
  );
  const primaryRadiusByFeatureId = rowAccessor(
    jsTable,
    createRadiusAccessor(pointSizeColumn, primaryRadiusAccessor)
  );
  const secondaryRadiusByFeatureId = rowAccessor(
    jsTable,
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
    attachBinaryPickingMetadata(scatterBinaryData, jsTable, pointData, ctx);
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
      jsTable,
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
      patternEnabled: symbolPatternType !== null,
      patternType: symbolPatternType ?? SYMBOL_PATTERN_TYPE.DOTS,
      opacity: 1,
      radiusScale: layoutProps.radiusScale,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      lineWidthScale: showPointStroke ? pointStrokeWidth / 3 : 0,
      pickable,
      parameters: THEMATIC_OVERLAY_PARAMETERS,
      ...resolveHoverHighlightProps(pickable),
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

function buildShapeAttribute(
  featureIds: Uint32Array | undefined,
  jsTable: ArrowTable,
  missingColumn: string | undefined,
  shapeOrdinal: number,
  missingShapeOrdinal: number
): { value: Float32Array; size: number } {
  if (!featureIds) {
    return { value: new Float32Array([shapeOrdinal]), size: 1 };
  }
  const out = new Float32Array(featureIds.length);
  for (let i = 0; i < featureIds.length; i += 1) {
    if (missingColumn) {
      const row = jsTable.get(featureIds[i]) as DeckDataRow | null;
      if (row && isMissingThematicValue(row[missingColumn])) {
        out[i] = missingShapeOrdinal;
        continue;
      }
    }
    out[i] = shapeOrdinal;
  }
  return { value: out, size: 1 };
}

function createRepresentativePointSymbolLayers(
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
  const pointStrokeColor = Array.isArray(pointConfig.strokeColor)
    ? hexToRgb(pointConfig.strokeColor[0] ?? '#000000')
    : typeof pointConfig.strokeColor === 'string'
      ? hexToRgb(pointConfig.strokeColor)
      : strokeColor;
  const pointStrokeWidth = pointConfig.strokeWidth ?? strokeWidth;
  const pointStrokeOpacity = pointConfig.strokeOpacity ?? rawStrokeOpacity;
  const pointStrokeDashed = pointConfig.strokeDashed ?? false;
  const pointStrokeDashSpec = resolveSymbolDashSpec(
    pointConfig.strokeDashedPattern
  );
  const showPointStroke =
    pointConfig.strokeMode !== StrokeMode.NONE &&
    pointStrokeOpacity > 0 &&
    pointStrokeWidth > 0;
  const hideSymbolFill = shouldHideSymbolFill(viz);

  const representativePointSource = getRepresentativePointSource(ctx);
  if (!representativePointSource) {
    return [];
  }

  const pointData = resolvePointParser(ctx.customProjection)(
    representativePointSource.table
  );

  const pointLayerId = createThematicLayerId(DeckLayerId.POINT_LAYER, ctx);

  if (usesDoubleProportionalSymbols(viz)) {
    return createDoubleProportionalPointLayers(
      pointData,
      jsTable,
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
  const symbolPatternType =
    pointConfig.mode === SymbolMode.CATEGORIES
      ? resolveSymbolPatternType(pointClassification)
      : pointConfig.fillMode === FillMode.CATEGORIES
        ? resolveSymbolPatternType(pointFillClassification)
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
  const showMissingPoints = pointConfig.missingData?.show ?? true;
  const missingPointColor = hexToRgb(
    pointConfig.missingData?.color ?? DEFAULT_COLORS.missingData
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
  const missingPointRadius = Math.max(
    1,
    pointConfig.missingData?.size ?? uniquePointRadius
  );
  const missingPointShape = resolveMissingPointShape(
    pointConfig.missingData?.shape
  );
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
    jsTable,
    resolveFillColorForRow,
    representativePointSource.table
  );
  const lineColorByFeatureId = ctxRowAccessor(
    ctx,
    jsTable,
    resolveLineColorForRow,
    representativePointSource.table
  );
  const radiusByFeatureId = ctxRowAccessor(
    ctx,
    jsTable,
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
  const orderedCategoryLabels = (() => {
    if (!useCategoryShape || !categoryShapeVector) return null;
    const labels = pointClassification?.labels;
    if (labels && labels.length > 0) return labels;
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = 0; i < symbolAttributeTable.numRows; i += 1) {
      const raw = categoryShapeVector.get(i);
      if (raw === null || raw === undefined) continue;
      const key = String(raw);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    return out;
  })();
  const categoryShapeMap = (() => {
    if (!useCategoryShape || !orderedCategoryLabels) return null;
    const userShapes = pointClassification?.categoryShapes;
    const useUserShapes =
      categoryShapeMode === CategoryShapeMode.DIFFERENT &&
      Array.isArray(userShapes) &&
      userShapes.length > 0;
    const map = new Map<string, number>();
    for (let i = 0; i < orderedCategoryLabels.length; i += 1) {
      const shape = useUserShapes
        ? (userShapes![i] ??
          CATEGORY_SHAPE_CYCLE[i % CATEGORY_SHAPE_CYCLE.length] ??
          ShapeType.CIRCLE)
        : categoryShapeMode === CategoryShapeMode.ORDERED
          ? pointShape
          : (CATEGORY_SHAPE_CYCLE[i % CATEGORY_SHAPE_CYCLE.length] ??
            ShapeType.CIRCLE);
      map.set(orderedCategoryLabels[i], SHAPE_ORDINAL[shape]);
    }
    return map;
  })();
  const categoryRankRadiusMap = (() => {
    if (
      !useCategoryShape ||
      categoryShapeMode !== CategoryShapeMode.ORDERED ||
      !orderedCategoryLabels ||
      orderedCategoryLabels.length === 0
    ) {
      return null;
    }
    const total = orderedCategoryLabels.length;
    const rMin = Math.max(1, minPointRadius);
    const rMax = Math.max(rMin + 2, maxPointRadius);
    const map = new Map<string, number>();
    for (let i = 0; i < total; i += 1) {
      const t = total === 1 ? 0 : i / (total - 1);
      map.set(orderedCategoryLabels[i], rMin + t * (rMax - rMin));
    }
    return map;
  })();

  const shapeByFeatureId = ctxRowAccessor(
    ctx,
    jsTable,
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
      jsTable,
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
      patternEnabled: symbolPatternType !== null,
      patternType: symbolPatternType ?? SYMBOL_PATTERN_TYPE.DOTS,
      opacity: 1,
      radiusScale: 1,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      lineWidthScale: showPointStroke ? pointStrokeWidth / 3 : 0,
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
          pointClassification?.labels,
          symbolPatternType
        ]
      }
    })
  ];
}

function isMissingThematicValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'number') {
    return !Number.isFinite(value);
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  return false;
}

function resolvePointMissingColumn(
  viz: LayerContext['viz'],
  useProportionalSymbols: boolean,
  useClassedSymbols: boolean,
  useCategoricalColor: boolean,
  useChoropleth: boolean
): string | null {
  if (!viz) {
    return null;
  }

  if (useClassedSymbols || useChoropleth) {
    return useClassedSymbols
      ? (getPrimitiveValueColumn(viz, PrimitiveFilterType.POINT) ?? null)
      : (getSymbolFillValueColumn(viz) ?? null);
  }

  if (useProportionalSymbols) {
    return getPrimitiveSizeColumn(viz, PrimitiveFilterType.POINT) ?? null;
  }

  if (useCategoricalColor) {
    return getSymbolPrimitive(viz)?.mode === SymbolMode.CATEGORIES
      ? (getPrimitiveCategoryColumn(viz, PrimitiveFilterType.POINT) ?? null)
      : (getSymbolFillCategoryColumn(viz) ?? null);
  }

  return null;
}

function resolveHighlightedOpacityForRow(
  row: DeckDataRow,
  baseOpacity: number,
  highlightedRowIds: Set<number> | undefined
): number {
  if (!highlightedRowIds || highlightedRowIds.size === 0) {
    return baseOpacity;
  }

  const rowId = row[INTERNAL_COLUMN.ID];
  return highlightedRowIds.has(Number(rowId))
    ? baseOpacity
    : baseOpacity * HIGHLIGHT_DIMMING_FACTOR;
}

function resolveGeoJsonFeatureRowId(
  feature: { properties?: Record<string, unknown> | null },
  fallbackIndex: number
): number {
  const rawId = feature.properties?.[INTERNAL_COLUMN.ID];
  if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    return rawId;
  }

  const coercedId = Number(rawId);
  return Number.isFinite(coercedId) ? coercedId : fallbackIndex + 1;
}

function ensureGeoJsonFeatureIds<T extends Geometry>(
  geojson: FeatureCollection<T>
): FeatureCollection<T> {
  let didChange = false;

  const features = geojson.features.map((feature, index) => {
    const rowId = resolveGeoJsonFeatureRowId(feature, index);
    if (feature.properties?.[INTERNAL_COLUMN.ID] === rowId) {
      return feature;
    }

    didChange = true;
    return {
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        [INTERNAL_COLUMN.ID]: rowId
      }
    };
  });

  return didChange ? { ...geojson, features } : geojson;
}

function isPolygonGeometryType(
  geometryType: GeometryInfo['type'] | Geometry['type'] | undefined
): boolean {
  const normalizedGeometryType = geometryType?.toUpperCase();
  return (
    normalizedGeometryType === GeometryType.POLYGON ||
    normalizedGeometryType === GeometryType.MULTIPOLYGON
  );
}

function createHighlightedPolygonOverlay(
  layerId: string,
  jsTable: ArrowTable,
  geoColumn: string,
  highlightedRowIds: Set<number> | undefined,
  highlightVersion: number,
  ctx: Pick<LayerContext, 'customProjection' | 'modelMatrix' | 'beforeId'>
): Layer<DeckDataRow> | null {
  if (!highlightedRowIds || highlightedRowIds.size === 0) {
    return null;
  }

  try {
    const rawGeoJson = getCachedGeoJSON(jsTable, geoColumn);
    if (!rawGeoJson) {
      return null;
    }

    const highlightedGeoJson: FeatureCollection = {
      ...rawGeoJson,
      features: rawGeoJson.features.filter((feature) => {
        const rowId = feature.properties?.[INTERNAL_COLUMN.ID];
        return typeof rowId === 'number' && highlightedRowIds.has(rowId);
      })
    };

    if (highlightedGeoJson.features.length === 0) {
      return null;
    }

    const projectedGeoJson = ctx.customProjection
      ? projectGeoJSON(highlightedGeoJson, ctx.customProjection)
      : highlightedGeoJson;

    if (projectedGeoJson.features.length === 0) {
      return null;
    }

    return new GeoJsonLayer({
      id: `${layerId}-selection-overlay`,
      data: projectedGeoJson,
      filled: false,
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineColor: SELECTED_POLYGON_STROKE_COLOR,
      getLineWidth: SELECTED_POLYGON_STROKE_WIDTH,
      lineWidthMinPixels: SELECTED_POLYGON_STROKE_WIDTH,
      pickable: false,
      parameters: {
        depthCompare: 'always' as const,
        stencilCompare: 'always' as const
      },
      ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
      ...(ctx.beforeId && { beforeId: ctx.beforeId }),
      updateTriggers: {
        getLineColor: [highlightVersion],
        getLineWidth: [highlightVersion]
      },
      dataComparator: (newData, oldData) => newData === oldData
    });
  } catch (error) {
    logger.error(
      'Failed to create highlighted Arrow path overlay',
      LogCategory.MAP,
      error
    );
    return null;
  }
}

function createHighlightedGeoJsonOverlay<T extends Geometry>(
  layerId: string,
  geojson: FeatureCollection<T>,
  highlightedRowIds: Set<number> | undefined,
  highlightVersion: number,
  ctx: Pick<LayerContext, 'modelMatrix' | 'beforeId'>
): Layer<DeckDataRow> | null {
  if (!highlightedRowIds || highlightedRowIds.size === 0) {
    return null;
  }

  const highlightedGeoJson: FeatureCollection<T> = {
    ...geojson,
    features: geojson.features.filter(
      (feature, index) =>
        isPolygonGeometryType(feature.geometry?.type) &&
        highlightedRowIds.has(resolveGeoJsonFeatureRowId(feature, index))
    )
  };

  if (highlightedGeoJson.features.length === 0) {
    return null;
  }

  return new GeoJsonLayer({
    id: `${layerId}-selection-overlay`,
    data: highlightedGeoJson,
    filled: false,
    stroked: true,
    lineWidthUnits: 'pixels',
    getLineColor: SELECTED_POLYGON_STROKE_COLOR,
    getLineWidth: SELECTED_POLYGON_STROKE_WIDTH,
    lineWidthMinPixels: SELECTED_POLYGON_STROKE_WIDTH,
    pickable: false,
    parameters: {
      depthCompare: 'always' as const,
      stencilCompare: 'always' as const
    },
    ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
    ...(ctx.beforeId && { beforeId: ctx.beforeId }),
    updateTriggers: {
      getLineColor: [highlightVersion],
      getLineWidth: [highlightVersion]
    },
    dataComparator: (newData, oldData) => newData === oldData
  });
}

function toMutableRgba(color: Color): [number, number, number, number] {
  return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[3] ?? 255];
}

function resolvePolygonParser(customProjection?: ProjectionLike) {
  return customProjection
    ? (table: ArrowTable) =>
        parseSolidPolygonsWithProjection(table, customProjection)
    : parseSolidPolygons;
}

function resolvePathParser(customProjection?: ProjectionLike) {
  return customProjection
    ? (table: ArrowTable) => parsePathsWithProjection(table, customProjection)
    : parsePaths;
}

function resolvePointParser(customProjection?: ProjectionLike) {
  return customProjection
    ? (table: ArrowTable) =>
        parsePointDataWithProjection(table, customProjection)
    : parsePointData;
}

const geoJsonConversionCache = new WeakMap<
  ArrowTable,
  Map<string, FeatureCollection | null>
>();

const textLabelCache = new WeakMap<
  ArrowTable,
  Map<ProjectionLike | null, Map<string, TextLayerDatum[]>>
>();

const THEMATIC_OVERLAY_PARAMETERS = {
  depthCompare: 'always' as const
} as const;

export function getCachedGeoJSON(
  table: ArrowTable,
  geoColumn: string
): FeatureCollection | null {
  let columnMap = geoJsonConversionCache.get(table);
  if (columnMap) {
    const cached = columnMap.get(geoColumn);
    if (cached !== undefined) return cached;
  } else {
    columnMap = new Map();
    geoJsonConversionCache.set(table, columnMap);
  }
  const result = arrowTableToGeoJSON(table, geoColumn);
  columnMap.set(geoColumn, result);
  return result;
}

let fillStyleExtensionInstance: RotatableFillStyleExtension | null = null;

function getFillStyleExtension(): RotatableFillStyleExtension {
  if (!fillStyleExtensionInstance) {
    fillStyleExtensionInstance = new RotatableFillStyleExtension({
      pattern: true
    });
  }
  return fillStyleExtensionInstance;
}

type PolygonPatternProps = {
  extensions: RotatableFillStyleExtension[];
  fillPatternAtlas: HTMLCanvasElement;
  fillPatternMapping: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >;
  fillPatternMask: boolean;
  getFillPattern: () => string;
  getFillPatternScale: number;
  getFillPatternRotation: number;
  khartisPatternId: string;
  khartisPatternSize: number;
  khartisPatternScale: number;
  khartisPatternAngle: number;
};

function createPatternProps(
  patternId: PatternName,
  patternParams?: PatternParams
): PolygonPatternProps | null {
  const { atlas, mapping } = getPatternAtlasForPattern(
    patternId,
    patternParams
  );
  if (Object.keys(mapping).length === 0) {
    return null;
  }
  const patternScaleValue = Math.max(1, patternParams?.scale ?? 8);
  const patternSizeValue = Math.max(1, patternParams?.size ?? 4);
  // The atlas tile already bakes the user's size + scale (motif.js), exactly
  // like the CSS preview (buildPatternBackground). The shader consumes
  // getFillPatternScale as "tile size in screen pixels", so render the tile at
  // its native atlas size for a 1:1 match with the popover preview. Deriving it
  // from a slider here re-applied scale a second time and blew tiles up to
  // 40–200 px.
  const patternFrame = mapping[patternId];
  const patternScale = Math.max(1, patternFrame?.width ?? 16);
  const patternRotation =
    patternParams?.angle ?? PATTERN_TYPE_MAP[patternId]?.angle ?? 0;

  return {
    extensions: [getFillStyleExtension()],
    fillPatternAtlas: atlas,
    fillPatternMapping: mapping,
    fillPatternMask: true,
    getFillPattern: () => patternId,
    getFillPatternScale: patternScale,
    getFillPatternRotation: patternRotation,
    khartisPatternId: patternId,
    khartisPatternSize: patternSizeValue,
    khartisPatternScale: patternScaleValue,
    khartisPatternAngle: patternRotation
  };
}

function buildPatternProps(ctx: LayerContext): PolygonPatternProps | null {
  const patternId = ctx.viz
    ? getPrimitiveClassification(ctx.viz, PrimitiveFilterType.POLYGON)
        ?.patternId
    : undefined;
  const patternParams = ctx.viz
    ? getPrimitiveClassification(ctx.viz, PrimitiveFilterType.POLYGON)
        ?.patternParams
    : undefined;
  if (!isValidPatternId(patternId)) {
    return null;
  }

  return createPatternProps(patternId, patternParams);
}

function resolveMissingDataPatternId(
  polygonConfig: ReturnType<typeof getPolygonPrimitive> | undefined
): PatternName {
  const patternId = polygonConfig?.missingData?.patternId;
  if (isValidPatternId(patternId)) {
    return patternId;
  }
  // Legacy fallback: older projects only stored a coarse PatternType.
  return mapPatternTypeToPatternId(
    polygonConfig?.missingData?.patternType,
    DEFAULT_MISSING_DATA_PATTERN_ID
  );
}

function buildMissingDataPatternProps(
  polygonConfig: ReturnType<typeof getPolygonPrimitive> | undefined,
  showMissingPolygons: boolean
): PolygonPatternProps | null {
  if (!showMissingPolygons || !polygonConfig?.missingData?.pattern) {
    return null;
  }

  return createPatternProps(
    resolveMissingDataPatternId(polygonConfig),
    polygonConfig.missingData.patternParams
  );
}

function resolveSymbolPatternType(
  classification: ClassificationConfig | undefined
): number | null {
  switch (classification?.patternId) {
    case 'dots':
      return SYMBOL_PATTERN_TYPE.DOTS;
    case 'cross':
      return SYMBOL_PATTERN_TYPE.CROSSHATCH;
    case 'horizontal':
    case 'vertical':
      return SYMBOL_PATTERN_TYPE.LINES;
    case 'diagonal':
    case 'diagonal-reverse':
    case 'plus':
    case 'square':
    case 'diamond':
    case 'triangle':
      return SYMBOL_PATTERN_TYPE.DASHES;
    default:
      return null;
  }
}

function createPolygonPatternOverlayLayer(
  layerId: string,
  polygonPatternId: string | undefined,
  patternGeojson: FeatureCollection,
  patternProps: PolygonPatternProps,
  ctx: Pick<LayerContext, 'modelMatrix' | 'beforeId'>,
  idSuffix = `pattern-${polygonPatternId ?? 'none'}`
): GeoJsonLayer {
  const { modelMatrix, beforeId } = ctx;

  return new GeoJsonLayer({
    id: `${layerId}-${idSuffix}`,
    data: patternGeojson,
    getFillColor: [0, 0, 0, 255],
    stroked: false,
    opacity: 0.6,
    pickable: false,
    extensions: patternProps.extensions,
    fillPatternAtlas: patternProps.fillPatternAtlas,
    fillPatternMapping: patternProps.fillPatternMapping,
    fillPatternMask: true,
    getFillPattern: patternProps.getFillPattern,
    getFillPatternScale: patternProps.getFillPatternScale,
    getFillPatternRotation: patternProps.getFillPatternRotation,
    ...({
      khartisPatternId: patternProps.khartisPatternId,
      khartisPatternSize: patternProps.khartisPatternSize,
      khartisPatternScale: patternProps.khartisPatternScale,
      khartisPatternAngle: patternProps.khartisPatternAngle
    } as Record<string, unknown>),
    ...(modelMatrix && { modelMatrix }),
    ...(beforeId && { beforeId }),
    updateTriggers: {
      getFillPattern: [polygonPatternId],
      getFillPatternScale: [patternProps.getFillPatternScale],
      getFillPatternRotation: [patternProps.getFillPatternRotation]
    },
    dataComparator: (newData, oldData) => newData === oldData
  });
}

function isMissingPolygonFillDatum(
  row: Record<string, unknown>,
  fillMode: FillMode,
  valueColumn: string | undefined,
  categoryColumn: string | undefined,
  categoryColorMap: Map<string, RGBColor> | null
): boolean {
  if (fillMode === FillMode.CLASSES) {
    if (!valueColumn) {
      return false;
    }
    const rawValue = row[valueColumn];
    if (isMissingThematicValue(rawValue)) {
      return true;
    }
    const numericValue =
      typeof rawValue === 'number' ? rawValue : Number(rawValue);
    return !Number.isFinite(numericValue);
  }

  if (fillMode === FillMode.CATEGORIES) {
    if (!categoryColumn) {
      return false;
    }
    const rawValue = row[categoryColumn];
    if (isMissingThematicValue(rawValue)) {
      return true;
    }
    return !categoryColorMap?.has(String(rawValue));
  }

  return false;
}

function filterMissingPolygonPatternFeatures(
  geojson: FeatureCollection,
  ctx: LayerContext,
  geometryTable: ArrowTable,
  fillMode: FillMode,
  valueColumn: string | undefined,
  categoryColumn: string | undefined,
  categoryColorMap: Map<string, RGBColor> | null
): FeatureCollection {
  const rowPredicate = (row: Record<string, unknown>) =>
    isMissingPolygonFillDatum(
      row,
      fillMode,
      valueColumn,
      categoryColumn,
      categoryColorMap
    );
  const splitFeaturePredicate = createSplitGeoJsonFeatureAccessor(
    ctx,
    geometryTable,
    rowPredicate
  );
  const isMissingFeature = splitFeaturePredicate
    ? (feature: { properties?: Record<string, unknown> }) =>
        splitFeaturePredicate(feature)
    : (feature: { properties?: Record<string, unknown> }) =>
        rowPredicate(feature.properties ?? {});

  return {
    ...geojson,
    features: geojson.features.filter((feature) =>
      isMissingFeature({
        properties: feature.properties ?? undefined
      })
    )
  };
}

function createSplitUniqueBinaryColorAccessor(
  ctx: LayerContext,
  sourceTable: ArrowTable,
  geometryTable: ArrowTable,
  color: RGBColor
): ((featureId: number) => [number, number, number, number]) | null {
  if (!hasSplitRenderingContext(ctx)) {
    return null;
  }

  return createSplitAwareNullableRowAccessor(
    ctx,
    sourceTable,
    (row) => (row ? [color[0], color[1], color[2], 255] : [0, 0, 0, 0]),
    geometryTable
  );
}

function createSplitUniqueGeoJsonColorAccessor(
  ctx: LayerContext,
  geometryTable: ArrowTable,
  color: RGBColor
):
  | ((feature: {
      properties?: Record<string, unknown>;
    }) => [number, number, number, number])
  | null {
  return createSplitGeoJsonNullableFeatureAccessor(ctx, geometryTable, (row) =>
    row ? [color[0], color[1], color[2], 255] : [0, 0, 0, 0]
  );
}

function filterSplitMatchedPolygonFeatures(
  geojson: FeatureCollection,
  ctx: LayerContext,
  geometryTable: ArrowTable
): FeatureCollection {
  const splitFeaturePredicate = createSplitGeoJsonNullableFeatureAccessor(
    ctx,
    geometryTable,
    (row) => row !== null
  );
  if (!splitFeaturePredicate) {
    return geojson;
  }

  return {
    ...geojson,
    features: geojson.features.filter((feature) =>
      splitFeaturePredicate({
        properties: feature.properties ?? undefined
      })
    )
  };
}

export type { LayerContext };

function resolveThematicScopeId(ctx: LayerContext): string {
  return ctx.viz?.id ?? ctx.datasetId ?? 'default';
}

export function createTextCollisionProps(
  _ctx?: LayerContext,
  _enabled?: boolean,
  _priority?: number
): Pick<TextLayerWithCollisionProps, 'extensions' | 'collisionEnabled'> {
  return {
    extensions: [],
    collisionEnabled: false
  };
}

export function createThematicLayerId(
  layerType: DeckLayerId,
  ctx: LayerContext
): string {
  return createLayerId(
    layerType,
    resolveThematicScopeId(ctx),
    ctx.projectionSuffix
  );
}

export interface TextLayerDatum {
  position: [number, number];
  primaryText: string | null;
  secondaryText: string | null;
  isMissingData: boolean;
  rowIndex: number;
}

type TextLayerWithCollisionProps = ConstructorParameters<
  typeof TextLayer<TextLayerDatum>
>[0] & {
  collisionEnabled?: boolean;
  collisionGroup?: string;
  getCollisionPriority?: number | ((datum: TextLayerDatum) => number);
  collisionTestProps?: Partial<
    ConstructorParameters<typeof TextLayer<TextLayerDatum>>[0]
  >;
};

export function normalizeOpacity(
  opacity: number | undefined,
  fallback = 1
): number {
  if (typeof opacity !== 'number') return fallback;
  const normalized = opacity > 1 ? opacity / 100 : opacity;
  return Math.min(Math.max(normalized, 0), 1);
}

export function resolveEffectiveCategoryColorMap(
  jsTable: ArrowTable,
  viz: LayerContext['viz'],
  categoryColorMap: Map<string, RGBColor> | null | undefined,
  categoryColumn: string | undefined,
  primitive: PrimitiveFilterType = PrimitiveFilterType.POLYGON
): Map<string, RGBColor> | null {
  const classification = viz
    ? primitive === PrimitiveFilterType.POINT
      ? getSymbolPrimitive(viz)?.mode === SymbolMode.CATEGORIES
        ? (getPrimitiveClassification(viz, primitive) ?? viz.classification)
        : (getSymbolFillClassification(viz) ?? viz.classification)
      : (getPrimitiveClassification(viz, primitive) ?? viz.classification)
    : undefined;
  if (!viz || !categoryColumn || !classification?.colors?.length) {
    return categoryColorMap ?? null;
  }

  const classificationColors = classification.colors ?? [];
  const storedLabels =
    (classification.categoryValues ?? classification.labels)
      ?.map((label) => toTextValue(label))
      .filter((label): label is string => label !== null) ?? [];
  if (storedLabels.length > 0) {
    if (
      hasCompleteCategoricalColorMap(
        storedLabels,
        categoryColorMap,
        classificationColors
      )
    ) {
      return categoryColorMap ?? null;
    }

    return getCategoricalColorMap(storedLabels, classificationColors);
  }

  const categoryVector = jsTable.getChild(categoryColumn);
  if (!categoryVector) {
    return categoryColorMap ?? null;
  }

  const categories = new Set<string>();
  for (let rowIndex = 0; rowIndex < jsTable.numRows; rowIndex += 1) {
    const value = toTextValue(categoryVector.get(rowIndex));
    if (value) {
      categories.add(value);
    }
  }

  if (categories.size === 0) {
    return categoryColorMap ?? null;
  }

  const categoryList = [...categories];
  if (
    hasCompleteCategoricalColorMap(
      categoryList,
      categoryColorMap,
      classificationColors
    )
  ) {
    return categoryColorMap ?? null;
  }

  return getCategoricalColorMap(categoryList, classificationColors);
}

export function resolveTextAnchor(
  align: 'left' | 'center' | 'right' | undefined
): 'start' | 'middle' | 'end' {
  switch (align) {
    case 'left':
      return 'start';
    case 'right':
      return 'end';
    default:
      return 'middle';
  }
}

function resolveVerticalPadding(
  padding: readonly number[] | undefined
): number {
  return Array.isArray(padding) ? (padding[1] ?? 0) : 0;
}

function isTextDatumAccessor<T>(
  accessor: T | ((datum: TextLayerDatum) => T)
): accessor is (datum: TextLayerDatum) => T {
  return typeof accessor === 'function';
}

function resolveAccessorValue<T>(
  accessor: T | ((datum: TextLayerDatum) => T),
  datum: TextLayerDatum
): T {
  return isTextDatumAccessor(accessor) ? accessor(datum) : accessor;
}

export function resolveVariableTextSizeBounds(baseSize: number): {
  minSize: number;
  maxSize: number;
} {
  const { min, max } = SLIDER_LIMITS.textSize;
  const clampedBaseSize = Math.min(Math.max(baseSize, min), max);
  const minSize = min;
  const maxSize = clampedBaseSize;

  return {
    minSize: Math.min(minSize, maxSize),
    maxSize
  };
}

export function resolveStyleColor(
  styleColor: string | string[] | undefined,
  fallback: RGBColor
): RGBColor {
  if (Array.isArray(styleColor) && typeof styleColor[0] === 'string') {
    return hexToRgb(styleColor[0]);
  }
  if (typeof styleColor === 'string') {
    return hexToRgb(styleColor);
  }
  return fallback;
}

export function toTextValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function resolveMissingTextLabel(label: string | undefined): string {
  const normalizedLabel = label?.trim();
  return normalizedLabel && normalizedLabel.length > 0 ? normalizedLabel : '•';
}

export function resolveTextDatumText(
  datum: TextLayerDatum,
  missingTextLabel: string
): string {
  if (datum.isMissingData || !datum.primaryText) {
    return missingTextLabel;
  }

  return datum.secondaryText
    ? `${datum.primaryText}\n${datum.secondaryText}`
    : datum.primaryText;
}

function collectCoordinates(
  value: unknown,
  output: Array<[number, number]>
): void {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }

  const maybeLng = value[0];
  const maybeLat = value[1];

  if (
    typeof maybeLng === 'number' &&
    typeof maybeLat === 'number' &&
    Number.isFinite(maybeLng) &&
    Number.isFinite(maybeLat)
  ) {
    output.push([maybeLng, maybeLat]);
    return;
  }

  for (const nested of value) {
    collectCoordinates(nested, output);
  }
}

function getGeometryAnchor(
  geometry: Geometry | null | undefined
): [number, number] | null {
  if (!geometry || !('coordinates' in geometry)) {
    return null;
  }

  const coordinates: Array<[number, number]> = [];
  collectCoordinates(geometry.coordinates, coordinates);

  if (coordinates.length === 0) {
    return null;
  }

  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    return coordinates[Math.floor(coordinates.length / 2)] ?? null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [lng, lat] of coordinates) {
    if (lng < minX) minX = lng;
    if (lng > maxX) maxX = lng;
    if (lat < minY) minY = lat;
    if (lat > maxY) maxY = lat;
  }

  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

export function createTextLayerData(
  geojson: FeatureCollection,
  primaryColumn: string,
  secondaryColumn?: string
): TextLayerDatum[] {
  const output: TextLayerDatum[] = [];

  for (const [rowIndex, feature] of geojson.features.entries()) {
    const primaryText = toTextValue(feature.properties?.[primaryColumn]);
    const position = getGeometryAnchor(feature.geometry);
    if (!position) {
      continue;
    }

    const isMissingData = primaryText === null;
    const secondaryText =
      !isMissingData && secondaryColumn
        ? toTextValue(feature.properties?.[secondaryColumn])
        : null;

    output.push({
      position,
      primaryText,
      secondaryText,
      isMissingData,
      rowIndex
    });
  }

  return output;
}

export function createTextLayerDataFromBinary(
  table: ArrowTable,
  geoInfo: GeometryInfo,
  primaryColumn: string,
  secondaryColumn?: string,
  customProjection?: ProjectionLike,
  attributeTable: ArrowTable = table,
  attributeRowByGeometryRow?: Int32Array
): TextLayerDatum[] {
  const canUseCache =
    attributeTable === table && attributeRowByGeometryRow === undefined;

  const projKey = customProjection ?? null;
  const labelCacheKey = `${geoInfo.type}:${primaryColumn}:${secondaryColumn ?? ''}`;
  if (canUseCache) {
    const tableMap = textLabelCache.get(table);
    if (tableMap) {
      const projMap = tableMap.get(projKey);
      if (projMap) {
        const cached = projMap.get(labelCacheKey);
        if (cached) return cached;
      }
    }
  }

  const geoType = geoInfo.type;
  if (geoType !== GeometryType.POINT && geoType !== GeometryType.MULTIPOINT) {
    return [];
  }

  const pointData = resolvePointParser(customProjection)(table);
  const centroids = pointPositions(pointData);
  const featureIds = pointData.featureIds;

  const primaryVector = attributeTable.getChild(primaryColumn);
  if (!primaryVector) return [];
  const secondaryVector = secondaryColumn
    ? attributeTable.getChild(secondaryColumn)
    : null;

  const output: TextLayerDatum[] = [];
  const numFeatures = centroids.length / 2;
  const seen = new Set<number>();

  for (let i = 0; i < numFeatures; i++) {
    const fid = featureIds[i];

    if (seen.has(fid)) continue;
    seen.add(fid);

    const rowIndex =
      attributeRowByGeometryRow?.[fid] !== undefined
        ? attributeRowByGeometryRow[fid]
        : fid;
    if (rowIndex === undefined || rowIndex < 0) {
      continue;
    }

    const primaryText = toTextValue(primaryVector.get(rowIndex));
    const x = centroids[i * 2];
    const y = centroids[i * 2 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const isMissingData = primaryText === null;
    const secondaryText =
      !isMissingData && secondaryVector
        ? toTextValue(secondaryVector.get(rowIndex))
        : null;

    output.push({
      position: [x, y],
      primaryText,
      secondaryText,
      isMissingData,
      rowIndex
    });
  }

  if (canUseCache) {
    let tMap = textLabelCache.get(table);
    if (!tMap) {
      tMap = new Map();
      textLabelCache.set(table, tMap);
    }
    let pMap = tMap.get(projKey);
    if (!pMap) {
      pMap = new Map();
      tMap.set(projKey, pMap);
    }
    pMap.set(labelCacheKey, output);
  }

  return output;
}

function createTextOverlayLayers(
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
  const representativePointSource = getRepresentativePointSource(ctx);
  const textPointSource =
    representativePointSource ??
    (geometryInfo.type === GeometryType.POINT
      ? {
          table: jsTable,
          geometryInfo
        }
      : null);
  const textAttributeTable = ctx.splitDatasetTable ?? jsTable;
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
    } catch {
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
  const showMissingPoints = pointConfig?.missingData?.show ?? true;
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
  const missingPointRadius = Math.max(
    1,
    pointConfig?.missingData?.size ?? uniquePointRadius
  );
  const classCountHint =
    pointClassification?.numClasses ?? pointClassification?.colors?.length;
  const hasPointSymbols = Boolean(viz && pointConfig?.enabled);
  const secondaryLabelValueVector = secondaryLabelColumn
    ? textAttributeTable.getChild(secondaryLabelColumn)
    : null;

  const backgroundBorderWidth = 0;
  const backgroundBorderColor = TRANSPARENT_BACKGROUND_COLOR;
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
      const labelLayerProps: TextLayerWithCollisionProps = {
        id: labelLayerId,
        data: labelData,
        getPosition: (d) => d.position,
        getText: (d) => d.primaryText ?? '',
        getColor: withOpacity(labelColor, labelOpacity),
        getSize: labelSizeAccessor,
        sizeUnits: 'pixels',
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
        characterSet: DECK_TEXT_CHARACTER_SET,
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
        outlineWidth: secondaryLabelsConfig.halo
          ? (secondaryLabelsConfig.haloWidth ?? DEFAULT_HALO_WIDTH)
          : 0,
        background: true,
        getBackgroundColor: backgroundColorAccessor,
        getBorderWidth: backgroundBorderWidth,
        getBorderColor: backgroundBorderColor,
        backgroundPadding: sharedBackgroundPadding,
        backgroundBorderRadius: 2,
        ...createTextCollisionProps(),
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
          characterSet: DECK_TEXT_CHARACTER_SET,
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
          outlineWidth: textConfig.halo
            ? (textConfig.haloWidth ?? DEFAULT_HALO_WIDTH)
            : 0,
          background: true,
          getBackgroundColor: backgroundColorAccessor,
          getBorderWidth: backgroundBorderWidth,
          getBorderColor: backgroundBorderColor,
          backgroundPadding: sharedBackgroundPadding,
          backgroundBorderRadius: 2,
          ...createTextCollisionProps(),
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

function buildCategoryColorMapFromLabels(
  labels: string[] | undefined,
  colors: string[] | undefined
): Map<string, RGBColor> | null {
  if (!labels?.length || !colors?.length) {
    return null;
  }

  const map = new Map<string, RGBColor>();
  labels.forEach((label, index) => {
    const hex = colors[index % colors.length];
    if (hex) {
      map.set(label, hexToRgb(hex));
    }
  });
  return map;
}

function createDotDensityLayers(
  jsTable: ArrowTable,
  ctx: LayerContext,
  layerId: string
): Layer<DeckDataRow>[] {
  const { viz, modelMatrix, beforeId } = ctx;
  if (!viz?.density) return [];

  const dotSize = Math.max(
    0.1,
    viz.density.dotSize ?? DENSITY_DEFAULTS.dotSize
  );
  const fillColorHex = viz.density.color ?? DENSITY_DEFAULTS.color;
  const alpha = Math.round(255 * normalizeOpacity(viz.style.fillOpacity, 1));
  const rgb = hexToRgb(fillColorHex);
  const fillColor: [number, number, number, number] = [
    rgb[0],
    rgb[1],
    rgb[2],
    alpha
  ];

  const pointData = ((): BinaryPointData | null => {
    try {
      return ctx.customProjection
        ? parsePointDataWithProjection(jsTable, ctx.customProjection)
        : parsePointData(jsTable);
    } catch (error) {
      logger.error(
        'Failed to parse point symbol layer data',
        LogCategory.MAP,
        error
      );
      return null;
    }
  })();

  if (!pointData) return [];

  const densityLayer = new ScatterplotLayer({
    id: `${layerId}-density`,
    ...(createScatterplotLayerProps(pointData) as unknown as Record<
      string,
      unknown
    >),
    stroked: false,
    filled: true,
    opacity: 1,
    getFillColor: fillColor,
    getRadius: dotSize,
    radiusUnits: 'pixels',
    pickable: false,
    ...(modelMatrix && { modelMatrix }),
    ...(beforeId && { beforeId }),
    updateTriggers: {
      getFillColor: [fillColorHex, alpha],
      getRadius: [dotSize]
    }
  });

  return [densityLayer as unknown as Layer<DeckDataRow>];
}

export function createPointLayers(
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
  const pointStrokeColor = Array.isArray(pointConfig?.strokeColor)
    ? hexToRgb(pointConfig.strokeColor[0] ?? '#000000')
    : typeof pointConfig?.strokeColor === 'string'
      ? hexToRgb(pointConfig.strokeColor)
      : strokeColor;
  const pointStrokeWidth = pointConfig?.strokeWidth ?? strokeWidth;
  const pointStrokeOpacity = pointConfig?.strokeOpacity ?? rawStrokeOpacity;
  const pointStrokeDashed = pointConfig?.strokeDashed ?? false;
  const pointStrokeDashSpec = resolveSymbolDashSpec(
    pointConfig?.strokeDashedPattern
  );
  const showPointStroke =
    pointConfig?.strokeMode !== StrokeMode.NONE &&
    pointStrokeOpacity > 0 &&
    pointStrokeWidth > 0;
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
  const symbolPatternType =
    pointConfig?.mode === SymbolMode.CATEGORIES
      ? resolveSymbolPatternType(pointClassification)
      : pointConfig?.fillMode === FillMode.CATEGORIES
        ? resolveSymbolPatternType(
            pointFillClassification ?? pointClassification
          )
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
  const showMissingPoints = pointConfig?.missingData?.show ?? true;
  const missingPointColor = hexToRgb(
    pointConfig?.missingData?.color ?? DEFAULT_COLORS.missingData
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
  const missingPointRadius = Math.max(
    1,
    pointConfig?.missingData?.size ?? uniquePointRadius
  );
  const missingPointShape = resolveMissingPointShape(
    pointConfig?.missingData?.shape
  );

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
      geojsonData =
        rawGeoJSON && ctx.customProjection
          ? projectGeoJSON(rawGeoJSON, ctx.customProjection)
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
        lineWidthUnits: 'pixels',
        getLineWidth: showPointStroke ? pointStrokeWidth / 3 : 0,
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
  const isDisabledPointCategoryRow = (row: DeckDataRow): boolean =>
    usesPointCategories &&
    pointCategoryColumn !== undefined &&
    disabledPointCategoryLabels.has(String(row[pointCategoryColumn]));
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

  const orderedCategoryLabels = (() => {
    if (!useCategoryShape || !pointCategoryColumn) return null;
    const categoryVector = jsTable.getChild(pointCategoryColumn);
    if (!categoryVector) return null;
    const labels = pointClassification?.labels;
    if (labels && labels.length > 0) return labels;
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = 0; i < jsTable.numRows; i += 1) {
      const raw = categoryVector.get(i);
      if (raw === null || raw === undefined) continue;
      const key = String(raw);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    return out;
  })();

  const categoryShapeMap = (() => {
    if (!useCategoryShape || !orderedCategoryLabels) return null;
    const userShapes = pointClassification?.categoryShapes;
    const useUserShapes =
      categoryShapeMode === CategoryShapeMode.DIFFERENT &&
      Array.isArray(userShapes) &&
      userShapes.length > 0;
    const map = new Map<string, number>();
    for (let i = 0; i < orderedCategoryLabels.length; i += 1) {
      const shape = useUserShapes
        ? (userShapes![i] ??
          CATEGORY_SHAPE_CYCLE[i % CATEGORY_SHAPE_CYCLE.length] ??
          ShapeType.CIRCLE)
        : categoryShapeMode === CategoryShapeMode.ORDERED
          ? pointShape
          : (CATEGORY_SHAPE_CYCLE[i % CATEGORY_SHAPE_CYCLE.length] ??
            ShapeType.CIRCLE);
      map.set(orderedCategoryLabels[i], SHAPE_ORDINAL[shape]);
    }
    return map;
  })();

  const categoryRankRadiusMap = (() => {
    if (
      !useCategoryShape ||
      categoryShapeMode !== CategoryShapeMode.ORDERED ||
      !orderedCategoryLabels ||
      orderedCategoryLabels.length === 0
    ) {
      return null;
    }
    const total = orderedCategoryLabels.length;
    const rMin = Math.max(1, minPointRadius);
    const rMax = Math.max(rMin, maxPointRadius);
    const map = new Map<string, number>();
    for (let i = 0; i < total; i += 1) {
      const t = total === 1 ? 0 : i / (total - 1);
      map.set(orderedCategoryLabels[i], rMin + t * (rMax - rMin));
    }
    return map;
  })();

  if (useCategoryShape && categoryShapeMap && pointCategoryColumn) {
    const featureIds = scatterBinaryData.featureIds;
    const categoryVector = jsTable.getChild(pointCategoryColumn);
    const length = featureIds ? featureIds.length : jsTable.numRows;
    const shapeArr = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const rowIdx = featureIds ? featureIds[i] : i;
      if (pointMissingColumn) {
        const row = jsTable.get(rowIdx) as DeckDataRow | null;
        if (row && isMissingThematicValue(row[pointMissingColumn])) {
          shapeArr[i] = missingShapeOrdinal;
          continue;
        }
      }
      const raw = categoryVector?.get(rowIdx);
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

  if (categoryRankRadiusMap && pointCategoryColumn) {
    const featureIds = scatterBinaryData.featureIds;
    const categoryVector = jsTable.getChild(pointCategoryColumn);
    const length = featureIds ? featureIds.length : jsTable.numRows;
    const radiusArr = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const rowIdx = featureIds ? featureIds[i] : i;
      const row = jsTable.get(rowIdx) as DeckDataRow | null;
      if (row && isDisabledPointCategoryRow(row)) {
        radiusArr[i] = 0;
        continue;
      }
      if (pointMissingColumn) {
        if (row && isMissingThematicValue(row[pointMissingColumn])) {
          radiusArr[i] = showMissingPoints ? missingPointRadius : 0;
          continue;
        }
      }
      const raw = categoryVector?.get(rowIdx);
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
      const row = jsTable.get(rowIdx) as DeckDataRow | null;
      shapeArr[i] =
        row && isMissingThematicValue(row[pointMissingColumn])
          ? missingShapeOrdinal
          : shapeOrdinal;
    }
    scatterBinaryData.attributes.getShape = { value: shapeArr, size: 1 };
  }

  if (useProportionalSymbols) {
    sortScatterBinaryDataByRadius(scatterBinaryData);
  }

  const useMultiShapeLayer =
    pointShape !== ShapeType.CIRCLE ||
    missingPointShape !== ShapeType.CIRCLE ||
    useCategoryShape ||
    symbolPatternType !== null ||
    usesPointCategories ||
    (pointStrokeDashed && showPointStroke);
  const baseLayerProps = {
    id:
      symbolPatternType !== null
        ? `${layerId}-pattern-${symbolPatternType}`
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
    radiusScale: 1,
    radiusUnits: 'pixels' as const,
    lineWidthUnits: 'pixels' as const,
    lineWidthScale: showPointStroke ? pointStrokeWidth / 3 : 0,
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
        symbolPatternType,
        pointMissingColumn,
        showMissingPoints
      ]
    }
  };

  if (useMultiShapeLayer) {
    return [
      new MultiShapeLayer({
        ...baseLayerProps,
        dashed: showPointStroke && pointStrokeDashed,
        dashLength: pointStrokeDashSpec.shader.dash,
        gapLength: pointStrokeDashSpec.shader.gap,
        dotLength: pointStrokeDashSpec.shader.dot,
        dotGap: pointStrokeDashSpec.shader.dotGap,
        barWidth: pointBarWidth,
        patternEnabled: symbolPatternType !== null,
        patternType: symbolPatternType ?? SYMBOL_PATTERN_TYPE.DOTS
      })
    ];
  }

  return [new ScatterplotLayer(baseLayerProps)];
}

export function createLineLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
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
    lineThicknessClassification.breaks.length >= 2;
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
  const getOrderIndex = (primitive: PrimitiveFilter): number => {
    const index = primitiveOrder.indexOf(primitive);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

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

    const pointLayers = createRepresentativePointSymbolLayers(jsTable, ctx);

    return [
      ...(!viz || primitiveFilters.includes(PrimitiveFilterType.LINE)
        ? [
            {
              primitive: PrimitiveFilterType.LINE as PrimitiveFilter,
              layer: lineLayer
            }
          ]
        : []),
      ...pointLayers.map((layer) => ({
        primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
        layer
      }))
    ]
      .sort(
        (left, right) =>
          getOrderIndex(right.primitive) - getOrderIndex(left.primitive)
      )
      .map((entry) => entry.layer);
  }

  let lineGeojsonData;
  try {
    const rawGeoJSON = getCachedGeoJSON(jsTable, geoColumn);
    lineGeojsonData =
      rawGeoJSON && ctx.customProjection
        ? projectGeoJSON(rawGeoJSON, ctx.customProjection)
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

  const pointLayers = createRepresentativePointSymbolLayers(jsTable, ctx);

  return [
    ...(primitiveFilters.includes(PrimitiveFilterType.LINE)
      ? [
          {
            primitive: PrimitiveFilterType.LINE as PrimitiveFilter,
            layer: lineLayer
          }
        ]
      : []),
    ...pointLayers.map((layer) => ({
      primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
      layer
    }))
  ]
    .sort(
      (left, right) =>
        getOrderIndex(right.primitive) - getOrderIndex(left.primitive)
    )
    .map((entry) => entry.layer);
}

export function createPolygonLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    viz,
    fillColor,
    strokeColor,
    fillOpacity: rawPolyFillOpacity,
    strokeWidth,
    strokeOpacity: rawPolyStrokeOpacity,
    highlightedRowIds: polyHighlightedRowIds,
    modelMatrix,
    beforeId,
    categoryColorMap
  } = ctx;
  const polygonCategoryColorMap =
    ctx.polygonCategoryColorMap ?? categoryColorMap;
  const hasPolyHighlights =
    polyHighlightedRowIds && polyHighlightedRowIds.size > 0;
  const hlVersion = ctx.highlightVersion ?? 0;
  const {
    geoColumn,
    encoding: arrowExtension,
    isNativeGeoArrow,
    isWkbEncoded,
    isGeoJsonEncoded
  } = geometryInfo;
  const polygonConfig = viz ? getPolygonPrimitive(viz) : undefined;
  const polygonEnabled = polygonConfig?.enabled ?? true;
  const polygonFillMode = polygonConfig?.fillMode ?? FillMode.UNIQUE;
  const polygonStrokeMode = polygonConfig?.strokeMode ?? StrokeMode.UNIQUE;
  const polygonValueColumn = polygonConfig?.valueColumn;
  const polygonCategoryColumn = polygonConfig?.categoryColumn;
  const polygonStrokeValueColumn =
    polygonConfig?.strokeValueColumn ?? polygonValueColumn;
  const polygonStrokeCategoryColumn =
    polygonConfig?.strokeCategoryColumn ?? polygonCategoryColumn;
  const polygonClassification = viz
    ? (getPrimitiveClassification(viz, PrimitiveFilterType.POLYGON) ??
      viz.classification)
    : undefined;
  const polygonFillColor = resolveStyleColor(
    polygonConfig?.fillColor,
    fillColor
  );
  const polygonStrokeColor = Array.isArray(polygonConfig?.strokeColor)
    ? hexToRgb(polygonConfig.strokeColor[0] ?? '#000000')
    : typeof polygonConfig?.strokeColor === 'string'
      ? hexToRgb(polygonConfig.strokeColor)
      : strokeColor;
  const polygonFillOpacity = normalizeOpacity(
    polygonConfig?.fillOpacity,
    rawPolyFillOpacity
  );
  const polygonStrokeWidth = polygonConfig?.strokeWidth ?? strokeWidth;
  const polygonStrokeOpacity = normalizeOpacity(
    polygonConfig?.strokeOpacity,
    rawPolyStrokeOpacity
  );

  const useChoropleth =
    viz && shouldApplyChoropleth(viz, PrimitiveFilterType.POLYGON);
  const useCategoricalColor =
    viz && shouldApplyCategorical(viz, PrimitiveFilterType.POLYGON);
  const strokeDashed = polygonConfig?.strokeDashed ?? false;
  const strokeDashArray = strokeDashed
    ? resolveThematicStrokeDashArray(polygonConfig?.strokeDashedPattern)
    : ([0, 0] as [number, number]);
  const strokeCapRounded =
    strokeDashed &&
    resolveThematicStrokeCapRounded(polygonConfig?.strokeDashedPattern);
  const layerId = createThematicLayerId(DeckLayerId.POLYGON_LAYER, ctx);
  const projectedGeoJsonLayerId = `${layerId}-projected-geojson`;
  const patternProps = buildPatternProps(ctx);
  const { color: polygonMissingColor, show: showMissingPolygons } =
    resolveMissingDataRenderProps(
      polygonConfig,
      hexToRgb(DEFAULT_COLORS.missingData)
    );
  const missingDataPatternProps = buildMissingDataPatternProps(
    polygonConfig,
    showMissingPolygons
  );
  const densityRequested =
    polygonFillMode === FillMode.DENSITY && Boolean(viz?.density);
  const densityTable = ctx.densityTable;
  const densityGeometryInfo = ctx.densityGeometryInfo;
  const DEFAULT_PRIMITIVE_ORDER: PrimitiveFilter[] = [
    PrimitiveFilterType.POINT,
    PrimitiveFilterType.LINE,
    PrimitiveFilterType.POLYGON
  ];
  const primitiveFilters = getEnabledPrimitiveFilters(ctx.viz);
  const primitiveOrder = ctx.primitiveOrder ?? DEFAULT_PRIMITIVE_ORDER;
  const polygonPrimitiveAllowed =
    !ctx.viz || primitiveFilters.includes(PrimitiveFilterType.POLYGON);
  const getOrderIndex = (primitive: PrimitiveFilter): number => {
    const index = primitiveOrder.indexOf(primitive);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  if (densityRequested) {
    const densityLayers =
      densityTable && densityGeometryInfo
        ? createPointLayers(densityTable, densityGeometryInfo, ctx)
        : [];
    const pointLayers = createRepresentativePointSymbolLayers(jsTable, ctx);
    const orderedLayers = [
      ...(polygonPrimitiveAllowed
        ? densityLayers.map((layer) => ({
            primitive: PrimitiveFilterType.POLYGON as PrimitiveFilter,
            layer
          }))
        : []),
      ...pointLayers.map((layer) => ({
        primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
        layer
      }))
    ].sort(
      (left, right) =>
        getOrderIndex(right.primitive) - getOrderIndex(left.primitive)
    );
    const layers = orderedLayers.map((entry) => entry.layer);
    const selectionOverlay = createHighlightedPolygonOverlay(
      layerId,
      jsTable,
      geoColumn,
      polyHighlightedRowIds,
      hlVersion,
      ctx
    );
    if (selectionOverlay) {
      layers.push(selectionOverlay);
    }
    return layers;
  }

  if (!isNativeGeoArrow && !isGeoJsonEncoded && !isWkbEncoded) {
    return [];
  }

  const isNativeGeoArrowPolygon =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_POLYGON ||
      arrowExtension === ArrowExtension.GEOARROW_MULTIPOLYGON);
  const preferProjectedGeoJsonFallback =
    Boolean(ctx.customProjection) && (isWkbEncoded || isGeoJsonEncoded);

  if (
    !preferProjectedGeoJsonFallback &&
    (isNativeGeoArrowPolygon || isNativeGeoArrow)
  ) {
    try {
      const polyData = resolvePolygonParser(ctx.customProjection)(jsTable);
      const outlineData = resolvePathParser(ctx.customProjection)(jsTable);
      const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
        ctx.splitDatasetTable ?? jsTable,
        viz,
        polygonCategoryColorMap,
        polygonCategoryColumn,
        PrimitiveFilterType.POLYGON
      );

      const choroplethAccessor =
        useChoropleth && viz
          ? createChoroplethColorAccessor(
              polygonValueColumn!,
              polygonClassification!.breaks!,
              polygonClassification!.colors!,
              polygonMissingColor,
              showMissingPolygons
            )
          : null;

      const categoricalAccessor =
        useCategoricalColor && viz
          ? createCategoricalColorAccessor(
              polygonCategoryColumn!,
              effectiveCategoryColorMap,
              polygonMissingColor,
              showMissingPolygons,
              polygonClassification?.disabledLabels ?? []
            )
          : null;
      const splitUniqueFillAccessor =
        polygonFillMode === FillMode.UNIQUE
          ? createSplitUniqueBinaryColorAccessor(
              ctx,
              jsTable,
              jsTable,
              polygonFillColor
            )
          : null;

      const baseFillAccessor = choroplethAccessor ?? categoricalAccessor;

      const fillColorFn =
        hasPolyHighlights && polyHighlightedRowIds
          ? baseFillAccessor
            ? withRowHighlightAccessor(
                baseFillAccessor,
                polygonFillOpacity,
                HIGHLIGHT_DIMMING_FACTOR,
                polyHighlightedRowIds
              )
            : withRowHighlight(
                polygonFillColor,
                polygonFillOpacity,
                HIGHLIGHT_DIMMING_FACTOR,
                polyHighlightedRowIds
              )
          : baseFillAccessor;

      const fillColorBinaryAttr = splitUniqueFillAccessor
        ? createPolygonFillColorAttribute(polyData, splitUniqueFillAccessor)
        : fillColorFn
          ? createPolygonFillColorAttribute(
              polyData,
              ctxRowAccessor(ctx, jsTable, fillColorFn)
            )
          : null;

      const polygonStrokeClassification = polygonConfig?.strokeClassification;
      const strokeColorsArray =
        polygonStrokeClassification?.colors &&
        polygonStrokeClassification.colors.length > 0
          ? polygonStrokeClassification.colors
          : Array.isArray(polygonConfig?.strokeColor)
            ? polygonConfig.strokeColor
            : undefined;
      const strokeChoroplethAccessor =
        polygonStrokeMode === StrokeMode.CLASSES &&
        strokeColorsArray &&
        polygonStrokeValueColumn &&
        (polygonStrokeClassification?.breaks ??
          polygonClassification?.breaks) &&
        strokeColorsArray.length > 0
          ? createChoroplethColorAccessor(
              polygonStrokeValueColumn,
              polygonStrokeClassification?.breaks ??
                polygonClassification!.breaks!,
              strokeColorsArray,
              polygonMissingColor,
              showMissingPolygons
            )
          : null;
      const strokeCategoricalAccessor =
        polygonStrokeMode === StrokeMode.CATEGORIES &&
        strokeColorsArray &&
        polygonStrokeCategoryColumn &&
        strokeColorsArray.length > 0
          ? (() => {
              const labels =
                polygonStrokeClassification?.labels ??
                polygonClassification?.labels ??
                [];
              if (labels.length === 0) return null;
              const map = new Map<string, RGBColor>();
              labels.forEach((label, i) => {
                const hex =
                  strokeColorsArray[i] ??
                  strokeColorsArray[strokeColorsArray.length - 1];
                map.set(String(label), hexToRgb(hex));
              });
              return createCategoricalColorAccessor(
                polygonStrokeCategoryColumn,
                map,
                polygonMissingColor,
                showMissingPolygons,
                polygonStrokeClassification?.disabledLabels ?? []
              );
            })()
          : null;
      const splitUniqueStrokeAccessor =
        polygonStrokeMode === StrokeMode.UNIQUE
          ? createSplitUniqueBinaryColorAccessor(
              ctx,
              jsTable,
              jsTable,
              polygonStrokeColor
            )
          : null;
      const baseStrokeAccessor =
        strokeChoroplethAccessor ?? strokeCategoricalAccessor;

      const strokeColorFn =
        hasPolyHighlights && polyHighlightedRowIds
          ? baseStrokeAccessor
            ? withRowHighlightAccessor(
                baseStrokeAccessor,
                polygonStrokeOpacity,
                HIGHLIGHT_DIMMING_FACTOR,
                polyHighlightedRowIds
              )
            : withRowHighlight(
                polygonStrokeColor,
                polygonStrokeOpacity,
                HIGHLIGHT_DIMMING_FACTOR,
                polyHighlightedRowIds
              )
          : baseStrokeAccessor;

      const strokeColorBinaryAttr = splitUniqueStrokeAccessor
        ? pathColorAttr(outlineData, splitUniqueStrokeAccessor)
        : strokeColorFn
          ? pathColorAttr(
              outlineData,
              ctxRowAccessor(ctx, jsTable, strokeColorFn)
            )
          : null;

      const layers: Layer<DeckDataRow>[] = [];

      const solidProps = createCompatibleSolidPolygonLayerProps(polyData);
      const solidBinaryData = solidProps.data as {
        attributes: Record<string, unknown>;
        khartisSourceTable?: ArrowTable;
        featureIds?: Uint32Array;
      };
      attachBinaryPickingMetadata(solidBinaryData, jsTable, polyData, ctx);
      if (fillColorBinaryAttr) {
        solidBinaryData.attributes.getFillColor = fillColorBinaryAttr;
      }

      const fillLayer = new SolidPolygonLayer({
        id: layerId,
        ...(solidProps as unknown as Record<string, unknown>),
        ...(!fillColorBinaryAttr && {
          getFillColor: [
            polygonFillColor[0],
            polygonFillColor[1],
            polygonFillColor[2],
            255
          ] as [number, number, number, number]
        }),
        opacity: hasPolyHighlights ? 1 : polygonFillOpacity,
        pickable: true,
        ...resolveHoverHighlightProps(),
        parameters: {
          depthCompare: 'always' as const,
          stencilCompare: 'always' as const
        },
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillColor: [
            useChoropleth,
            useCategoricalColor,
            polygonValueColumn,
            polygonCategoryColumn,
            polygonClassification?.breaks,
            polygonClassification?.colors,
            polygonCategoryColorMap,
            polygonClassification?.labels,
            polygonConfig?.missingData?.color ?? DEFAULT_COLORS.missingData,
            showMissingPolygons,
            polygonFillColor,
            hlVersion
          ]
        }
      });

      const strokePathProps = createPathLayerProps(outlineData);
      const strokeBinaryData = strokePathProps.data as {
        attributes: Record<string, unknown>;
      };
      if (strokeColorBinaryAttr) {
        strokeBinaryData.attributes.getColor = strokeColorBinaryAttr;
      }

      let strokeLayer: Layer<DeckDataRow>;
      if (strokeDashed) {
        strokeLayer = new PathLayer({
          id: `${layerId}-stroke-dashed`,
          ...(strokePathProps as unknown as Record<string, unknown>),
          ...(!strokeColorBinaryAttr && {
            getColor: withOpacity(polygonStrokeColor, polygonStrokeOpacity)
          }),
          extensions: [DASH_EXTENSION],
          getDashArray: strokeDashArray,
          dashJustified: true,
          capRounded: strokeCapRounded,
          widthUnits: 'pixels',
          getWidth: polygonStrokeWidth / 4,
          widthMinPixels: 0.5,
          pickable: false,
          ...(modelMatrix && { modelMatrix }),
          ...(beforeId && { beforeId }),
          updateTriggers: {
            getColor: [polygonStrokeColor, polygonStrokeOpacity, hlVersion],
            getDashArray: [strokeDashed, polygonConfig?.strokeDashedPattern],
            getWidth: [polygonStrokeWidth]
          }
        });
      } else {
        strokeLayer = new PathLayer({
          id: `${layerId}-stroke-solid`,
          ...(strokePathProps as unknown as Record<string, unknown>),
          ...(!strokeColorBinaryAttr && {
            getColor: withOpacity(polygonStrokeColor, polygonStrokeOpacity)
          }),
          widthUnits: 'pixels',
          getWidth: polygonStrokeWidth / 4,
          widthMinPixels: 0.5,
          pickable: false,
          ...(modelMatrix && { modelMatrix }),
          ...(beforeId && { beforeId }),
          updateTriggers: {
            getColor: [polygonStrokeColor, polygonStrokeOpacity, hlVersion],
            getWidth: [polygonStrokeWidth]
          }
        });
      }

      let patternLayer: Layer<DeckDataRow> | null = null;
      if (patternProps) {
        let patternGeojson: FeatureCollection | null = null;
        try {
          const rawPatternGeojson = getCachedGeoJSON(jsTable, geoColumn);
          patternGeojson =
            rawPatternGeojson && ctx.customProjection
              ? projectGeoJSON(rawPatternGeojson, ctx.customProjection)
              : rawPatternGeojson;
          patternGeojson = patternGeojson
            ? filterSplitMatchedPolygonFeatures(patternGeojson, ctx, jsTable)
            : null;
        } catch {
          patternGeojson = null;
        }

        if (patternGeojson && patternGeojson.features.length > 0) {
          patternLayer = createPolygonPatternOverlayLayer(
            layerId,
            polygonClassification?.patternId,
            patternGeojson,
            patternProps,
            ctx
          );
        }
      }
      let missingDataPatternLayer: Layer<DeckDataRow> | null = null;
      if (missingDataPatternProps) {
        let missingPatternGeojson: FeatureCollection | null = null;
        try {
          const rawPatternGeojson = getCachedGeoJSON(jsTable, geoColumn);
          const projectedPatternGeojson =
            rawPatternGeojson && ctx.customProjection
              ? projectGeoJSON(rawPatternGeojson, ctx.customProjection)
              : rawPatternGeojson;
          missingPatternGeojson = projectedPatternGeojson
            ? filterMissingPolygonPatternFeatures(
                projectedPatternGeojson,
                ctx,
                jsTable,
                polygonFillMode,
                polygonValueColumn,
                polygonCategoryColumn,
                effectiveCategoryColorMap
              )
            : null;
        } catch {
          missingPatternGeojson = null;
        }

        if (
          missingPatternGeojson &&
          missingPatternGeojson.features.length > 0
        ) {
          missingDataPatternLayer = createPolygonPatternOverlayLayer(
            layerId,
            resolveMissingDataPatternId(polygonConfig),
            missingPatternGeojson,
            missingDataPatternProps,
            ctx,
            'missing-data-pattern'
          );
        }
      }

      const pointLayers = createRepresentativePointSymbolLayers(jsTable, ctx);
      const showFill =
        polygonPrimitiveAllowed &&
        polygonFillMode !== FillMode.NONE &&
        polygonFillOpacity > 0;
      const showStroke =
        polygonPrimitiveAllowed &&
        polygonStrokeMode !== StrokeMode.NONE &&
        polygonStrokeOpacity > 0 &&
        polygonStrokeWidth > 0;
      const orderedLayers = [
        ...(showFill
          ? [{ primitive: PrimitiveFilterType.POLYGON, layer: fillLayer }]
          : []),
        ...(showFill && patternLayer
          ? [{ primitive: PrimitiveFilterType.POLYGON, layer: patternLayer }]
          : []),
        ...(showFill && missingDataPatternLayer
          ? [
              {
                primitive: PrimitiveFilterType.POLYGON,
                layer: missingDataPatternLayer
              }
            ]
          : []),
        ...(showStroke
          ? [{ primitive: PrimitiveFilterType.LINE, layer: strokeLayer }]
          : []),
        ...pointLayers.map((layer) => ({
          primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
          layer
        }))
      ].sort(
        (left, right) =>
          getOrderIndex(right.primitive) - getOrderIndex(left.primitive)
      );

      layers.push(...orderedLayers.map((entry) => entry.layer));

      const selectionOverlay = createHighlightedPolygonOverlay(
        layerId,
        jsTable,
        geoColumn,
        polyHighlightedRowIds,
        hlVersion,
        ctx
      );
      if (selectionOverlay) {
        layers.push(selectionOverlay);
      }

      return layers;
    } catch (error) {
      logger.error(
        'Failed to create polygon selection overlay layer',
        LogCategory.MAP,
        error
      );
    }
  }

  let geojsonData;
  try {
    const rawGeoJSON = getCachedGeoJSON(jsTable, geoColumn);

    geojsonData =
      rawGeoJSON && ctx.customProjection
        ? projectGeoJSON(rawGeoJSON, ctx.customProjection)
        : rawGeoJSON;
  } catch (error) {
    logger.error(
      'Failed to read GeoJSON for polygon layer',
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
    ctx.splitDatasetTable ?? jsTable,
    viz,
    polygonCategoryColorMap,
    polygonCategoryColumn,
    PrimitiveFilterType.POLYGON
  );

  const splitGeoJsonFillColor =
    useChoropleth && viz
      ? createSplitGeoJsonFeatureAccessor(
          ctx,
          jsTable,
          createChoroplethColorAccessor(
            polygonValueColumn!,
            polygonClassification!.breaks!,
            polygonClassification!.colors!,
            polygonMissingColor,
            showMissingPolygons
          )
        )
      : useCategoricalColor && viz
        ? createSplitGeoJsonFeatureAccessor(
            ctx,
            jsTable,
            createCategoricalColorAccessor(
              polygonCategoryColumn!,
              effectiveCategoryColorMap,
              polygonMissingColor,
              showMissingPolygons,
              polygonClassification?.disabledLabels ?? []
            )
          )
        : polygonFillMode === FillMode.UNIQUE
          ? createSplitUniqueGeoJsonColorAccessor(
              ctx,
              jsTable,
              polygonFillColor
            )
          : null;

  const baseGeoJsonFillColor =
    splitGeoJsonFillColor ??
    (useChoropleth && viz
      ? createGeoJsonChoroplethColorAccessor(
          polygonValueColumn!,
          polygonClassification!.breaks!,
          polygonClassification!.colors!,
          polygonFillColor,
          polygonMissingColor,
          showMissingPolygons
        )
      : useCategoricalColor && viz
        ? createGeoJsonCategoricalColorAccessor(
            polygonCategoryColumn!,
            effectiveCategoryColorMap,
            polygonFillColor,
            polygonMissingColor,
            showMissingPolygons,
            polygonClassification?.disabledLabels ?? []
          )
        : null);

  const geoJsonFillColor =
    hasPolyHighlights && polyHighlightedRowIds
      ? baseGeoJsonFillColor
        ? withGeoJsonRowHighlightAccessor(
            baseGeoJsonFillColor,
            polygonFillOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            polyHighlightedRowIds
          )
        : withGeoJsonRowHighlight(
            polygonFillColor,
            polygonFillOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            polyHighlightedRowIds
          )
      : (baseGeoJsonFillColor ??
        ([
          polygonFillColor[0],
          polygonFillColor[1],
          polygonFillColor[2],
          255
        ] as [number, number, number, number]));
  const polygonStrokeColors = polygonConfig?.strokeClassification?.colors;
  const polygonStrokeBreaks =
    polygonConfig?.strokeClassification?.breaks ??
    polygonClassification?.breaks;
  const polygonStrokeGeoJsonColorMap = buildCategoryColorMapFromLabels(
    polygonConfig?.strokeClassification?.labels ??
      polygonClassification?.labels,
    polygonConfig?.strokeClassification?.colors
  );
  const splitGeoJsonStrokeColor =
    polygonStrokeMode === StrokeMode.CLASSES &&
    polygonStrokeValueColumn &&
    polygonStrokeBreaks &&
    polygonStrokeColors?.length
      ? createSplitGeoJsonFeatureAccessor(
          ctx,
          jsTable,
          createChoroplethColorAccessor(
            polygonStrokeValueColumn,
            polygonStrokeBreaks,
            polygonStrokeColors,
            polygonMissingColor,
            showMissingPolygons
          )
        )
      : polygonStrokeMode === StrokeMode.CATEGORIES &&
          polygonStrokeCategoryColumn &&
          polygonStrokeColors?.length
        ? createSplitGeoJsonFeatureAccessor(
            ctx,
            jsTable,
            createCategoricalColorAccessor(
              polygonStrokeCategoryColumn,
              polygonStrokeGeoJsonColorMap,
              polygonMissingColor,
              showMissingPolygons,
              polygonConfig?.strokeClassification?.disabledLabels ?? []
            )
          )
        : polygonStrokeMode === StrokeMode.UNIQUE
          ? createSplitUniqueGeoJsonColorAccessor(
              ctx,
              jsTable,
              polygonStrokeColor
            )
          : null;

  const baseGeoJsonStrokeColor = splitGeoJsonStrokeColor
    ? (feature: { properties?: Record<string, unknown> }) =>
        withOpacityPreservingAlpha(
          splitGeoJsonStrokeColor(feature),
          polygonStrokeOpacity
        ) as [number, number, number, number]
    : polygonStrokeMode === StrokeMode.CLASSES &&
        polygonStrokeValueColumn &&
        polygonStrokeBreaks &&
        polygonStrokeColors?.length
      ? (feature: { properties?: Record<string, unknown> }) =>
          withOpacityPreservingAlpha(
            createGeoJsonChoroplethColorAccessor(
              polygonStrokeValueColumn,
              polygonStrokeBreaks,
              polygonStrokeColors,
              polygonStrokeColor,
              polygonMissingColor,
              showMissingPolygons
            )(feature),
            polygonStrokeOpacity
          ) as [number, number, number, number]
      : polygonStrokeMode === StrokeMode.CATEGORIES &&
          polygonStrokeCategoryColumn &&
          polygonStrokeColors?.length
        ? (feature: { properties?: Record<string, unknown> }) =>
            withOpacityPreservingAlpha(
              createGeoJsonCategoricalColorAccessor(
                polygonStrokeCategoryColumn,
                polygonStrokeGeoJsonColorMap,
                polygonStrokeColor,
                polygonMissingColor,
                showMissingPolygons,
                polygonConfig?.strokeClassification?.disabledLabels ?? []
              )(feature),
              polygonStrokeOpacity
            ) as [number, number, number, number]
        : null;

  const showGeoJsonFill =
    polygonEnabled &&
    polygonFillMode !== FillMode.NONE &&
    polygonFillOpacity > 0;
  const showGeoJsonStroke =
    polygonEnabled &&
    polygonStrokeMode !== StrokeMode.NONE &&
    polygonStrokeOpacity > 0 &&
    polygonStrokeWidth > 0;
  const geoJsonStrokeColor = showGeoJsonStroke
    ? hasPolyHighlights && polyHighlightedRowIds
      ? baseGeoJsonStrokeColor
        ? withGeoJsonRowHighlightAccessor(
            baseGeoJsonStrokeColor,
            polygonStrokeOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            polyHighlightedRowIds
          )
        : withGeoJsonRowHighlight(
            polygonStrokeColor,
            polygonStrokeOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            polyHighlightedRowIds
          )
      : (baseGeoJsonStrokeColor ??
        withOpacity(polygonStrokeColor, polygonStrokeOpacity))
    : ([0, 0, 0, 0] as [number, number, number, number]);

  const patternGeojsonData =
    patternProps && showGeoJsonFill && geojsonData.features.length > 0
      ? filterSplitMatchedPolygonFeatures(geojsonData, ctx, jsTable)
      : null;
  const patternLayer =
    patternProps &&
    showGeoJsonFill &&
    patternGeojsonData &&
    patternGeojsonData.features.length > 0
      ? createPolygonPatternOverlayLayer(
          layerId,
          polygonClassification?.patternId,
          patternGeojsonData,
          patternProps,
          ctx
        )
      : null;
  const missingDataPatternGeojson =
    missingDataPatternProps &&
    showGeoJsonFill &&
    geojsonData.features.length > 0
      ? filterMissingPolygonPatternFeatures(
          geojsonData,
          ctx,
          jsTable,
          polygonFillMode,
          polygonValueColumn,
          polygonCategoryColumn,
          effectiveCategoryColorMap
        )
      : null;
  const missingDataPatternLayer =
    missingDataPatternProps &&
    missingDataPatternGeojson &&
    missingDataPatternGeojson.features.length > 0
      ? createPolygonPatternOverlayLayer(
          layerId,
          resolveMissingDataPatternId(polygonConfig),
          missingDataPatternGeojson,
          missingDataPatternProps,
          ctx,
          'missing-data-pattern'
        )
      : null;

  const shouldSplitGeoJsonLayers = Boolean(
    (patternLayer || missingDataPatternLayer) && showGeoJsonStroke
  );

  let geoJsonLayers: Layer<DeckDataRow>[] = [];
  if (shouldSplitGeoJsonLayers) {
    geoJsonLayers = [
      new GeoJsonLayer({
        id: projectedGeoJsonLayerId,
        data: geojsonData,
        getFillColor: geoJsonFillColor,
        filled: showGeoJsonFill,
        stroked: false,
        opacity: hasPolyHighlights ? 1 : polygonFillOpacity,
        pickable: true,
        ...resolveHoverHighlightProps(),
        parameters: {
          depthCompare: 'always' as const,
          stencilCompare: 'always' as const
        },
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillColor: [
            useChoropleth,
            useCategoricalColor,
            polygonValueColumn,
            polygonCategoryColumn,
            polygonClassification?.breaks,
            polygonClassification?.colors,
            polygonCategoryColorMap,
            polygonClassification?.labels,
            polygonConfig?.missingData?.color ?? DEFAULT_COLORS.missingData,
            showMissingPolygons,
            polygonFillColor,
            hlVersion
          ]
        },
        dataComparator: (newData, oldData) => newData === oldData
      }),
      ...(patternLayer ? [patternLayer] : []),
      ...(missingDataPatternLayer ? [missingDataPatternLayer] : []),
      ...(showGeoJsonStroke
        ? [
            new GeoJsonLayer({
              id: `${layerId}-stroke`,
              data: geojsonData,
              getLineColor: geoJsonStrokeColor,
              filled: false,
              stroked: true,
              extensions: strokeDashed ? [DASH_EXTENSION] : [],
              getDashArray: strokeDashArray,
              dashJustified: true,
              capRounded: strokeCapRounded,
              lineWidthUnits: 'pixels',
              lineWidthScale: polygonStrokeWidth / 4,
              lineWidthMinPixels: 0.5,
              pickable: false,
              parameters: {
                depthCompare: 'always' as const,
                stencilCompare: 'always' as const
              },
              ...(modelMatrix && { modelMatrix }),
              ...(beforeId && { beforeId }),
              updateTriggers: {
                getLineColor: [
                  polygonStrokeColor,
                  polygonStrokeOpacity,
                  polygonStrokeValueColumn,
                  polygonStrokeCategoryColumn,
                  polygonConfig?.strokeMode,
                  polygonConfig?.strokeClassification?.colors,
                  polygonConfig?.strokeClassification?.breaks,
                  polygonConfig?.strokeClassification?.labels,
                  polygonConfig?.strokeClassification?.disabledLabels,
                  showGeoJsonStroke,
                  hlVersion
                ],
                getDashArray: [strokeDashed, polygonConfig?.strokeDashedPattern]
              },
              dataComparator: (newData, oldData) => newData === oldData
            })
          ]
        : [])
    ];
  } else if (showGeoJsonFill || showGeoJsonStroke) {
    geoJsonLayers = [
      new GeoJsonLayer({
        id: projectedGeoJsonLayerId,
        data: geojsonData,
        getFillColor: geoJsonFillColor,
        getLineColor: geoJsonStrokeColor,
        filled: showGeoJsonFill,
        stroked: showGeoJsonStroke,
        extensions: showGeoJsonStroke && strokeDashed ? [DASH_EXTENSION] : [],
        getDashArray: showGeoJsonStroke ? strokeDashArray : [0, 0],
        dashJustified: true,
        capRounded: showGeoJsonStroke && strokeCapRounded,
        opacity: hasPolyHighlights ? 1 : polygonFillOpacity,
        lineWidthUnits: 'pixels',
        lineWidthScale: showGeoJsonStroke ? polygonStrokeWidth / 4 : 0,
        lineWidthMinPixels: showGeoJsonStroke ? 0.5 : 0,
        pickable: true,
        ...resolveHoverHighlightProps(),
        parameters: {
          depthCompare: 'always' as const,
          stencilCompare: 'always' as const
        },
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillColor: [
            useChoropleth,
            useCategoricalColor,
            polygonValueColumn,
            polygonCategoryColumn,
            polygonClassification?.breaks,
            polygonClassification?.colors,
            polygonCategoryColorMap,
            polygonClassification?.labels,
            polygonConfig?.missingData?.color ?? DEFAULT_COLORS.missingData,
            showMissingPolygons,
            polygonFillColor,
            hlVersion
          ],
          getLineColor: [
            polygonStrokeColor,
            polygonStrokeOpacity,
            polygonStrokeValueColumn,
            polygonStrokeCategoryColumn,
            polygonConfig?.strokeMode,
            polygonConfig?.strokeClassification?.colors,
            polygonConfig?.strokeClassification?.breaks,
            polygonConfig?.strokeClassification?.labels,
            polygonConfig?.strokeClassification?.disabledLabels,
            showGeoJsonStroke,
            hlVersion
          ],
          getDashArray: [
            showGeoJsonStroke,
            strokeDashed,
            polygonConfig?.strokeDashedPattern
          ]
        },
        dataComparator: (newData, oldData) => newData === oldData
      }),
      ...(patternLayer ? [patternLayer] : []),
      ...(missingDataPatternLayer ? [missingDataPatternLayer] : [])
    ];
  }

  const pointLayers = createRepresentativePointSymbolLayers(jsTable, ctx);
  const orderedLayers = [
    ...geoJsonLayers.map((layer) => ({
      primitive: PrimitiveFilterType.POLYGON as PrimitiveFilter,
      layer
    })),
    ...pointLayers.map((layer) => ({
      primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
      layer
    }))
  ].sort(
    (left, right) =>
      getOrderIndex(right.primitive) - getOrderIndex(left.primitive)
  );
  const layers = orderedLayers.map((entry) => entry.layer);

  const selectionOverlay = createHighlightedPolygonOverlay(
    layerId,
    jsTable,
    geoColumn,
    polyHighlightedRowIds,
    hlVersion,
    ctx
  );
  if (selectionOverlay) {
    layers.push(selectionOverlay);
  }

  return layers;
}

export function createGeoJsonLayers(
  geojson: FeatureCollection,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    fillColor,
    strokeColor,
    fillOpacity,
    strokeWidth,
    strokeOpacity,
    highlightedRowIds,
    modelMatrix,
    beforeId
  } = ctx;

  const layerId = createThematicLayerId(DeckLayerId.GEOJSON_LAYER, ctx);
  const hasHighlights = highlightedRowIds && highlightedRowIds.size > 0;
  const hlVersion = ctx.highlightVersion ?? 0;

  const projectedData = ctx.customProjection
    ? projectGeoJSON(geojson, ctx.customProjection)
    : geojson;
  const data = ensureGeoJsonFeatureIds(projectedData);
  const baseFillColor: [number, number, number, number] = [
    fillColor[0],
    fillColor[1],
    fillColor[2],
    Math.round(fillOpacity * 255)
  ];
  const geoJsonFillColor =
    hasHighlights && highlightedRowIds
      ? withGeoJsonRowHighlight(
          baseFillColor,
          fillOpacity,
          HIGHLIGHT_DIMMING_FACTOR,
          highlightedRowIds
        )
      : baseFillColor;
  const geoJsonLineColor =
    hasHighlights && highlightedRowIds
      ? withGeoJsonRowHighlight(
          strokeColor,
          strokeOpacity,
          HIGHLIGHT_DIMMING_FACTOR,
          highlightedRowIds
        )
      : withOpacity(strokeColor, strokeOpacity);

  const layers: Layer<DeckDataRow>[] = [
    new GeoJsonLayer({
      id: layerId,
      data,
      filled: true,
      stroked: true,
      getFillColor: geoJsonFillColor,
      getLineColor: geoJsonLineColor,
      getLineWidth: strokeWidth,
      lineWidthMinPixels: Math.max(1, strokeWidth),
      pickable: true,
      ...resolveHoverHighlightProps(),
      parameters: {
        depthCompare: 'always' as const,
        stencilCompare: 'always' as const
      },
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getFillColor: [fillColor, fillOpacity, hlVersion],
        getLineColor: [strokeColor, strokeOpacity, hlVersion],
        getLineWidth: [strokeWidth]
      },
      dataComparator: (newData, oldData) => newData === oldData
    })
  ];

  const selectionOverlay = createHighlightedGeoJsonOverlay(
    layerId,
    data,
    highlightedRowIds,
    hlVersion,
    ctx
  );
  if (selectionOverlay) {
    layers.push(selectionOverlay);
  }

  return layers;
}

export function createDeckLayers(
  jsTable: ArrowTable,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  if (jsTable.numRows === 0) {
    return [];
  }

  const geometryInfo = ctx.geometryInfo ?? extractGeometryInfo(jsTable);

  if (!geometryInfo) {
    const hasUserDataset = Boolean(ctx.datasetId);
    if (hasUserDataset) {
      logger.error(
        'Missing geometry metadata for user dataset layer',
        LogCategory.MAP
      );
    }
    return [];
  }

  const resolvedGeometryType = geometryInfo.type;

  const primitiveMap: Record<string, PrimitiveFilter> = {
    [GeometryType.POINT]: PrimitiveFilterType.POINT,
    [GeometryType.MULTIPOINT]: PrimitiveFilterType.POINT,
    [GeometryType.LINESTRING]: PrimitiveFilterType.LINE,
    [GeometryType.MULTILINESTRING]: PrimitiveFilterType.LINE,
    [GeometryType.POLYGON]: PrimitiveFilterType.POLYGON,
    [GeometryType.MULTIPOLYGON]: PrimitiveFilterType.POLYGON
  };

  const primitive = primitiveMap[resolvedGeometryType];
  const isPolygonGeometry =
    resolvedGeometryType === GeometryType.POLYGON ||
    resolvedGeometryType === GeometryType.MULTIPOLYGON;
  const isLineGeometry =
    resolvedGeometryType === GeometryType.LINESTRING ||
    resolvedGeometryType === GeometryType.MULTILINESTRING;

  const isDensityMode =
    ctx.viz && getPolygonPrimitive(ctx.viz)?.fillMode === FillMode.DENSITY;
  const effectivePrimitive = isDensityMode
    ? PrimitiveFilterType.POLYGON
    : primitive;
  const isPrimitiveFilteredOut =
    !isPolygonGeometry &&
    !isLineGeometry &&
    effectivePrimitive &&
    ctx.viz?.primitiveFilters &&
    !ctx.viz.primitiveFilters.includes(effectivePrimitive);

  let thematicLayers: Layer<DeckDataRow>[] = [];
  switch (resolvedGeometryType) {
    case GeometryType.POINT:
    case GeometryType.MULTIPOINT:
      thematicLayers = createPointLayers(jsTable, geometryInfo, ctx);
      break;

    case GeometryType.LINESTRING:
    case GeometryType.MULTILINESTRING:
      thematicLayers = createLineLayers(jsTable, geometryInfo, ctx);
      break;

    case GeometryType.POLYGON:
    case GeometryType.MULTIPOLYGON:
      thematicLayers = createPolygonLayers(jsTable, geometryInfo, ctx);
      break;

    default:
  }

  if (isPrimitiveFilteredOut) {
    thematicLayers = thematicLayers.map(
      (layer) => layer.clone({ visible: false }) as Layer<DeckDataRow>
    );
  }

  const textLayers = createTextOverlayLayers(jsTable, geometryInfo, ctx);
  return orderLayersByPrimitive(thematicLayers, textLayers, ctx.primitiveOrder);
}

function classifyLayerPrimitive(layerId: string): PrimitiveFilter | null {
  if (layerId.startsWith(DeckLayerId.TEXT_LAYER)) {
    return PrimitiveFilterType.TEXT;
  }
  if (layerId.startsWith(DeckLayerId.POINT_LAYER)) {
    return PrimitiveFilterType.POINT;
  }
  if (layerId.startsWith(DeckLayerId.LINE_LAYER)) {
    return PrimitiveFilterType.LINE;
  }
  if (layerId.startsWith(DeckLayerId.POLYGON_LAYER)) {
    return PrimitiveFilterType.POLYGON;
  }
  return null;
}

function orderLayersByPrimitive(
  thematicLayers: Layer<DeckDataRow>[],
  textLayers: Layer<DeckDataRow>[],
  primitiveOrder: PrimitiveFilter[] | undefined
): Layer<DeckDataRow>[] {
  const order = primitiveOrder ?? [
    PrimitiveFilterType.POINT,
    PrimitiveFilterType.LINE,
    PrimitiveFilterType.POLYGON,
    PrimitiveFilterType.TEXT
  ];
  const tagged: Array<{
    primitive: PrimitiveFilter | null;
    index: number;
    layer: Layer<DeckDataRow>;
  }> = [
    ...thematicLayers.map((layer, index) => ({
      primitive: classifyLayerPrimitive(String(layer.id)),
      index,
      layer
    })),
    ...textLayers.map((layer, index) => ({
      primitive: PrimitiveFilterType.TEXT,
      index: thematicLayers.length + index,
      layer
    }))
  ];

  const getOrderRank = (primitive: PrimitiveFilter | null): number => {
    if (!primitive) return Number.MAX_SAFE_INTEGER;
    const idx = order.indexOf(primitive);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };

  return tagged
    .slice()
    .sort((a, b) => {
      const rankDiff = getOrderRank(b.primitive) - getOrderRank(a.primitive);
      if (rankDiff !== 0) return rankDiff;
      return a.index - b.index;
    })
    .map((entry) => entry.layer);
}
