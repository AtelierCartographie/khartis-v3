import type {
  DatasetResult,
  ProcessedDataset
} from '$lib/features/data-pipeline';
import {
  BasemapDottedPattern,
  CategoryShapeMode,
  ColorMode,
  DEFAULT_COLORS,
  DEFAULT_LINEAR_SYMBOL_BAR_WIDTH,
  FillMode,
  ProportionalType,
  ShapeType,
  SizeMode,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode,
  ThicknessMode,
  VisualizationType,
  VISUALIZATION_DEFAULTS,
  availableShapesForSymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import { GEO_COLUMN_TYPE } from '../constants/data.constants';
import { GEOJSON_TYPE } from '../constants/geojson.constants';
import {
  clampFontSize,
  CARTOGRAPHIC_FONT_FAMILY,
  normalizeFontFamily
} from '$lib/features/step-toolbar/fonts.constants';
import {
  ALL_PRIMITIVE_FILTERS,
  PrimitiveFilterType,
  ScaleType,
  type ClassificationConfig,
  type LinePrimitiveConfig,
  type PolygonPrimitiveConfig,
  type PrimitiveConfigKind,
  type PrimitiveConfigMap,
  type PrimitiveFilter,
  type SymbolPrimitiveConfig,
  type TextBackgroundConfig,
  type TextPrimitiveConfig,
  type TextSecondaryLabelsConfig,
  type VisualizationConfig,
  type VizDataFilter
} from './visualization.types';

const DEFAULT_SYMBOL_SIZE = VISUALIZATION_DEFAULTS.symbolSize;
const DEFAULT_SYMBOL_MIN_SIZE = 5;

export const DEFAULT_SYMBOL_MAX_SIZE = VISUALIZATION_DEFAULTS.symbolMaxSize;
export const DEFAULT_SYMBOL_OPACITY =
  VISUALIZATION_DEFAULTS.symbolOpacity / 100;

export function resolvePrimitiveKind(
  primitive: PrimitiveFilter | PrimitiveConfigKind
): PrimitiveConfigKind {
  switch (primitive) {
    case PrimitiveFilterType.POINT:
      return 'symbol';
    case PrimitiveFilterType.LINE:
      return 'line';
    case PrimitiveFilterType.TEXT:
      return 'text';
    case PrimitiveFilterType.POLYGON:
    default:
      return 'polygon';
  }
}

function resolveLegacyPrimitiveEnabled(
  visualization: VisualizationConfig,
  primitive: PrimitiveFilter
): boolean {
  const primitiveFilters =
    visualization.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;

  if (primitive === PrimitiveFilterType.TEXT) {
    if (visualization.text?.enabled !== undefined) {
      return visualization.text.enabled;
    }

    return (
      primitiveFilters.includes(primitive) ||
      (visualization.style.textOpacity ?? 0) > 0
    );
  }

  return primitiveFilters.includes(primitive);
}

function buildSecondaryLabelsConfig(
  visualization: VisualizationConfig
): TextSecondaryLabelsConfig {
  const existing = visualization.text?.secondaryLabels;

  return {
    enabled:
      existing?.enabled ??
      Boolean(
        visualization.mapping.secondaryLabelColumn &&
        (visualization.style.labelOpacity ?? 0) > 0
      ),
    labelColumn:
      existing?.labelColumn ?? visualization.mapping.secondaryLabelColumn,
    fontFamily:
      normalizeFontFamily(
        existing?.fontFamily ?? visualization.style.labelFontFamily
      ) ?? CARTOGRAPHIC_FONT_FAMILY,
    color: existing?.color ?? visualization.style.labelColor,
    opacity: existing?.opacity ?? visualization.style.labelOpacity ?? 0,
    size: clampFontSize(
      existing?.size ??
        visualization.style.labelSize ??
        VISUALIZATION_DEFAULTS.labelSize,
      VISUALIZATION_DEFAULTS.labelSize
    ),
    bold: existing?.bold ?? visualization.style.labelBold ?? false,
    italic: existing?.italic ?? visualization.style.labelItalic ?? false,
    align: existing?.align ?? visualization.style.labelAlign ?? 'center',
    halo: existing?.halo ?? visualization.style.labelHalo ?? false,
    haloColor:
      existing?.haloColor ??
      visualization.style.labelHaloColor ??
      DEFAULT_COLORS.halo,
    haloWidth:
      existing?.haloWidth ??
      visualization.style.labelHaloWidth ??
      VISUALIZATION_DEFAULTS.haloWidth,
    collisionDetection:
      existing?.collisionDetection ??
      visualization.style.labelCollisionDetection ??
      true,
    dxpMasking:
      existing?.dxpMasking ?? visualization.style.labelDxpMasking ?? false
  };
}

export function buildPolygonPrimitiveConfig(
  visualization: VisualizationConfig
): PolygonPrimitiveConfig {
  const existing = visualization.polygon;

  return {
    enabled: resolveLegacyPrimitiveEnabled(
      visualization,
      PrimitiveFilterType.POLYGON
    ),
    fillMode:
      existing?.fillMode ?? visualization.modes?.fill ?? FillMode.UNIQUE,
    fillColor: existing?.fillColor ?? visualization.style.fillColor,
    fillOpacity: existing?.fillOpacity ?? visualization.style.fillOpacity ?? 1,
    strokeMode:
      existing?.strokeMode ?? visualization.modes?.stroke ?? StrokeMode.UNIQUE,
    strokeColor:
      existing?.strokeColor ??
      visualization.style.strokeColor ??
      DEFAULT_COLORS.stroke,
    strokeWidth:
      existing?.strokeWidth ??
      visualization.style.strokeWidth ??
      VISUALIZATION_DEFAULTS.strokeWidth,
    strokeOpacity:
      existing?.strokeOpacity ?? visualization.style.strokeOpacity ?? 1,
    strokeDashed:
      existing?.strokeDashed ?? visualization.style.strokeDashed ?? false,
    strokeDashedPattern:
      existing?.strokeDashedPattern ?? visualization.style.strokeDashedPattern,
    valueColumn: existing?.valueColumn ?? visualization.mapping.valueColumn,
    categoryColumn:
      existing?.categoryColumn ?? visualization.mapping.categoryColumn,
    strokeValueColumn: existing?.strokeValueColumn,
    strokeCategoryColumn: existing?.strokeCategoryColumn,
    classification: existing?.classification ?? visualization.classification,
    strokeClassification: existing?.strokeClassification,
    missingData: existing?.missingData ?? visualization.missingData
  };
}

function hasOwnClassificationKey<K extends keyof ClassificationConfig>(
  classification: ClassificationConfig | undefined,
  key: K
): classification is ClassificationConfig & Pick<ClassificationConfig, K> {
  return (
    classification !== undefined &&
    Object.prototype.hasOwnProperty.call(classification, key)
  );
}

function resolveSymbolClassification(
  existing: ClassificationConfig | undefined,
  mirror: ClassificationConfig | undefined,
  fallback: ClassificationConfig | undefined
): ClassificationConfig | undefined {
  const base = existing ?? mirror ?? fallback;
  if (!base || !mirror || mirror === base) {
    return base;
  }

  return {
    ...base,
    ...(hasOwnClassificationKey(mirror, 'colors')
      ? { colors: mirror.colors }
      : {}),
    ...(hasOwnClassificationKey(mirror, 'labels')
      ? { labels: mirror.labels }
      : {}),
    ...(hasOwnClassificationKey(mirror, 'categoryValues')
      ? { categoryValues: mirror.categoryValues }
      : {}),
    ...(hasOwnClassificationKey(mirror, 'disabledLabels')
      ? { disabledLabels: mirror.disabledLabels }
      : {}),
    ...(hasOwnClassificationKey(mirror, 'paletteId')
      ? { paletteId: mirror.paletteId }
      : {}),
    ...(hasOwnClassificationKey(mirror, 'inverted')
      ? { inverted: mirror.inverted }
      : {}),
    ...(hasOwnClassificationKey(mirror, 'patternId')
      ? { patternId: mirror.patternId }
      : {}),
    ...(hasOwnClassificationKey(mirror, 'patternParams')
      ? { patternParams: mirror.patternParams }
      : {})
  };
}

export function buildSymbolPrimitiveConfig(
  visualization: VisualizationConfig
): SymbolPrimitiveConfig {
  const existing = visualization.symbol;
  const legacySymbols = visualization.symbols;
  const legacyFillClassification =
    existing?.fillMode === FillMode.CLASSES ||
    existing?.fillMode === FillMode.CATEGORIES
      ? (existing?.classification ??
        visualization.symbolClassification ??
        visualization.classification)
      : undefined;
  const legacyFillValueColumn =
    existing?.fillMode === FillMode.CLASSES
      ? (existing?.valueColumn ?? visualization.mapping.valueColumn)
      : undefined;
  const legacyFillCategoryColumn =
    existing?.fillMode === FillMode.CATEGORIES
      ? (existing?.categoryColumn ?? visualization.mapping.categoryColumn)
      : undefined;

  return {
    enabled: resolveLegacyPrimitiveEnabled(
      visualization,
      PrimitiveFilterType.POINT
    ),
    mode: existing?.mode ?? visualization.modes?.symbol ?? SymbolMode.UNIQUE,
    shape: existing?.shape ?? legacySymbols?.type ?? ShapeType.CIRCLE,
    size: existing?.size ?? legacySymbols?.size ?? DEFAULT_SYMBOL_SIZE,
    minSize:
      existing?.minSize ?? legacySymbols?.minSize ?? DEFAULT_SYMBOL_MIN_SIZE,
    maxSize:
      existing?.maxSize ?? legacySymbols?.maxSize ?? DEFAULT_SYMBOL_MAX_SIZE,
    barWidth:
      existing?.barWidth ??
      legacySymbols?.barWidth ??
      DEFAULT_LINEAR_SYMBOL_BAR_WIDTH,
    sizeScale:
      existing?.sizeScale ?? legacySymbols?.sizeScale ?? ScaleType.LINEAR,
    opacity:
      existing?.opacity ??
      legacySymbols?.opacity ??
      visualization.style.fillOpacity ??
      DEFAULT_SYMBOL_OPACITY,
    fillMode:
      existing?.fillMode ?? visualization.modes?.fill ?? FillMode.UNIQUE,
    fillColor:
      existing?.fillColor ??
      visualization.style.symbolFillColor ??
      visualization.style.fillColor,
    fillColorB: existing?.fillColorB ?? visualization.style.fillColorB,
    strokeMode:
      existing?.strokeMode ?? visualization.modes?.stroke ?? StrokeMode.UNIQUE,
    strokeColor:
      existing?.strokeColor ??
      visualization.style.strokeColor ??
      DEFAULT_COLORS.stroke,
    strokeWidth:
      existing?.strokeWidth ??
      visualization.style.strokeWidth ??
      VISUALIZATION_DEFAULTS.strokeWidth,
    strokeOpacity:
      existing?.strokeOpacity ?? visualization.style.strokeOpacity ?? 1,
    strokeDashed:
      existing?.strokeDashed ?? visualization.style.strokeDashed ?? false,
    strokeDashedPattern:
      existing?.strokeDashedPattern ?? visualization.style.strokeDashedPattern,
    proportionalType:
      existing?.proportionalType ??
      visualization.modes?.proportionalType ??
      ProportionalType.SINGLE,
    categoryShape:
      existing?.categoryShape ??
      visualization.modes?.categoryShape ??
      CategoryShapeMode.UNIQUE,
    commonScale: existing?.commonScale ?? true,
    positionMode: existing?.positionMode ?? SymbolDoublePosition.OVERLAY,
    breakValueA: existing?.breakValueA ?? null,
    breakValueB: existing?.breakValueB ?? null,
    valueColumn: existing?.valueColumn ?? visualization.mapping.valueColumn,
    categoryColumn:
      existing?.categoryColumn ?? visualization.mapping.categoryColumn,
    sizeColumn: existing?.sizeColumn ?? visualization.mapping.sizeColumn,
    fillValueColumn: existing?.fillValueColumn ?? legacyFillValueColumn,
    fillCategoryColumn:
      existing?.fillCategoryColumn ?? legacyFillCategoryColumn,
    fillClassification:
      existing?.fillClassification ?? legacyFillClassification,
    strokeValueColumn: existing?.strokeValueColumn,
    strokeCategoryColumn: existing?.strokeCategoryColumn,
    classification: resolveSymbolClassification(
      existing?.classification,
      visualization.symbolClassification,
      visualization.classification
    ),
    strokeClassification: existing?.strokeClassification,
    missingData: existing?.missingData ?? visualization.missingData,
    modeStates: existing?.modeStates
  };
}

export function buildLinePrimitiveConfig(
  visualization: VisualizationConfig
): LinePrimitiveConfig {
  const existing = visualization.line;
  const colorMode =
    existing?.colorMode ?? visualization.modes?.color ?? ColorMode.UNIQUE;
  const thicknessMode =
    existing?.thicknessMode ??
    visualization.modes?.thickness ??
    ThicknessMode.UNIQUE;
  const usesColorClassification =
    colorMode === ColorMode.CLASSES || colorMode === ColorMode.CATEGORIES;
  const colorClassification =
    existing?.classification ??
    (usesColorClassification
      ? (visualization.lineClassification ?? visualization.classification)
      : undefined);
  const thicknessClassification =
    existing?.thicknessClassification ??
    (thicknessMode === ThicknessMode.CLASSES
      ? visualization.lineThicknessClassification
      : undefined);

  return {
    enabled: resolveLegacyPrimitiveEnabled(
      visualization,
      PrimitiveFilterType.LINE
    ),
    colorMode,
    thicknessMode,
    color: existing?.color ?? visualization.style.lineColor,
    width:
      existing?.width ??
      visualization.style.lineWidth ??
      VISUALIZATION_DEFAULTS.lineWidth,
    maxWidth:
      existing?.maxWidth ??
      visualization.style.lineMaxWidth ??
      VISUALIZATION_DEFAULTS.lineMaxWidth,
    opacity: existing?.opacity ?? visualization.style.lineOpacity ?? 1,
    dashed: existing?.dashed ?? visualization.style.lineDashed ?? false,
    dashedPattern:
      existing?.dashedPattern ??
      visualization.style.lineDashedPattern ??
      BasemapDottedPattern.DOTS,
    valueColumn: existing?.valueColumn ?? visualization.mapping.valueColumn,
    categoryColumn:
      existing?.categoryColumn ?? visualization.mapping.categoryColumn,
    sizeColumn: existing?.sizeColumn ?? visualization.mapping.sizeColumn,
    classification: colorClassification,
    thicknessClassification,
    missingData: existing?.missingData ?? visualization.missingData,
    colorModeStates: existing?.colorModeStates,
    thicknessModeStates: existing?.thicknessModeStates
  };
}

function buildTextBackgroundConfig(
  existing: TextBackgroundConfig | undefined
): TextBackgroundConfig {
  const defaultFillOpacity = VISUALIZATION_DEFAULTS.fillOpacity / 100;
  return {
    fillMode: existing?.fillMode ?? FillMode.NONE,
    fillColor: existing?.fillColor,
    fillOpacity: existing?.fillOpacity ?? defaultFillOpacity,
    strokeMode: existing?.strokeMode ?? StrokeMode.NONE,
    strokeColor: existing?.strokeColor,
    strokeWidth: existing?.strokeWidth ?? VISUALIZATION_DEFAULTS.strokeWidth,
    strokeOpacity: existing?.strokeOpacity ?? 1,
    strokeDashed: existing?.strokeDashed ?? false,
    strokeDashedPattern: existing?.strokeDashedPattern,
    valueColumn: existing?.valueColumn,
    categoryColumn: existing?.categoryColumn,
    classification: existing?.classification,
    strokeClassification: existing?.strokeClassification,
    strokeValueColumn: existing?.strokeValueColumn,
    strokeCategoryColumn: existing?.strokeCategoryColumn
  };
}

export function buildTextPrimitiveConfig(
  visualization: VisualizationConfig
): TextPrimitiveConfig {
  const existing = visualization.text;
  const enabled = resolveLegacyPrimitiveEnabled(
    visualization,
    PrimitiveFilterType.TEXT
  );
  const fallbackOpacity = VISUALIZATION_DEFAULTS.textOpacity / 100;
  const styleTextOpacity = visualization.style.textOpacity;
  const normalizedOpacity =
    existing?.opacity !== undefined
      ? existing.opacity > 0
        ? existing.opacity
        : enabled && (styleTextOpacity ?? 0) > 0
          ? (styleTextOpacity ?? existing.opacity)
          : existing.opacity
      : (styleTextOpacity ?? (enabled ? fallbackOpacity : 0));

  return {
    enabled,
    labelColumn: existing?.labelColumn ?? visualization.mapping.labelColumn,
    colorMode:
      existing?.colorMode ?? visualization.modes?.color ?? ColorMode.UNIQUE,
    sizeMode: existing?.sizeMode ?? visualization.modes?.size ?? SizeMode.FIXED,
    fontFamily:
      normalizeFontFamily(
        existing?.fontFamily ?? visualization.style.textFontFamily
      ) ?? CARTOGRAPHIC_FONT_FAMILY,
    color: existing?.color ?? visualization.style.textColor,
    opacity: normalizedOpacity,
    size: clampFontSize(
      existing?.size ??
        visualization.style.textSize ??
        VISUALIZATION_DEFAULTS.textSize,
      VISUALIZATION_DEFAULTS.textSize
    ),
    bold: existing?.bold ?? visualization.style.textBold ?? false,
    italic: existing?.italic ?? visualization.style.textItalic ?? false,
    align: existing?.align ?? visualization.style.textAlign ?? 'center',
    halo: existing?.halo ?? visualization.style.textHalo ?? false,
    haloColor:
      existing?.haloColor ??
      visualization.style.textHaloColor ??
      DEFAULT_COLORS.halo,
    haloWidth:
      existing?.haloWidth ??
      visualization.style.textHaloWidth ??
      VISUALIZATION_DEFAULTS.haloWidth,
    collisionDetection:
      existing?.collisionDetection ??
      visualization.style.textCollisionDetection ??
      true,
    dxpMasking:
      existing?.dxpMasking ?? visualization.style.textDxpMasking ?? false,
    valueColumn: existing?.valueColumn ?? visualization.mapping.valueColumn,
    categoryColumn:
      existing?.categoryColumn ?? visualization.mapping.categoryColumn,
    classification:
      existing?.classification ??
      visualization.textClassification ??
      visualization.classification,
    missingData: existing?.missingData ?? visualization.missingData,
    secondaryLabels: buildSecondaryLabelsConfig(visualization),
    background: buildTextBackgroundConfig(existing?.background)
  };
}

export function getPolygonPrimitive(
  visualization: VisualizationConfig | null | undefined
): PolygonPrimitiveConfig | undefined {
  return visualization ? buildPolygonPrimitiveConfig(visualization) : undefined;
}

export function getSymbolPrimitive(
  visualization: VisualizationConfig | null | undefined
): SymbolPrimitiveConfig | undefined {
  return visualization ? buildSymbolPrimitiveConfig(visualization) : undefined;
}

export function getSymbolFillValueColumn(
  visualization: VisualizationConfig | null | undefined
): string | undefined {
  return getSymbolPrimitive(visualization)?.fillValueColumn;
}

export function getSymbolFillCategoryColumn(
  visualization: VisualizationConfig | null | undefined
): string | undefined {
  return getSymbolPrimitive(visualization)?.fillCategoryColumn;
}

export function getSymbolFillClassification(
  visualization:
    | Pick<
        VisualizationConfig,
        'symbol' | 'classification' | 'symbolClassification'
      >
    | null
    | undefined
): ClassificationConfig | undefined {
  if (!visualization) {
    return undefined;
  }

  return getSymbolPrimitive(visualization as VisualizationConfig)
    ?.fillClassification;
}

export function getLinePrimitive(
  visualization: VisualizationConfig | null | undefined
): LinePrimitiveConfig | undefined {
  return visualization ? buildLinePrimitiveConfig(visualization) : undefined;
}

export function getLineThicknessClassification(
  visualization:
    | Pick<
        VisualizationConfig,
        | 'line'
        | 'classification'
        | 'lineClassification'
        | 'lineThicknessClassification'
      >
    | null
    | undefined
): ClassificationConfig | undefined {
  if (!visualization) {
    return undefined;
  }

  const line = visualization.line;
  const usesThicknessClasses = line?.thicknessMode === ThicknessMode.CLASSES;

  return (
    line?.thicknessClassification ??
    (usesThicknessClasses
      ? visualization.lineThicknessClassification
      : undefined)
  );
}

export function getTextPrimitive(
  visualization: VisualizationConfig | null | undefined
): TextPrimitiveConfig | undefined {
  return visualization ? buildTextPrimitiveConfig(visualization) : undefined;
}

export function getPrimitive(
  visualization: VisualizationConfig | null | undefined,
  primitive: PrimitiveFilter | PrimitiveConfigKind
): PrimitiveConfigMap[PrimitiveConfigKind] | undefined {
  if (!visualization) {
    return undefined;
  }

  switch (resolvePrimitiveKind(primitive)) {
    case 'symbol':
      return buildSymbolPrimitiveConfig(visualization);
    case 'line':
      return buildLinePrimitiveConfig(visualization);
    case 'text':
      return buildTextPrimitiveConfig(visualization);
    case 'polygon':
    default:
      return buildPolygonPrimitiveConfig(visualization);
  }
}

export function getEnabledPrimitiveFilters(
  visualization: VisualizationConfig | null | undefined
): PrimitiveFilter[] {
  if (!visualization) {
    return [];
  }

  const enabledFilters: PrimitiveFilter[] = [];

  if (buildSymbolPrimitiveConfig(visualization).enabled) {
    enabledFilters.push(PrimitiveFilterType.POINT);
  }
  if (buildLinePrimitiveConfig(visualization).enabled) {
    enabledFilters.push(PrimitiveFilterType.LINE);
  }
  if (buildPolygonPrimitiveConfig(visualization).enabled) {
    enabledFilters.push(PrimitiveFilterType.POLYGON);
  }
  if (buildTextPrimitiveConfig(visualization).enabled) {
    enabledFilters.push(PrimitiveFilterType.TEXT);
  }

  return enabledFilters;
}

export function getPrimitiveValueColumn(
  visualization: VisualizationConfig | null | undefined,
  primitive: PrimitiveFilter
): string | undefined {
  const resolved = getPrimitive(visualization, primitive);
  return 'valueColumn' in (resolved ?? {}) ? resolved?.valueColumn : undefined;
}

export function getPrimitiveCategoryColumn(
  visualization: VisualizationConfig | null | undefined,
  primitive: PrimitiveFilter
): string | undefined {
  const resolved = getPrimitive(visualization, primitive);
  return 'categoryColumn' in (resolved ?? {})
    ? resolved?.categoryColumn
    : undefined;
}

export function getPrimitiveSizeColumn(
  visualization: VisualizationConfig | null | undefined,
  primitive: PrimitiveFilter
): string | undefined {
  switch (primitive) {
    case PrimitiveFilterType.POINT:
      return getSymbolPrimitive(visualization)?.sizeColumn;
    case PrimitiveFilterType.LINE:
      return getLinePrimitive(visualization)?.sizeColumn;
    default:
      return undefined;
  }
}

export function getPrimitiveClassification(
  visualization:
    | Pick<
        VisualizationConfig,
        | 'polygon'
        | 'symbol'
        | 'line'
        | 'text'
        | 'classification'
        | 'symbolClassification'
        | 'lineClassification'
        | 'textClassification'
      >
    | null
    | undefined,
  primitive: PrimitiveFilter
): ClassificationConfig | undefined {
  if (!visualization) return undefined;

  const resolvedPrimitive = getPrimitive(
    visualization as VisualizationConfig,
    primitive
  );
  if (primitive === PrimitiveFilterType.POINT) {
    return resolveSymbolClassification(
      resolvedPrimitive && 'classification' in resolvedPrimitive
        ? resolvedPrimitive.classification
        : undefined,
      visualization.symbolClassification,
      visualization.classification
    );
  }

  if (resolvedPrimitive && 'classification' in resolvedPrimitive) {
    return resolvedPrimitive.classification;
  }

  switch (primitive) {
    case PrimitiveFilterType.LINE:
      return visualization.lineClassification ?? visualization.classification;
    case PrimitiveFilterType.TEXT:
      return visualization.textClassification ?? visualization.classification;
    case PrimitiveFilterType.POLYGON:
    default:
      return visualization.classification;
  }
}

type GeometryFamily = 'point' | 'line' | 'polygon' | 'unknown';

const GEOMETRY_FAMILY_KEYWORDS: Record<
  Exclude<GeometryFamily, 'unknown'>,
  readonly string[]
> = {
  polygon: ['polygon', 'multisurface'],
  line: ['line', 'curve'],
  point: ['point']
};

const GEOMETRY_COLLECTION_KEYWORD =
  GEOJSON_TYPE.GEOMETRY_COLLECTION.toLowerCase();

export function resolveGeometryFamilyFromDataset(
  dataset: ProcessedDataset | DatasetResult
): GeometryFamily {
  const geometryType =
    typeof dataset.geometry === 'string'
      ? dataset.geometry
      : dataset.geometry?.type;
  const normalized = geometryType?.toLowerCase() ?? '';

  if (normalized === GEOMETRY_COLLECTION_KEYWORD) {
    return 'unknown';
  }

  for (const [family, keywords] of Object.entries(GEOMETRY_FAMILY_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return family as Exclude<GeometryFamily, 'unknown'>;
    }
  }

  if (
    'joinedBasemap' in dataset &&
    typeof dataset.joinedBasemap === 'string' &&
    dataset.joinedBasemap.length > 0
  ) {
    return 'polygon';
  }

  if (datasetHasGpsPointColumns(dataset)) {
    return 'point';
  }

  return 'unknown';
}

function datasetHasGpsPointColumns(
  dataset: ProcessedDataset | DatasetResult
): boolean {
  const columns = dataset.geoDetection?.geoColumns ?? [];
  if (columns.length === 0) {
    return false;
  }

  const detectedTypes = new Set(columns.map((column) => column.type));
  if (detectedTypes.has(GEO_COLUMN_TYPE.COORDINATES)) {
    return true;
  }

  return (
    detectedTypes.has(GEO_COLUMN_TYPE.LATITUDE) &&
    detectedTypes.has(GEO_COLUMN_TYPE.LONGITUDE)
  );
}

export function resolveAllowedPrimitiveFilters(
  _type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): PrimitiveFilter[] {
  switch (resolveGeometryFamilyFromDataset(dataset)) {
    case 'polygon':
      return [
        PrimitiveFilterType.POINT,
        PrimitiveFilterType.POLYGON,
        PrimitiveFilterType.TEXT
      ];

    case 'line':
      return [
        PrimitiveFilterType.POINT,
        PrimitiveFilterType.LINE,
        PrimitiveFilterType.TEXT
      ];

    case 'point':
      return [PrimitiveFilterType.POINT, PrimitiveFilterType.TEXT];

    default:
      return [];
  }
}

export function resolveDefaultPrimitiveFilters(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): PrimitiveFilter[] {
  switch (resolveGeometryFamilyFromDataset(dataset)) {
    case 'polygon':
      if (
        type === VisualizationType.PROPORTIONAL ||
        type === VisualizationType.BIVARIATE
      ) {
        return [PrimitiveFilterType.POINT, PrimitiveFilterType.POLYGON];
      }

      return [PrimitiveFilterType.POLYGON];

    case 'line':
      return [PrimitiveFilterType.LINE];

    case 'point':
      return [PrimitiveFilterType.POINT];

    default:
      return [];
  }
}

function sanitizePrimitiveFilters(
  filters: PrimitiveFilter[] | undefined,
  allowedFilters: PrimitiveFilter[],
  defaultFilters: PrimitiveFilter[]
): PrimitiveFilter[] {
  if (filters === undefined) {
    return [...defaultFilters];
  }

  const sourceFilters = filters;
  const sanitized = [...new Set(sourceFilters)].filter((filter) =>
    allowedFilters.includes(filter)
  );

  return sanitized;
}

function sanitizePrimitiveOrder(
  order: PrimitiveFilter[] | undefined,
  allowedFilters: PrimitiveFilter[]
): PrimitiveFilter[] {
  const sourceOrder = order && order.length > 0 ? order : ALL_PRIMITIVE_FILTERS;
  const sanitized = [
    ...new Set([...sourceOrder, ...ALL_PRIMITIVE_FILTERS])
  ].filter((filter) => allowedFilters.includes(filter));

  return sanitized.length > 0 ? sanitized : [...allowedFilters];
}

function sanitizeDataFilters(
  dataFilters: VizDataFilter[] | undefined,
  allowedFilters: PrimitiveFilter[]
): VizDataFilter[] | undefined {
  if (!dataFilters) {
    return undefined;
  }

  return dataFilters.filter(
    (filter) =>
      !filter.primitiveType ||
      filter.primitiveType === PrimitiveFilterType.TEXT ||
      allowedFilters.includes(filter.primitiveType)
  );
}

function normalizeLegacyLabelStyle(
  visualization: VisualizationConfig
): VisualizationConfig['style'] {
  const style = { ...visualization.style };
  const labelOpacity = style.labelOpacity ?? 0;
  const textOpacity = style.textOpacity ?? 0;
  const hasLegacyLabelLayer =
    labelOpacity > 0 && Boolean(visualization.mapping.labelColumn);
  const hasActiveTextLayer = textOpacity > 0;

  if (hasLegacyLabelLayer && !hasActiveTextLayer) {
    style.textOpacity = labelOpacity;
    style.textColor = style.labelColor ?? style.textColor;
    style.textFontFamily = style.labelFontFamily ?? style.textFontFamily;
    style.textSize = style.labelSize ?? style.textSize;
    style.textBold = style.labelBold ?? style.textBold;
    style.textItalic = style.labelItalic ?? style.textItalic;
    style.textAlign = style.labelAlign ?? style.textAlign;
    style.textHalo = style.labelHalo ?? style.textHalo;
    style.textHaloColor = style.labelHaloColor ?? style.textHaloColor;
    style.textHaloWidth = style.labelHaloWidth ?? style.textHaloWidth;
    style.textCollisionDetection =
      style.labelCollisionDetection ?? style.textCollisionDetection;
    style.textDxpMasking = style.labelDxpMasking ?? style.textDxpMasking;
  }

  style.labelOpacity = 0;

  return style;
}

export function withPrimitiveConfigs(
  visualization: VisualizationConfig
): VisualizationConfig {
  const style = visualization.style;
  const primitiveFilters =
    visualization.primitiveFilters ?? getEnabledPrimitiveFilters(visualization);

  const nextVisualization: VisualizationConfig = {
    ...visualization,
    primitiveFilters,
    polygon: buildPolygonPrimitiveConfig({
      ...visualization,
      style,
      primitiveFilters
    }),
    symbol: buildSymbolPrimitiveConfig({
      ...visualization,
      style,
      primitiveFilters
    }),
    line: buildLinePrimitiveConfig({
      ...visualization,
      style,
      primitiveFilters
    }),
    text: buildTextPrimitiveConfig({
      ...visualization,
      style,
      primitiveFilters
    })
  };

  return nextVisualization;
}

export function normalizeVisualizationConfig(
  visualization: VisualizationConfig,
  dataset: ProcessedDataset | DatasetResult
): VisualizationConfig {
  const allowedFilters = resolveAllowedPrimitiveFilters(
    visualization.type,
    dataset
  );
  const defaultFilters = resolveDefaultPrimitiveFilters(
    visualization.type,
    dataset
  );

  const symbolMode = visualization.modes?.symbol ?? SymbolMode.UNIQUE;
  const proportionalType =
    visualization.modes?.proportionalType ?? ProportionalType.SINGLE;
  const allowedShapes = availableShapesForSymbolMode(
    symbolMode,
    proportionalType
  );
  const currentShape = visualization.symbols?.type;
  const normalizedShape =
    currentShape && allowedShapes.includes(currentShape)
      ? currentShape
      : (allowedShapes[0] ?? ShapeType.CIRCLE);
  const normalizedSymbols = visualization.symbols
    ? { ...visualization.symbols, type: normalizedShape }
    : visualization.symbols;
  const normalizedStyle = normalizeLegacyLabelStyle(visualization);
  const primitiveBackfilledVisualization = withPrimitiveConfigs({
    ...visualization,
    style: normalizedStyle,
    symbols: normalizedSymbols
  });
  const enabledPrimitiveFilters = getEnabledPrimitiveFilters(
    primitiveBackfilledVisualization
  );
  const primitiveFilters = sanitizePrimitiveFilters(
    visualization.primitiveFilters ?? enabledPrimitiveFilters,
    allowedFilters,
    defaultFilters
  );
  const primitiveConfigVisualization = withPrimitiveConfigs({
    ...primitiveBackfilledVisualization,
    primitiveFilters
  });

  return {
    ...primitiveConfigVisualization,
    style: normalizedStyle,
    symbols: normalizedSymbols,
    primitiveFilters,
    primitiveOrder: sanitizePrimitiveOrder(
      visualization.primitiveOrder,
      allowedFilters
    ),
    dataFilters: sanitizeDataFilters(visualization.dataFilters, allowedFilters)
  };
}
