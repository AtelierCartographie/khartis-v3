import type { Color, Layer } from '@deck.gl/core';
import {
  GeoJsonLayer,
  TextLayer,
  SolidPolygonLayer,
  PathLayer,
  ScatterplotLayer
} from '@deck.gl/layers';
import { DataFilterExtension, PathStyleExtension } from '@deck.gl/extensions';
import RotatableFillStyleExtension from './rotatable-fill-style-extension';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection, Geometry } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';
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
  ThematicLayer,
  YearFilterInfo
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
  PATTERN_TYPE_MAP
} from './pattern-texture';
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
  filterValueAttr,
  pointPositions,
  projectGeoJSON
} from '../utils/geoarrow-stream-bridge.utils';
import { resolveHoverHighlightProps } from '../utils/hover-highlight-props.utils';
import { resolveMissingDataPointShape as resolveMissingPointShape } from '../utils/legend.utils';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { createCompatibleSolidPolygonLayerProps } from '../utils/solid-polygon-layer-props.utils';
import {
  buildSplitDatasetRowMapping,
  createSplitAwareRowAccessor as ctxRowAccessor,
  createSplitGeoJsonFeatureAccessor,
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
const DEFAULT_DASH_ARRAY: [number, number] = [3, 2];

function resolveThematicStrokeDashArray(
  pattern: BasemapDottedPattern | undefined
): [number, number] {
  switch (pattern) {
    case BasemapDottedPattern.DOTS:
      return [2, 2];
    case BasemapDottedPattern.DASHES:
      return [6, 4];
    case BasemapDottedPattern.DASH_DOT:
      return [6, 4];
    case BasemapDottedPattern.LONG_DASH:
      return [12, 4];
    default:
      return DEFAULT_DASH_ARRAY;
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
const TEXT_BACKGROUND_PADDING: [number, number] = [6, 4];

export const TRANSPARENT_BACKGROUND_COLOR: Color = [0, 0, 0, 0];
const POINT_SYMBOL_ICON_VIEWBOX_SIZE = 64;
const DEFAULT_LABEL_COLOR = hexToRgb(DEFAULT_COLORS.text);

export const DEFAULT_TEXT_COLOR = hexToRgb(DEFAULT_COLORS.text);
const pointSymbolIconCache = new Map<string, string>();

function colorToCss(color: Color): string {
  const [r = 0, g = 0, b = 0, alpha = 255] = color;
  const normalizedAlpha = Math.max(0, Math.min(1, alpha / 255));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

export function resolveDeckTextFontWeight(
  weight: string | number,
  italic = false
): string | number {
  return italic ? `italic ${weight}` : weight;
}

export function resolveDeckTextFontFamily(fontFamily?: string): string {
  return resolveFontFamilyStack(fontFamily) || DEFAULT_TEXT_FONT;
}

function createPointSymbolSvg(
  shape: ShapeType,
  fillColor: Color,
  strokeColor: Color,
  strokeWidth: number,
  dashed = false
): string {
  const fill = colorToCss(fillColor);
  const stroke = colorToCss(strokeColor);
  const scaledStrokeWidth = Math.max(2, strokeWidth * 4);
  const strokeDashAttributes = dashed
    ? ` stroke-dasharray="${Math.max(2, scaledStrokeWidth * DEFAULT_DASH_ARRAY[0])} ${Math.max(2, scaledStrokeWidth * DEFAULT_DASH_ARRAY[1])}" stroke-linecap="round"`
    : '';

  const markup = ((): string => {
    switch (shape) {
      case ShapeType.SQUARE:
        return `<rect x="10" y="10" width="44" height="44" rx="4" ry="4" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}"${strokeDashAttributes} />`;
      case ShapeType.BAR:
        return `<rect x="26" y="4" width="12" height="56" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}" stroke-linejoin="round"${strokeDashAttributes} />`;
      case ShapeType.SPIKE:
        return `<path d="M32 4 L42 60 H22 Z" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}" stroke-linejoin="round"${strokeDashAttributes} />`;
      case ShapeType.CROSS:
        return `<path d="M22 8 H42 V22 H56 V42 H42 V56 H22 V42 H8 V22 H22 Z" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}" stroke-linejoin="round"${strokeDashAttributes} />`;
      case ShapeType.DIAMOND:
        return `<path d="M32 6 L58 32 L32 58 L6 32 Z" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}" stroke-linejoin="round"${strokeDashAttributes} />`;
      case ShapeType.TRIANGLE:
        return `<path d="M32 8 L56 56 H8 Z" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}" stroke-linejoin="round"${strokeDashAttributes} />`;
      case ShapeType.STAR:
        return `<path d="M32 6 L39.4 24.6 L58.7 24.6 L43.1 36.1 L48.4 55.1 L32 44 L15.6 55.1 L20.9 36.1 L5.3 24.6 L24.6 24.6 Z" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}" stroke-linejoin="round"${strokeDashAttributes} />`;
      case ShapeType.RECTANGLE:
        return `<rect x="4" y="24" width="56" height="16" rx="2" ry="2" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}"${strokeDashAttributes} />`;
      case ShapeType.CIRCLE:
      default:
        return `<circle cx="32" cy="32" r="22" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}"${strokeDashAttributes} />`;
    }
  })();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${POINT_SYMBOL_ICON_VIEWBOX_SIZE}" height="${POINT_SYMBOL_ICON_VIEWBOX_SIZE}" viewBox="0 0 ${POINT_SYMBOL_ICON_VIEWBOX_SIZE} ${POINT_SYMBOL_ICON_VIEWBOX_SIZE}">${markup}</svg>`;
}

function createPointSymbolIcon(
  shape: ShapeType,
  fillColor: Color,
  strokeColor: Color,
  strokeWidth: number,
  dashed = false
): {
  url: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  id: string;
} {
  const key = JSON.stringify({
    shape,
    fillColor,
    strokeColor,
    strokeWidth,
    dashed
  });
  let url = pointSymbolIconCache.get(key);
  if (!url) {
    const svg = createPointSymbolSvg(
      shape,
      fillColor,
      strokeColor,
      strokeWidth,
      dashed
    );
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    pointSymbolIconCache.set(key, url);
  }

  return {
    url,
    width: POINT_SYMBOL_ICON_VIEWBOX_SIZE,
    height: POINT_SYMBOL_ICON_VIEWBOX_SIZE,
    anchorX: POINT_SYMBOL_ICON_VIEWBOX_SIZE / 2,
    anchorY: POINT_SYMBOL_ICON_VIEWBOX_SIZE / 2,
    id: key
  };
}

function resolveGeoJsonLayerColor(
  candidate:
    | RGBColor
    | Color
    | ((feature: { properties?: Record<string, unknown> }) => Color),
  feature: { properties?: Record<string, unknown> },
  fallbackOpacity: number
): Color {
  if (typeof candidate === 'function') {
    return candidate(feature);
  }

  return withOpacity(Array.from(candidate), fallbackOpacity);
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
  const pointStrokeDashArray = resolveThematicStrokeDashArray(
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
  const symbolPatternType =
    pointConfig.mode === SymbolMode.CATEGORIES
      ? resolveSymbolPatternType(pointClassification)
      : null;
  const pointFillClassification =
    getSymbolFillClassification(viz) ?? viz.classification;
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
    const yearFilterBinaryData = {
      length: scatterBinaryData.length ?? pointData.length,
      featureIds: scatterBinaryData.featureIds ?? pointData.featureIds
    };

    const yearFilterProps = ctx.yearFilter
      ? buildYearFilterProps(
          yearFilterBinaryData,
          scatterBinaryData,
          jsTable,
          ctx.yearFilter
        )
      : null;

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
      dashLength: pointStrokeDashArray[0],
      gapLength: pointStrokeDashArray[1],
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
      ...yearFilterProps,
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
          pointConfig.missingData?.show,
          pointConfig.missingData?.size,
          commonScale,
          positionMode
        ],
        getShape: [shapeOrdinal, missingShapeOrdinal, triggerColumn],
        ...(ctx.yearFilter && {
          getFilterValue: [ctx.yearFilter.column, ctx.yearFilter.value]
        })
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
  const pointStrokeDashArray = resolveThematicStrokeDashArray(
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
  const symbolPatternType =
    pointConfig.mode === SymbolMode.CATEGORIES
      ? resolveSymbolPatternType(pointClassification)
      : null;
  const pointFillClassification =
    getSymbolFillClassification(viz) ?? viz.classification;
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

  const yearFilterBinaryData = {
    length: scatterBinaryData.length ?? pointData.length,
    featureIds: scatterBinaryData.featureIds ?? pointData.featureIds
  };
  const yearFilterProps = ctx.yearFilter
    ? buildYearFilterProps(
        yearFilterBinaryData,
        scatterBinaryData,
        jsTable,
        ctx.yearFilter
      )
    : null;

  return [
    new MultiShapeLayer({
      id: `${pointLayerId}-centroids`,
      ...(scatterProps as unknown as Record<string, unknown>),
      stroked: showPointStroke,
      filled: !hideSymbolFill,
      dashed: showPointStroke && pointStrokeDashed,
      dashLength: pointStrokeDashArray[0],
      gapLength: pointStrokeDashArray[1],
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
      ...yearFilterProps,
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
        ],
        ...(ctx.yearFilter && {
          getFilterValue: [ctx.yearFilter.column, ctx.yearFilter.value]
        })
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
  ctx: Pick<
    LayerContext,
    'customProjection' | 'yearFilter' | 'modelMatrix' | 'beforeId'
  >
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
    const filteredGeoJson = filterGeoJsonByYear(
      projectedGeoJson,
      ctx.yearFilter
    );

    if (filteredGeoJson.features.length === 0) {
      return null;
    }

    return new GeoJsonLayer({
      id: `${layerId}-selection-overlay`,
      data: filteredGeoJson,
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
    logger.warn(
      'Failed to build highlighted polygon overlay',
      LogCategory.MAP,
      {
        geoColumn,
        error: error instanceof Error ? error.message : String(error)
      }
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

const DATA_FILTER_EXTENSION = new DataFilterExtension({ filterSize: 1 });

function buildYearFilterProps(
  binaryData: { readonly length: number; readonly featureIds: Uint32Array },
  dataObj: { attributes: Record<string, unknown> },
  table: ArrowTable,
  yearFilter: YearFilterInfo
): Record<string, unknown> {
  const filterAttr = filterValueAttr(binaryData, table, yearFilter.column);

  const nextData = {
    ...dataObj,
    attributes: {
      ...dataObj.attributes,
      getFilterValue: filterAttr
    }
  };
  return {
    data: nextData,
    extensions: [DATA_FILTER_EXTENSION],
    filterRange: [yearFilter.value, yearFilter.value] as [number, number]
  };
}

function filterGeoJsonByYear<T extends Geometry>(
  geojson: FeatureCollection<T>,
  yearFilter: YearFilterInfo | undefined
): FeatureCollection<T> {
  if (!yearFilter) {
    return geojson;
  }

  const expectedYear = parseYearTextValue(yearFilter.value);
  if (expectedYear === null) {
    return geojson;
  }

  return {
    ...geojson,
    features: geojson.features.filter((feature) => {
      const rawValue = feature.properties?.[yearFilter.column];
      return parseYearTextValue(rawValue) === expectedYear;
    })
  };
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

function buildPatternProps(ctx: LayerContext): {
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
} | null {
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

  const { atlas, mapping } = getPatternAtlasForPattern(
    patternId,
    patternParams
  );
  if (Object.keys(mapping).length === 0) {
    return null;
  }
  const patternScale = Math.max(1, patternParams?.scale ?? 8) * 25;
  const patternRotation =
    patternParams?.angle ?? PATTERN_TYPE_MAP[patternId]?.angle ?? 0;

  return {
    extensions: [getFillStyleExtension()],
    fillPatternAtlas: atlas,
    fillPatternMapping: mapping,
    fillPatternMask: true,
    getFillPattern: () => patternId,
    getFillPatternScale: patternScale,
    getFillPatternRotation: patternRotation
  };
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
  patternProps: NonNullable<ReturnType<typeof buildPatternProps>>,
  ctx: Pick<LayerContext, 'modelMatrix' | 'beforeId'>
): GeoJsonLayer {
  const { modelMatrix, beforeId } = ctx;

  return new GeoJsonLayer({
    id: `${layerId}-pattern-${polygonPatternId ?? 'none'}`,
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
  const minSize = Math.max(min, Math.round(clampedBaseSize * 0.75));
  const maxSize = Math.min(max, Math.round(clampedBaseSize * 1.75));

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

function parseYearTextValue(value: unknown): number | null {
  if (typeof value === 'bigint') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numericValue = Number.parseFloat(trimmed);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
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

export function filterTextLayerDataByYear(
  textData: TextLayerDatum[],
  table: ArrowTable,
  yearFilter: YearFilterInfo | undefined
): TextLayerDatum[] {
  if (!yearFilter) {
    return textData;
  }

  const yearVector = table.getChild(yearFilter.column);
  const expectedYear = parseYearTextValue(yearFilter.value);
  if (!yearVector || expectedYear === null) {
    return textData;
  }

  return textData.filter((datum) => {
    const currentYear = parseYearTextValue(yearVector.get(datum.rowIndex));
    return currentYear === expectedYear;
  });
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
    sizeMode === SizeMode.PROPORTIONAL ? textValueColumn : undefined;
  const variableTextSizeVector = variableTextSizeColumn
    ? textAttributeTable.getChild(variableTextSizeColumn)
    : null;
  const canApplyVariableTextSize =
    sizeMode === SizeMode.PROPORTIONAL &&
    !!variableTextSizeColumn &&
    !!variableTextSizeVector;
  const { maxSize: maxLabelSize } =
    resolveVariableTextSizeBounds(labelBaseSize);
  const { maxSize: maxTextSize } = resolveVariableTextSizeBounds(textBaseSize);
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

  const textBackgroundConfig = textConfig.background;
  const backgroundEnabled = textBackgroundConfig.fillMode !== FillMode.NONE;
  const backgroundDecorationEnabled =
    backgroundEnabled || textBackgroundConfig.strokeMode !== StrokeMode.NONE;
  const backgroundValueVector = textBackgroundConfig.valueColumn
    ? textAttributeTable.getChild(textBackgroundConfig.valueColumn)
    : null;
  const backgroundCategoryVector = textBackgroundConfig.categoryColumn
    ? textAttributeTable.getChild(textBackgroundConfig.categoryColumn)
    : null;
  const backgroundStrokeValueVector = textBackgroundConfig.strokeValueColumn
    ? textAttributeTable.getChild(textBackgroundConfig.strokeValueColumn)
    : backgroundValueVector;
  const backgroundStrokeCategoryVector =
    textBackgroundConfig.strokeCategoryColumn
      ? textAttributeTable.getChild(textBackgroundConfig.strokeCategoryColumn)
      : backgroundCategoryVector;
  const backgroundCategoryColorMap = buildCategoryColorMapFromLabels(
    textBackgroundConfig.classification?.labels,
    textBackgroundConfig.classification?.colors
  );
  const backgroundFillFallback = resolveStyleColor(
    textBackgroundConfig.fillColor,
    [255, 255, 255]
  );
  const backgroundStrokeFallback = resolveStyleColor(
    textBackgroundConfig.strokeColor,
    [0, 0, 0]
  );
  const backgroundBaseFillAccessor = backgroundEnabled
    ? textBackgroundConfig.fillMode === FillMode.CLASSES
      ? createChoroplethTextColorAccessor(
          backgroundValueVector,
          textBackgroundConfig.classification?.breaks,
          textBackgroundConfig.classification?.colors,
          backgroundFillFallback,
          textBackgroundConfig.fillOpacity
        )
      : textBackgroundConfig.fillMode === FillMode.CATEGORIES
        ? createCategoricalAccessorFromMap(
            backgroundCategoryVector,
            backgroundCategoryColorMap,
            backgroundFillFallback,
            textBackgroundConfig.fillOpacity,
            textBackgroundConfig.classification?.disabledLabels ?? []
          )
        : withOpacity(backgroundFillFallback, textBackgroundConfig.fillOpacity)
    : null;
  const backgroundStrokeActive =
    textBackgroundConfig.strokeMode !== StrokeMode.NONE &&
    textBackgroundConfig.strokeWidth > 0 &&
    textBackgroundConfig.strokeOpacity > 0;
  const backgroundBorderWidth = backgroundStrokeActive
    ? textBackgroundConfig.strokeWidth
    : 0;
  const backgroundStrokeCategoryColorMap = buildCategoryColorMapFromLabels(
    textBackgroundConfig.strokeClassification?.labels ??
      textBackgroundConfig.classification?.labels,
    textBackgroundConfig.strokeClassification?.colors
  );
  const backgroundBaseStrokeAccessor = backgroundStrokeActive
    ? textBackgroundConfig.strokeMode === StrokeMode.CLASSES
      ? createChoroplethTextColorAccessor(
          backgroundStrokeValueVector,
          textBackgroundConfig.strokeClassification?.breaks ??
            textBackgroundConfig.classification?.breaks,
          textBackgroundConfig.strokeClassification?.colors,
          backgroundStrokeFallback,
          textBackgroundConfig.strokeOpacity
        )
      : textBackgroundConfig.strokeMode === StrokeMode.CATEGORIES
        ? createCategoricalAccessorFromMap(
            backgroundStrokeCategoryVector,
            backgroundStrokeCategoryColorMap,
            backgroundStrokeFallback,
            textBackgroundConfig.strokeOpacity,
            textBackgroundConfig.strokeClassification?.disabledLabels ?? []
          )
        : null
    : null;
  const resolveBackgroundStrokeColor = (datum: TextLayerDatum): Color => {
    if (datum.isMissingData) {
      return TRANSPARENT_BACKGROUND_COLOR;
    }
    return typeof backgroundBaseStrokeAccessor === 'function'
      ? backgroundBaseStrokeAccessor(datum)
      : (backgroundBaseStrokeAccessor ?? TRANSPARENT_BACKGROUND_COLOR);
  };
  const backgroundBorderColor = backgroundStrokeActive
    ? backgroundBaseStrokeAccessor
      ? resolveBackgroundStrokeColor
      : withOpacity(
          backgroundStrokeFallback,
          textBackgroundConfig.strokeOpacity
        )
    : TRANSPARENT_BACKGROUND_COLOR;
  const sharedBackgroundPadding = backgroundDecorationEnabled
    ? TEXT_BACKGROUND_PADDING
    : textConfig.dxpMasking
      ? DEFAULT_TEXT_MASK_PADDING
      : TEXT_COLLISION_SAFE_PADDING;
  const resolveBackgroundColor = (datum: TextLayerDatum): Color => {
    if (datum.isMissingData) {
      return TRANSPARENT_BACKGROUND_COLOR;
    }
    return typeof backgroundBaseFillAccessor === 'function'
      ? backgroundBaseFillAccessor(datum)
      : (backgroundBaseFillAccessor ?? TRANSPARENT_BACKGROUND_COLOR);
  };
  const backgroundColorAccessor = backgroundEnabled
    ? resolveBackgroundColor
    : textConfig.dxpMasking
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

  if (shouldRenderLabelLayer && secondaryLabelLayerData) {
    const labelDataFiltered = filterTextLayerDataByYear(
      secondaryLabelLayerData.filter((datum) => !datum.isMissingData),
      textAttributeTable,
      ctx.yearFilter
    );
    const labelData = sortBySizeDescending(labelDataFiltered, (datum) =>
      resolveAccessorValue(labelSizeAccessor, datum)
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
        getTextAnchor: resolveTextAnchor(secondaryLabelsConfig.align),
        getAlignmentBaseline: (d) =>
          resolveSecondaryPlacement(d).secondaryAlignmentBaseline,
        getPixelOffset: (d) =>
          resolveSecondaryPlacement(d).secondaryPixelOffset,
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
            textStatistics.max
          ],
          getTextAnchor: [secondaryLabelsConfig.align],
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
          getBackgroundColor: [
            textBackgroundConfig.fillMode,
            textBackgroundConfig.fillColor,
            textBackgroundConfig.fillOpacity,
            textBackgroundConfig.valueColumn,
            textBackgroundConfig.categoryColumn,
            textBackgroundConfig.classification?.breaks,
            textBackgroundConfig.classification?.colors,
            textBackgroundConfig.classification?.labels,
            textBackgroundConfig.classification?.disabledLabels,
            secondaryLabelsConfig.dxpMasking,
            secondaryLabelsConfig.haloColor
          ],
          getBorderWidth: [
            textBackgroundConfig.strokeMode,
            textBackgroundConfig.strokeWidth
          ],
          getBorderColor: [
            textBackgroundConfig.strokeMode,
            textBackgroundConfig.strokeColor,
            textBackgroundConfig.strokeOpacity,
            textBackgroundConfig.valueColumn,
            textBackgroundConfig.categoryColumn,
            textBackgroundConfig.strokeClassification?.colors,
            textBackgroundConfig.strokeClassification?.breaks,
            textBackgroundConfig.strokeClassification?.labels,
            textBackgroundConfig.strokeClassification?.disabledLabels
          ]
        }
      };

      layers.push(
        new TextLayer<TextLayerDatum>(labelLayerProps) as ThematicLayer
      );
    }
  }

  if (shouldRenderTextLayer) {
    const textDataFiltered = filterTextLayerDataByYear(
      textLayerData.filter(
        (datum) =>
          !datum.isMissingData || (textConfig.missingData?.show ?? true)
      ),
      textAttributeTable,
      ctx.yearFilter
    );
    const textData = sortBySizeDescending(textDataFiltered, (datum) =>
      resolveAccessorValue(textSizeAccessor, datum)
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
          getTextAnchor: resolveTextAnchor(textConfig.align),
          getAlignmentBaseline: (d) =>
            resolvePrimaryPlacement(d).primaryAlignmentBaseline,
          getPixelOffset: (d) => resolvePrimaryPlacement(d).primaryPixelOffset,
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
              textStatistics.max
            ],
            getTextAnchor: [textConfig.align],
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
            getBackgroundColor: [
              textBackgroundConfig.fillMode,
              textBackgroundConfig.fillColor,
              textBackgroundConfig.fillOpacity,
              textBackgroundConfig.valueColumn,
              textBackgroundConfig.categoryColumn,
              textBackgroundConfig.classification?.breaks,
              textBackgroundConfig.classification?.colors,
              textBackgroundConfig.classification?.labels,
              textBackgroundConfig.classification?.disabledLabels,
              textConfig.dxpMasking,
              textConfig.haloColor
            ],
            getBorderWidth: [
              textBackgroundConfig.strokeMode,
              textBackgroundConfig.strokeWidth
            ],
            getBorderColor: [
              textBackgroundConfig.strokeMode,
              textBackgroundConfig.strokeColor,
              textBackgroundConfig.strokeOpacity,
              textBackgroundConfig.valueColumn,
              textBackgroundConfig.categoryColumn,
              textBackgroundConfig.strokeClassification?.colors,
              textBackgroundConfig.strokeClassification?.breaks,
              textBackgroundConfig.strokeClassification?.labels,
              textBackgroundConfig.strokeClassification?.disabledLabels
            ]
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

function createCategoricalAccessorFromMap(
  vector: ReturnType<ArrowTable['getChild']>,
  colorMap: Map<string, RGBColor> | null,
  fallback: RGBColor,
  opacity: number,
  disabledLabels: string[] = []
): ((datum: TextLayerDatum) => Color) | Color {
  if (!vector || !colorMap || colorMap.size === 0) {
    return withOpacity(fallback, opacity);
  }

  const disabled = new Set(disabledLabels.map(String));
  return (datum: TextLayerDatum): Color => {
    const category = toTextValue(vector.get(datum.rowIndex));
    if (category && disabled.has(category)) {
      return [0, 0, 0, 0];
    }
    const rgb = category ? (colorMap.get(category) ?? fallback) : fallback;
    return withOpacity(rgb, opacity);
  };
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
        'Failed to parse density points from Arrow table',
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
  const pointStrokeDashArray = resolveThematicStrokeDashArray(
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
  const symbolPatternType =
    pointConfig?.mode === SymbolMode.CATEGORIES
      ? resolveSymbolPatternType(pointClassification)
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
    pointShape !== ShapeType.CIRCLE ||
    (!isNativeGeoArrowPoint &&
      !isNativeGeoArrow &&
      (isWkbEncoded || isGeoJsonEncoded));

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
        'Error converting point geometry to GeoJSON',
        LogCategory.MAP,
        {
          encoding: arrowExtension,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      return [];
    }
    if (!geojsonData) {
      logger.warn(
        'Failed to convert point geometry to GeoJSON',
        LogCategory.MAP,
        {
          encoding: arrowExtension
        }
      );
      showWarning(
        m.error_geometry_conversion_title(),
        m.error_geometry_conversion_message()
      );
      return [];
    }
    const filteredGeoJsonData = filterGeoJsonByYear(
      geojsonData,
      ctx.yearFilter
    );

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
          ...filteredGeoJsonData,
          features: [...filteredGeoJsonData.features].sort(
            (a, b) => getGeoJsonPointRadius(b) - getGeoJsonPointRadius(a)
          )
        }
      : filteredGeoJsonData;

    if (
      pointShape !== ShapeType.CIRCLE ||
      (pointStrokeDashed && showPointStroke)
    ) {
      return [
        new GeoJsonLayer({
          id: layerId,
          data: sortedGeoJsonData,
          pointType: 'icon',
          getIcon: (feature: { properties?: Record<string, unknown> }) =>
            createPointSymbolIcon(
              isMissingGeoJsonPoint(feature) ? missingPointShape : pointShape,
              isDisabledGeoJsonPoint(feature)
                ? [0, 0, 0, 0]
                : isMissingGeoJsonPoint(feature)
                  ? withOpacity(
                      missingPointColor,
                      hasHighlights ? 1 : pointFillOpacity
                    )
                  : hideSymbolFill
                    ? [0, 0, 0, 0]
                    : resolveGeoJsonLayerColor(
                        geoJsonFillColor,
                        feature,
                        hasHighlights ? 1 : pointFillOpacity
                      ),
              isDisabledGeoJsonPoint(feature) ||
                (isMissingGeoJsonPoint(feature) && !showMissingPoints)
                ? [0, 0, 0, 0]
                : !showPointStroke
                  ? [0, 0, 0, 0]
                  : resolveGeoJsonLayerColor(
                      geoJsonLineColor,
                      feature,
                      pointStrokeOpacity
                    ),
              showPointStroke ? pointStrokeWidth / 3 : 0,
              showPointStroke && pointStrokeDashed
            ),
          getIconSize: (feature) => {
            if (isDisabledGeoJsonPoint(feature)) {
              return 0;
            }
            if (isMissingGeoJsonPoint(feature)) {
              return showMissingPoints
                ? Math.max(1, missingPointRadius * 2)
                : 0;
            }
            const radius = getGeoJsonPointRadius(feature);
            return useProportionalSymbols
              ? Math.max(0, radius * 2)
              : Math.max(1, radius * 2);
          },
          iconSizeUnits: 'pixels',
          iconSizeScale: 1,
          iconBillboard: true,
          iconAlphaCutoff: 0,
          pickable: true,
          ...resolveHoverHighlightProps(),
          ...(modelMatrix && { modelMatrix }),
          ...(beforeId && { beforeId }),
          updateTriggers: {
            getIcon: [
              pointShape,
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
              pointStrokeColor,
              pointStrokeValueColumn,
              pointStrokeCategoryColumn,
              showPointStroke,
              pointConfig?.strokeClassification?.breaks,
              pointConfig?.strokeClassification?.colors,
              pointConfig?.strokeClassification?.labels,
              pointConfig?.strokeClassification?.disabledLabels,
              pointFillOpacity,
              pointStrokeOpacity,
              pointStrokeWidth,
              pointStrokeDashed,
              pointMissingColumn,
              pointConfig?.missingData?.show,
              pointConfig?.missingData?.color,
              pointConfig?.missingData?.size,
              pointConfig?.missingData?.shape,
              hideSymbolFill,
              hlVersion
            ],
            getIconSize: [
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
            ]
          }
        }) as ThematicLayer
      ];
    }

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
          pointValueColumn!,
          pointClassification!.breaks!,
          pointClassification!.colors!
        )
      : useCategoricalColor && viz
        ? createCategoricalColorAccessor(
            pointCategoryColumn!,
            effectiveCategoryColorMap,
            HIGHLIGHT_FILL_COLOR,
            true,
            pointClassification?.disabledLabels ?? []
          )
        : null;

  const disabledPointCategoryLabels = new Set(
    (pointClassification?.disabledLabels ?? []).map(String)
  );
  const isDisabledPointCategoryRow = (row: DeckDataRow): boolean =>
    pointConfig?.mode === SymbolMode.CATEGORIES &&
    pointCategoryColumn !== undefined &&
    disabledPointCategoryLabels.has(String(row[pointCategoryColumn]));
  const hasDisabledPointCategories =
    pointConfig?.mode === SymbolMode.CATEGORIES &&
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

  if (useProportionalSymbols) {
    sortScatterBinaryDataByRadius(scatterBinaryData);
  }

  const yearFilterBinaryData = {
    length: scatterBinaryData.length ?? pointData.length,
    featureIds: scatterBinaryData.featureIds ?? pointData.featureIds
  };
  const yearFilterProps = ctx.yearFilter
    ? buildYearFilterProps(
        yearFilterBinaryData,
        scatterBinaryData,
        jsTable,
        ctx.yearFilter
      )
    : null;

  const useMultiShapeLayer =
    pointShape !== ShapeType.CIRCLE ||
    missingPointShape !== ShapeType.CIRCLE ||
    useCategoryShape ||
    symbolPatternType !== null ||
    (pointStrokeDashed && showPointStroke);
  const baseLayerProps = {
    id: layerId,
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
    radiusScale: 1,
    radiusUnits: 'pixels' as const,
    lineWidthUnits: 'pixels' as const,
    lineWidthScale: showPointStroke ? pointStrokeWidth / 3 : 0,
    pickable: true,
    ...resolveHoverHighlightProps(),
    ...(modelMatrix && { modelMatrix }),
    ...(beforeId && { beforeId }),
    ...yearFilterProps,
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
        symbolPatternType
      ]
      // Note: getFilterValue is a binary attribute (baked once via filterValueAttr),
      // not a per-frame accessor. Year changes are handled by filterRange prop alone.
    }
  };

  if (useMultiShapeLayer) {
    return [
      new MultiShapeLayer({
        ...baseLayerProps,
        dashed: showPointStroke && pointStrokeDashed,
        dashLength: pointStrokeDashArray[0],
        gapLength: pointStrokeDashArray[1],
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

  const hasLineHighlights =
    lineHighlightedRowIds && lineHighlightedRowIds.size > 0;
  const hlVersion = ctx.highlightVersion ?? 0;
  const {
    geoColumn,
    encoding: arrowExtension,
    isNativeGeoArrow,
    isWkbEncoded,
    isGeoJsonEncoded
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

    const lineYearFilterProps = ctx.yearFilter
      ? buildYearFilterProps(lineData, pathBinaryData, jsTable, ctx.yearFilter)
      : null;

    const lineLayer = new PathLayer({
      id: layerId,
      ...(pathProps as unknown as Record<string, unknown>),
      ...(!colorBinaryAttr && {
        getColor: withOpacity(resolvedLineColor, normalizedLineOpacity)
      }),
      extensions: lineDashed ? [DASH_EXTENSION] : [],
      getDashArray: lineDashArray,
      dashJustified: true,
      widthUnits: 'pixels',
      ...(!widthBinaryAttr && { getWidth: resolvedLineWidth }),
      widthMinPixels: 1,
      pickable: true,
      ...resolveHoverHighlightProps(),
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      ...lineYearFilterProps,
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
        getDashArray: [lineDashed],
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

  if (!isWkbEncoded && !isGeoJsonEncoded) {
    logger.warn(
      'Unknown line encoding, attempting GeoJSON fallback',
      LogCategory.MAP,
      { arrowExtension }
    );
  }

  let lineGeojsonData;
  try {
    const rawGeoJSON = getCachedGeoJSON(jsTable, geoColumn);
    lineGeojsonData =
      rawGeoJSON && ctx.customProjection
        ? projectGeoJSON(rawGeoJSON, ctx.customProjection)
        : rawGeoJSON;
  } catch (error) {
    logger.error('Error converting line geometry to GeoJSON', LogCategory.MAP, {
      encoding: arrowExtension,
      geoColumn,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
  if (!lineGeojsonData) {
    logger.warn('Failed to convert line geometry to GeoJSON', LogCategory.MAP, {
      encoding: arrowExtension,
      geoColumn
    });
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
  const filteredLineGeojsonData = filterGeoJsonByYear(
    lineGeojsonData,
    ctx.yearFilter
  );

  const lineLayer = new GeoJsonLayer({
    id: layerId,
    data: filteredLineGeojsonData,
    stroked: true,
    filled: false,
    getLineColor: geoJsonLineColor,
    extensions: lineUsesDashExtension ? [DASH_EXTENSION] : [],
    getDashArray: geoJsonDashArray,
    dashJustified: true,
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
  const strokeDashArray = strokeDashed ? DEFAULT_DASH_ARRAY : [0, 0];
  const layerId = createThematicLayerId(DeckLayerId.POLYGON_LAYER, ctx);
  const projectedGeoJsonLayerId = `${layerId}-projected-geojson`;
  const patternProps = buildPatternProps(ctx);
  const { color: polygonMissingColor, show: showMissingPolygons } =
    resolveMissingDataRenderProps(
      polygonConfig,
      hexToRgb(DEFAULT_COLORS.missingData)
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

      const fillColorBinaryAttr = fillColorFn
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

      const strokeColorBinaryAttr = strokeColorFn
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

      const polyYearFilterProps = ctx.yearFilter
        ? buildYearFilterProps(
            polyData,
            solidBinaryData,
            jsTable,
            ctx.yearFilter
          )
        : {};

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
        ...polyYearFilterProps,
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

      const strokeYearFilterProps = ctx.yearFilter
        ? buildYearFilterProps(
            outlineData,
            strokeBinaryData,
            jsTable,
            ctx.yearFilter
          )
        : {};

      let strokeLayer: Layer<DeckDataRow>;
      if (strokeDashed) {
        strokeLayer = new PathLayer({
          id: `${layerId}-stroke-dashed`,
          ...(strokePathProps as unknown as Record<string, unknown>),
          ...(!strokeColorBinaryAttr && {
            getColor: withOpacity(polygonStrokeColor, polygonStrokeOpacity)
          }),
          extensions: [DASH_EXTENSION],
          getDashArray: DEFAULT_DASH_ARRAY,
          dashJustified: true,
          widthUnits: 'pixels',
          getWidth: polygonStrokeWidth / 4,
          widthMinPixels: 0.5,
          pickable: false,
          ...(modelMatrix && { modelMatrix }),
          ...(beforeId && { beforeId }),
          ...strokeYearFilterProps,
          updateTriggers: {
            getColor: [polygonStrokeColor, polygonStrokeOpacity, hlVersion],
            getDashArray: [strokeDashed],
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
          ...strokeYearFilterProps,
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
          if (patternGeojson) {
            patternGeojson = filterGeoJsonByYear(
              patternGeojson,
              ctx.yearFilter
            );
          }
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
      logger.warn(
        'Binary polygon parsing failed, falling back to GeoJSON',
        LogCategory.MAP,
        {
          encoding: arrowExtension,
          geoColumn,
          error: error instanceof Error ? error.message : String(error)
        }
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
      'Error converting polygon geometry to GeoJSON',
      LogCategory.MAP,
      {
        encoding: arrowExtension,
        geoColumn,
        error: error instanceof Error ? error.message : String(error)
      }
    );
    return [];
  }
  if (!geojsonData) {
    logger.warn('Failed to convert geometry to GeoJSON', LogCategory.MAP, {
      encoding: arrowExtension
    });
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
  const filteredPolygonGeojsonData = filterGeoJsonByYear(
    geojsonData,
    ctx.yearFilter
  );

  const patternLayer =
    patternProps &&
    showGeoJsonFill &&
    filteredPolygonGeojsonData.features.length > 0
      ? createPolygonPatternOverlayLayer(
          layerId,
          polygonClassification?.patternId,
          filteredPolygonGeojsonData,
          patternProps,
          ctx
        )
      : null;

  const shouldSplitGeoJsonLayers = Boolean(patternLayer && showGeoJsonStroke);

  let geoJsonLayers: Layer<DeckDataRow>[] = [];
  if (shouldSplitGeoJsonLayers && patternLayer) {
    geoJsonLayers = [
      new GeoJsonLayer({
        id: projectedGeoJsonLayerId,
        data: filteredPolygonGeojsonData,
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
      patternLayer,
      ...(showGeoJsonStroke
        ? [
            new GeoJsonLayer({
              id: `${layerId}-stroke`,
              data: filteredPolygonGeojsonData,
              getLineColor: geoJsonStrokeColor,
              filled: false,
              stroked: true,
              extensions: strokeDashed ? [DASH_EXTENSION] : [],
              getDashArray: strokeDashArray,
              dashJustified: true,
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
                getDashArray: [strokeDashed]
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
        data: filteredPolygonGeojsonData,
        getFillColor: geoJsonFillColor,
        getLineColor: geoJsonStrokeColor,
        filled: showGeoJsonFill,
        stroked: showGeoJsonStroke,
        extensions: showGeoJsonStroke && strokeDashed ? [DASH_EXTENSION] : [],
        getDashArray: showGeoJsonStroke ? strokeDashArray : [0, 0],
        dashJustified: true,
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
          getDashArray: [showGeoJsonStroke, strokeDashed]
        },
        dataComparator: (newData, oldData) => newData === oldData
      }),
      ...(patternLayer ? [patternLayer] : [])
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
  const filteredData = filterGeoJsonByYear(data, ctx.yearFilter);
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
      data: filteredData,
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
    filteredData,
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
    logger.debug(
      'Skipping thematic layer creation for empty Arrow table',
      LogCategory.MAP,
      {
        datasetId: ctx.datasetId
      }
    );
    return [];
  }

  const geometryInfo = ctx.geometryInfo ?? extractGeometryInfo(jsTable);

  if (!geometryInfo) {
    const hasUserDataset = Boolean(ctx.datasetId);
    if (hasUserDataset) {
      logger.error('No GeoArrow metadata in Arrow table', LogCategory.MAP, {
        datasetId: ctx.datasetId
      });
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
      logger.error(
        'Unsupported geometry type for Deck layer',
        LogCategory.MAP,
        {
          geometryType: resolvedGeometryType,
          datasetId: ctx.datasetId
        }
      );
  }

  if (isPrimitiveFilteredOut) {
    thematicLayers = thematicLayers.map(
      (layer) => layer.clone({ visible: false }) as Layer<DeckDataRow>
    );
  }

  const textLayers = createTextOverlayLayers(jsTable, geometryInfo, ctx);
  return [...thematicLayers, ...textLayers];
}
