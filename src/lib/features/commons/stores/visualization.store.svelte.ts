import type {
  DatasetResult,
  ProcessedDataset
} from '$lib/features/data-pipeline';
import {
  SavePriority,
  persistenceRegistry,
  type SavePriorityType
} from '$lib/features/project-management/core/persistence-registry';
import {
  BasemapDottedPattern,
  CategoryShapeMode,
  ColorMode,
  DEFAULT_COLORS,
  DEFAULT_LINEAR_SYMBOL_BAR_WIDTH,
  type DensityConfig,
  FillMode,
  MissingDataShape,
  ProportionalType,
  ShapeType,
  SizeMode,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode,
  ThicknessMode,
  VISUALIZATION_DEFAULTS,
  DEFAULT_DISCRETIZATION_CLASS_COUNT,
  availableShapesForSymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import { deepClone } from '../utils/clone.utils';
import { generateUniqueNameWithCounter } from '../utils/naming.utils';
import { sanitizeTextInput } from '../utils/sanitize.utils';
import { datasetsStore } from './datasets.store.svelte';
import { findById, updateById } from '../utils/array-helpers';
import {
  DEFAULT_STROKE_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_STYLE_OPACITY,
  DEFAULT_STROKE_WIDTH
} from '../constants/colors.constants';
import { DEFAULT_CATEGORICAL_COLORS as FIGMA_DEFAULT_CATEGORICAL_COLORS } from '../constants/qualitative-palette.constants';
import {
  COLUMN_TYPE_GEOMETRY,
  GEO_COLUMN_TYPE
} from '../constants/data.constants';
import { GEOJSON_TYPE } from '../constants/geojson.constants';
import {
  findPreferredNumericColumn,
  findPreferredTextColumn
} from '../utils/visualization-columns.utils';
import {
  clampFontSize,
  CARTOGRAPHIC_FONT_FAMILY,
  normalizeFontFamily
} from '$lib/features/step-toolbar/fonts.constants';
import * as m from '$lib/paraglide/messages';

export enum VisualizationType {
  CHOROPLETH = 'choropleth',
  PROPORTIONAL = 'proportional',
  CATEGORICAL = 'categorical',
  BIVARIATE = 'bivariate'
}

export enum ClassificationMethod {
  EQUAL_INTERVAL = 'equal_interval',
  QUANTILES = 'quantiles',
  KMEANS = 'kmeans',
  MANUAL = 'manual',
  Q6 = 'q6',
  NESTED_MEANS = 'nested_means',
  HEAD_TAIL = 'head_tail'
}

export enum ScaleType {
  LINEAR = 'linear',
  SQRT = 'sqrt',
  LOG = 'log'
}

export enum PrimitiveFilterType {
  POINT = 'point',
  LINE = 'line',
  POLYGON = 'polygon',
  TEXT = 'text'
}

export interface VisualizationModes {
  symbol?: SymbolMode;
  fill?: FillMode;
  stroke?: StrokeMode;
  thickness?: ThicknessMode;
  color?: ColorMode;
  size?: SizeMode;
  proportionalType?: ProportionalType;
  categoryShape?: CategoryShapeMode;
  strokeShowMissing?: boolean;
}

export interface PatternParams {
  angle?: 0 | 45 | 315;
  size?: number;
  scale?: number;
}

export interface ClassificationConfig {
  method: ClassificationMethod;
  classes: number;
  numClasses?: number;
  breaks?: number[];
  counts?: number[];
  colors?: string[];
  paletteId?: string;
  inverted?: boolean;
  labels?: string[];
  categoryValues?: string[];
  disabledLabels?: string[];
  breakpointValue?: number | null;
  breakpointLowerClassCount?: number;
  patternId?: string;
  patternParams?: PatternParams;
  categoryShapes?: ShapeType[];
  categorySizes?: number[];
  categoryStrokeColors?: string[];
  categoryStrokeWidths?: number[];
}

export interface MissingDataConfig {
  show: boolean;
  enabled?: boolean;
  shape: MissingDataShape;
  size: number;
  color: string;
  opacity?: number;
  pattern?: boolean;
  dashed?: boolean;
  dashedPattern?: BasemapDottedPattern;
  label?: string;
}

export interface PolygonPrimitiveConfig {
  enabled: boolean;
  fillMode: FillMode;
  fillColor?: string | string[];
  fillOpacity: number;
  strokeMode: StrokeMode;
  strokeColor?: string | string[];
  strokeWidth: number;
  strokeOpacity: number;
  strokeDashed: boolean;
  strokeDashedPattern?: BasemapDottedPattern;
  strokeValueColumn?: string;
  strokeCategoryColumn?: string;
  valueColumn?: string;
  categoryColumn?: string;
  classification?: ClassificationConfig;
  strokeClassification?: ClassificationConfig;
  missingData?: MissingDataConfig;
}

export interface SymbolModeState {
  size?: number;
  minSize?: number;
  maxSize?: number;
  barWidth?: number;
  sizeScale?: ScaleType;
  valueColumn?: string;
  categoryColumn?: string;
  sizeColumn?: string;
  classification?: ClassificationConfig;
  fillValueColumn?: string;
  fillCategoryColumn?: string;
  fillClassification?: ClassificationConfig;
  categoryShape?: CategoryShapeMode;
  proportionalType?: ProportionalType;
  commonScale?: boolean;
  positionMode?: SymbolDoublePosition;
  breakValueA?: number | null;
  breakValueB?: number | null;
  fillMode?: FillMode;
  strokeMode?: StrokeMode;
  strokeColor?: string | string[];
  strokeWidth?: number;
  strokeOpacity?: number;
  strokeDashed?: boolean;
  strokeDashedPattern?: BasemapDottedPattern;
  strokeClassification?: ClassificationConfig;
  strokeValueColumn?: string;
  strokeCategoryColumn?: string;
}

export interface LineColorModeState {
  color?: string | string[];
  valueColumn?: string;
  categoryColumn?: string;
  classification?: ClassificationConfig;
}

export interface LineThicknessModeState {
  width?: number;
  maxWidth?: number;
  valueColumn?: string;
  sizeColumn?: string;
  thicknessClassification?: ClassificationConfig;
}

export interface TextColorModeState {
  color?: string | string[];
  valueColumn?: string;
  categoryColumn?: string;
  classification?: ClassificationConfig;
}

export interface TextSizeModeState {
  size?: number;
  valueColumn?: string;
  classification?: ClassificationConfig;
}

export interface SymbolPrimitiveConfig {
  enabled: boolean;
  mode: SymbolMode;
  shape: ShapeType;
  size: number;
  minSize: number;
  maxSize: number;
  barWidth?: number;
  sizeScale: ScaleType;
  opacity: number;
  fillMode: FillMode;
  fillColor?: string | string[];
  fillColorB?: string;
  strokeMode: StrokeMode;
  strokeColor?: string | string[];
  strokeWidth: number;
  strokeOpacity: number;
  strokeDashed: boolean;
  strokeDashedPattern?: BasemapDottedPattern;
  strokeValueColumn?: string;
  strokeCategoryColumn?: string;
  strokeClassification?: ClassificationConfig;
  proportionalType: ProportionalType;
  categoryShape: CategoryShapeMode;
  commonScale?: boolean;
  positionMode?: SymbolDoublePosition;
  breakValueA?: number | null;
  breakValueB?: number | null;
  valueColumn?: string;
  categoryColumn?: string;
  sizeColumn?: string;
  classification?: ClassificationConfig;
  fillValueColumn?: string;
  fillCategoryColumn?: string;
  fillClassification?: ClassificationConfig;
  missingData?: MissingDataConfig;
  modeStates?: Partial<Record<SymbolMode, SymbolModeState>>;
}

export interface LinePrimitiveConfig {
  enabled: boolean;
  colorMode: ColorMode;
  thicknessMode: ThicknessMode;
  color?: string | string[];
  width: number;
  maxWidth: number;
  opacity: number;
  dashed: boolean;
  dashedPattern?: BasemapDottedPattern;
  valueColumn?: string;
  categoryColumn?: string;
  sizeColumn?: string;
  classification?: ClassificationConfig;
  thicknessClassification?: ClassificationConfig;
  missingData?: MissingDataConfig;
  colorModeStates?: Partial<Record<ColorMode, LineColorModeState>>;
  thicknessModeStates?: Partial<Record<ThicknessMode, LineThicknessModeState>>;
}

export interface TextSecondaryLabelsConfig {
  enabled: boolean;
  labelColumn?: string;
  fontFamily: string;
  color?: string | string[];
  opacity: number;
  size: number;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  halo: boolean;
  haloColor?: string;
  haloWidth: number;
  collisionDetection: boolean;
  dxpMasking: boolean;
}

export interface TextBackgroundConfig {
  fillMode: FillMode;
  fillColor?: string | string[];
  fillOpacity: number;
  strokeMode: StrokeMode;
  strokeColor?: string | string[];
  strokeWidth: number;
  strokeOpacity: number;
  strokeDashed: boolean;
  strokeDashedPattern?: BasemapDottedPattern;
  strokeValueColumn?: string;
  strokeCategoryColumn?: string;
  valueColumn?: string;
  categoryColumn?: string;
  classification?: ClassificationConfig;
  strokeClassification?: ClassificationConfig;
}

export interface TextPrimitiveConfig {
  enabled: boolean;
  labelColumn?: string;
  colorMode: ColorMode;
  sizeMode: SizeMode;
  fontFamily: string;
  color?: string | string[];
  opacity: number;
  size: number;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  halo: boolean;
  haloColor?: string;
  haloWidth: number;
  collisionDetection: boolean;
  dxpMasking: boolean;
  valueColumn?: string;
  categoryColumn?: string;
  classification?: ClassificationConfig;
  missingData?: MissingDataConfig;
  secondaryLabels: TextSecondaryLabelsConfig;
  background: TextBackgroundConfig;
  colorModeStates?: Partial<Record<ColorMode, TextColorModeState>>;
  sizeModeStates?: Partial<Record<SizeMode, TextSizeModeState>>;
}

export type PrimitiveFilter =
  | PrimitiveFilterType.POINT
  | PrimitiveFilterType.LINE
  | PrimitiveFilterType.POLYGON
  | PrimitiveFilterType.TEXT;

export type VisualizationOriginMode =
  | 'auto-suggestion'
  | 'manual-suggestion'
  | 'manual-blank'
  | 'custom'
  | 'legacy';

export interface VisualizationRestoreSnapshot {
  type: VisualizationType;
  modes?: VisualizationModes;
  primitiveFilters?: PrimitiveFilter[];
  primitiveOrder?: PrimitiveFilter[];
  polygon?: PolygonPrimitiveConfig;
  symbol?: SymbolPrimitiveConfig;
  line?: LinePrimitiveConfig;
  text?: TextPrimitiveConfig;
  style: VisualizationConfig['style'];
  mapping: VisualizationConfig['mapping'];
  classification?: ClassificationConfig;
  symbols?: VisualizationConfig['symbols'];
  missingData?: MissingDataConfig;
  density?: DensityConfig;
  dataFilters?: VizDataFilter[];
}

export interface VisualizationRestoreState {
  origin: {
    mode: VisualizationOriginMode;
    suggestionKey?: string;
  };
  visualization: VisualizationRestoreSnapshot;
}

export interface VisualizationAppliedSuggestionState {
  suggestionKey: string;
  visualization: VisualizationRestoreSnapshot;
}

export interface VisualizationOrigin {
  mode: VisualizationOriginMode;
  suggestionKey?: string;
  restoreState?: VisualizationRestoreState;
  appliedSuggestionState?: VisualizationAppliedSuggestionState;
}

export const ALL_PRIMITIVE_FILTERS: PrimitiveFilter[] = [
  PrimitiveFilterType.TEXT,
  PrimitiveFilterType.POINT,
  PrimitiveFilterType.LINE,
  PrimitiveFilterType.POLYGON
];

export type VizFilterOperator =
  | 'gte'
  | 'lte'
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'between'
  | 'top_asc'
  | 'top_desc'
  | 'empty'
  | 'not_empty';

export interface VizDataFilter {
  id: string;
  column: string;
  operator: VizFilterOperator;
  value: string;
  secondaryValue?: string;
  limit?: number;
  primitiveType?: PrimitiveFilter;
}

export interface VisualizationConfig {
  id: string;
  name: string;
  type: VisualizationType;
  datasetId: string;
  enabled: boolean;
  origin?: VisualizationOrigin;
  facet?: {
    baseVisualizationId: string;
  };
  polygon?: PolygonPrimitiveConfig;
  symbol?: SymbolPrimitiveConfig;
  line?: LinePrimitiveConfig;
  text?: TextPrimitiveConfig;
  modes?: VisualizationModes;
  primitiveFilters?: PrimitiveFilter[];
  primitiveOrder?: PrimitiveFilter[];
  style: {
    fillColor?: string | string[];
    fillColorB?: string;
    symbolFillColor?: string | string[];
    fillOpacity?: number;
    strokeColor?: string;
    strokeWidth?: number;
    strokeOpacity?: number;
    strokeDashed?: boolean;
    strokeDashedPattern?: BasemapDottedPattern;
    lineWidth?: number;
    lineMaxWidth?: number;
    lineColor?: string | string[];
    lineOpacity?: number;
    lineDashed?: boolean;
    lineDashedPattern?: BasemapDottedPattern;
    textColor?: string | string[];
    textOpacity?: number;
    textFontFamily?: string;
    textSize?: number;
    textBold?: boolean;
    textItalic?: boolean;
    textAlign?: 'left' | 'center' | 'right';
    textHalo?: boolean;
    textHaloColor?: string;
    textHaloWidth?: number;
    textCollisionDetection?: boolean;
    textDxpMasking?: boolean;
    labelColor?: string | string[];
    labelOpacity?: number;
    labelFontFamily?: string;
    labelSize?: number;
    labelBold?: boolean;
    labelItalic?: boolean;
    labelAlign?: 'left' | 'center' | 'right';
    labelHalo?: boolean;
    labelHaloColor?: string;
    labelHaloWidth?: number;
    labelCollisionDetection?: boolean;
    labelDxpMasking?: boolean;
  };
  mapping: {
    valueColumn?: string;
    categoryColumn?: string;
    sizeColumn?: string;
    colorColumn?: string;
    geometryColumn?: string;
    labelColumn?: string;
    secondaryLabelColumn?: string;
  };
  classification?: ClassificationConfig;
  symbolClassification?: ClassificationConfig;
  lineClassification?: ClassificationConfig;
  lineThicknessClassification?: ClassificationConfig;
  textClassification?: ClassificationConfig;
  symbols?: {
    type: ShapeType;
    size?: number;
    minSize: number;
    maxSize: number;
    barWidth?: number;
    sizeScale: ScaleType;
    opacity?: number;
  };
  missingData?: MissingDataConfig;
  density?: DensityConfig;
  dataFilters?: VizDataFilter[];
}

export type VisualizationPreset = Pick<
  VisualizationConfig,
  | 'type'
  | 'polygon'
  | 'symbol'
  | 'line'
  | 'text'
  | 'modes'
  | 'primitiveFilters'
  | 'style'
  | 'mapping'
  | 'classification'
  | 'symbols'
  | 'missingData'
>;

interface VisualizationState {
  visualizations: VisualizationConfig[];
  selectedVisualizationId?: string;
  activeVisualizationIds: Set<string>;
  version: number;
}

export function getVisualizationOriginMode(
  visualization?: Pick<VisualizationConfig, 'origin'> | null
): VisualizationOriginMode {
  return visualization?.origin?.mode ?? 'legacy';
}

export type PrimitiveConfigKind = 'polygon' | 'symbol' | 'line' | 'text';

type PrimitiveConfigMap = {
  polygon: PolygonPrimitiveConfig;
  symbol: SymbolPrimitiveConfig;
  line: LinePrimitiveConfig;
  text: TextPrimitiveConfig;
};

function resolvePrimitiveKind(
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

function buildPolygonPrimitiveConfig(
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
      : {})
  };
}

function buildSymbolPrimitiveConfig(
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

function buildLinePrimitiveConfig(
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

function buildTextPrimitiveConfig(
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

interface SerializedVisualizationSettings {
  visualizations: VisualizationConfig[];
  selectedVisualizationId?: string;
  activeVisualizationIds: string[];
}

type VisualizationSymbols = NonNullable<VisualizationConfig['symbols']>;

export interface VisualizationStore {
  readonly version: number;
  readonly visualizations: VisualizationConfig[];
  readonly selectedVisualization: VisualizationConfig | undefined;
  readonly activeVisualizations: VisualizationConfig[];
  createVisualization: (
    type: VisualizationType,
    datasetId: string,
    name?: string
  ) => VisualizationConfig;
  updateModes: (id: string, modes: Partial<VisualizationModes>) => void;
  togglePrimitiveFilter: (id: string, primitive: PrimitiveFilter) => void;
  setPrimitiveFilterOrder: (id: string, order: PrimitiveFilter[]) => void;
  updateSymbols: (
    id: string,
    symbols: Partial<VisualizationConfig['symbols']>
  ) => void;
  updateMissingData: (
    id: string,
    missingData: Partial<MissingDataConfig>
  ) => void;
  updateClassification: (
    id: string,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
  updatePrimitiveClassification: (
    id: string,
    primitive: PrimitiveFilter,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
  updateLineThicknessClassification: (
    id: string,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ) => void;
  updatePrimitiveStrokeClassification: (
    id: string,
    primitive: PrimitiveFilter,
    classification: Partial<ClassificationConfig>
  ) => void;
  updateVisualization: (
    id: string,
    updates: Partial<VisualizationConfig>,
    priority?: SavePriorityType
  ) => void;
  renameVisualization: (id: string, name: string) => void;
  applyVisualizationPreset: (id: string, type: VisualizationType) => void;
  duplicateVisualization: (
    id: string,
    targetDatasetId?: string
  ) => VisualizationConfig | null;
  removeVisualization: (id: string) => void;
  createBulkVisualizations: (configs: VisualizationConfig[]) => void;
  removeBulkVisualizations: (ids: string[]) => void;
  setVisualizationOrder: (orderedIds: string[]) => void;
  toggleVisualization: (id: string) => void;
  selectVisualization: (id: string) => void;
  invertPalette: (id: string) => void;
  getVisualizationsByDataset: (datasetId: string) => VisualizationConfig[];
  getVisualizationsUsingColumn: (
    datasetId: string,
    columnName: string
  ) => VisualizationConfig[];
  renameDatasetColumnReferences: (
    datasetId: string,
    previousName: string,
    nextName: string
  ) => void;
  removeDatasetColumnReferences: (
    datasetId: string,
    columnName: string
  ) => void;
  addDataFilter: (id: string, filter: Omit<VizDataFilter, 'id'>) => void;
  removeDataFilter: (id: string, filterId: string) => void;
  updateDataFilter: (
    id: string,
    filterId: string,
    updates: Partial<Omit<VizDataFilter, 'id'>>
  ) => void;
  clearDataFilters: (id: string) => void;
  clearDataFiltersForPrimitive: (
    id: string,
    primitiveType: PrimitiveFilter
  ) => void;
  clear: () => void;
  restoreFromSerialized: (settings: SerializedVisualizationSettings) => void;
}

const getDefaultVisualizationName = () => m.default_visualization_name();
const getDatasetNotFoundError = () => m.dataset_not_found_error();

const DEFAULT_SYMBOL_SIZE = VISUALIZATION_DEFAULTS.symbolSize;
const DEFAULT_SYMBOL_MIN_SIZE = 5;
const DEFAULT_SYMBOL_MAX_SIZE = VISUALIZATION_DEFAULTS.symbolMaxSize;
const DEFAULT_SYMBOL_OPACITY = VISUALIZATION_DEFAULTS.symbolOpacity / 100;
const DEFAULT_LABEL_OPACITY = 0;
const DEFAULT_TEXT_OPACITY = 0;

const DEFAULT_MISSING_DATA_COLOR = '#c6c6c6';

const DEFAULT_CHOROPLETH_COLORS = ['#eff3ff', '#bdd7e7', '#6baed6', '#08519c'];

export const DEFAULT_CATEGORICAL_COLORS = [...FIGMA_DEFAULT_CATEGORICAL_COLORS];

const VISUALIZATION_MAPPING_KEYS = [
  'valueColumn',
  'categoryColumn',
  'sizeColumn',
  'colorColumn',
  'geometryColumn',
  'labelColumn',
  'secondaryLabelColumn'
] as const;

const CLASSIFICATION_DEPENDENT_MAPPING_KEYS = new Set([
  'valueColumn',
  'categoryColumn',
  'sizeColumn',
  'colorColumn'
]);

type VisualizationMappingKey = (typeof VISUALIZATION_MAPPING_KEYS)[number];

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

function incrementVersion(
  state: VisualizationState,
  priority: SavePriorityType = SavePriority.DEBOUNCED
): void {
  state.version++;
  persistenceRegistry.notifyChange('visualization', priority);
}

function getDefaultStyle(
  type: VisualizationType
): VisualizationConfig['style'] {
  const textOverlayDefaults: VisualizationConfig['style'] = {
    labelColor: DEFAULT_COLORS.text,
    labelOpacity: DEFAULT_LABEL_OPACITY,
    labelFontFamily: CARTOGRAPHIC_FONT_FAMILY,
    labelBold: false,
    labelItalic: false,
    labelCollisionDetection: true,
    textColor: DEFAULT_COLORS.text,
    textOpacity: DEFAULT_TEXT_OPACITY,
    textFontFamily: CARTOGRAPHIC_FONT_FAMILY,
    textCollisionDetection: true
  };

  switch (type) {
    case VisualizationType.CHOROPLETH:
      return {
        ...textOverlayDefaults,
        fillOpacity: DEFAULT_STYLE_OPACITY.FILL_HIGH,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeWidth: DEFAULT_STROKE_WIDTH.THIN,
        strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
      };

    case VisualizationType.PROPORTIONAL:
      return {
        ...textOverlayDefaults,
        symbolFillColor: DEFAULT_FILL_COLOR,
        fillOpacity: DEFAULT_STYLE_OPACITY.FILL_LOW,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeWidth: DEFAULT_STROKE_WIDTH.MEDIUM,
        strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
      };

    case VisualizationType.CATEGORICAL:
      return {
        ...textOverlayDefaults,
        fillOpacity: DEFAULT_STYLE_OPACITY.FILL_HIGH,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeWidth: DEFAULT_STROKE_WIDTH.THIN,
        strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
      };

    default:
      return {
        ...textOverlayDefaults,
        fillColor: DEFAULT_FILL_COLOR,
        fillOpacity: DEFAULT_STYLE_OPACITY.FILL,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeWidth: DEFAULT_STROKE_WIDTH.THIN,
        strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
      };
  }
}

function getDefaultMapping(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): VisualizationConfig['mapping'] {
  const geometryColumn = dataset.columns.find(
    (column) => column.type === COLUMN_TYPE_GEOMETRY
  );
  const firstNumericColumn = findPreferredNumericColumn(dataset.columns, {
    allowIdLikeFallback: true,
    excludeLikelyCoordinates: true
  });
  const secondNumericColumn = findPreferredNumericColumn(dataset.columns, {
    exclude: [firstNumericColumn],
    allowIdLikeFallback: true,
    excludeLikelyCoordinates: true
  });
  const firstTextColumn = findPreferredTextColumn(dataset.columns);

  const mapping: VisualizationConfig['mapping'] = {
    geometryColumn: geometryColumn?.name
  };

  switch (type) {
    case VisualizationType.CHOROPLETH:
      mapping.valueColumn = firstNumericColumn;
      break;

    case VisualizationType.PROPORTIONAL:
      mapping.sizeColumn = firstNumericColumn;
      break;

    case VisualizationType.CATEGORICAL:
      mapping.categoryColumn = firstTextColumn;
      break;

    case VisualizationType.BIVARIATE:
      mapping.sizeColumn = firstNumericColumn;
      mapping.valueColumn = secondNumericColumn;
      break;
  }

  return mapping;
}

function getDefaultClassification(
  type: VisualizationType
): ClassificationConfig | undefined {
  if (
    type === VisualizationType.CHOROPLETH ||
    type === VisualizationType.BIVARIATE
  ) {
    return {
      method: ClassificationMethod.KMEANS,
      classes: DEFAULT_DISCRETIZATION_CLASS_COUNT,
      colors: [...DEFAULT_CHOROPLETH_COLORS]
    };
  }

  if (type === VisualizationType.CATEGORICAL) {
    return {
      method: ClassificationMethod.MANUAL,
      classes: 0,
      colors: [...DEFAULT_CATEGORICAL_COLORS]
    };
  }

  return undefined;
}

function getDefaultModes(type: VisualizationType): VisualizationModes {
  switch (type) {
    case VisualizationType.PROPORTIONAL:
      return {
        symbol: SymbolMode.PROPORTIONAL,
        fill: FillMode.UNIQUE,
        stroke: StrokeMode.UNIQUE
      };
    case VisualizationType.CATEGORICAL:
      return {
        symbol: SymbolMode.CATEGORIES,
        fill: FillMode.CATEGORIES,
        stroke: StrokeMode.NONE
      };
    case VisualizationType.CHOROPLETH:
      return {
        symbol: SymbolMode.UNIQUE,
        fill: FillMode.CLASSES,
        stroke: StrokeMode.UNIQUE
      };
    case VisualizationType.BIVARIATE:
      return {
        symbol: SymbolMode.PROPORTIONAL,
        fill: FillMode.CLASSES,
        stroke: StrokeMode.NONE
      };
    default:
      return {
        symbol: SymbolMode.UNIQUE,
        fill: FillMode.UNIQUE,
        stroke: StrokeMode.NONE
      };
  }
}

export const SPARSE_POLYGON_THRESHOLD = 500;
export const SPARSE_SYMBOL_FLOOR_PX = 10;
export const DENSE_SYMBOL_FLOOR_PX = 6;
const SYMBOL_DENSITY_COEFFICIENT = 140;

export function resolveProportionalSymbolMaxSize(rowCount: number): number {
  const safeRowCount = Math.max(rowCount, 1);
  const floor =
    safeRowCount < SPARSE_POLYGON_THRESHOLD
      ? SPARSE_SYMBOL_FLOOR_PX
      : DENSE_SYMBOL_FLOOR_PX;
  return Math.max(
    floor,
    Math.min(
      VISUALIZATION_DEFAULTS.symbolMaxSize,
      Math.round(SYMBOL_DENSITY_COEFFICIENT / Math.sqrt(safeRowCount))
    )
  );
}

export function resolveProportionalSymbolMinSize(maxSize: number): number {
  return Math.max(1, Math.min(4, Math.round(maxSize / 4)));
}

function getDefaultSymbols(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): VisualizationSymbols {
  const geometryType =
    typeof dataset.geometry === 'string'
      ? dataset.geometry
      : dataset.geometry?.type;
  const isPolygonGeometry =
    geometryType?.toLowerCase().includes('polygon') ?? false;
  const rowCount = 'rowCount' in dataset ? (dataset.rowCount ?? 0) : 0;
  const densityAdjustedMaxSize =
    isPolygonGeometry &&
    (type === VisualizationType.PROPORTIONAL ||
      type === VisualizationType.BIVARIATE)
      ? resolveProportionalSymbolMaxSize(rowCount)
      : DEFAULT_SYMBOL_MAX_SIZE;
  const minSize = isPolygonGeometry
    ? resolveProportionalSymbolMinSize(densityAdjustedMaxSize)
    : DEFAULT_SYMBOL_MIN_SIZE;

  return {
    type: ShapeType.CIRCLE,
    size: DEFAULT_SYMBOL_SIZE,
    minSize,
    maxSize: densityAdjustedMaxSize,
    barWidth: DEFAULT_LINEAR_SYMBOL_BAR_WIDTH,
    sizeScale:
      type === VisualizationType.PROPORTIONAL
        ? ScaleType.SQRT
        : ScaleType.LINEAR,
    opacity: DEFAULT_SYMBOL_OPACITY
  };
}

function resolveGeometryFamilyFromDataset(
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

function resolveDefaultPrimitiveFilters(
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

function withPrimitiveConfigs(
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

function normalizeVisualizationConfig(
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

function getNormalizedVisualization(
  visualization: VisualizationConfig
): VisualizationConfig {
  const dataset = findById(datasetsStore.datasets, visualization.datasetId);

  if (!dataset) {
    return visualization;
  }

  return normalizeVisualizationConfig(visualization, dataset);
}

function getDefaultPrimitiveFilters(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): PrimitiveFilter[] {
  return resolveDefaultPrimitiveFilters(type, dataset);
}

const ORIGIN_TRACKED_UPDATE_KEYS = [
  'polygon',
  'symbol',
  'line',
  'text',
  'modes',
  'primitiveFilters',
  'style',
  'mapping',
  'classification',
  'symbolClassification',
  'lineClassification',
  'lineThicknessClassification',
  'textClassification',
  'symbols',
  'missingData',
  'dataFilters'
] as const;

const DERIVED_CLASSIFICATION_UPDATE_KEYS = new Set<keyof ClassificationConfig>([
  'breaks',
  'counts',
  'colors',
  'labels'
]);

function isDerivedClassificationUpdate(
  currentClassification: VisualizationConfig['classification'],
  classification: Partial<ClassificationConfig> | undefined
): boolean {
  if (!classification) {
    return false;
  }

  const updateKeys = (
    Object.keys(classification) as Array<keyof ClassificationConfig>
  ).filter((key) => {
    const currentValue = currentClassification?.[key];
    const nextValue = classification[key];

    return JSON.stringify(currentValue ?? null) !== JSON.stringify(nextValue);
  });

  return (
    updateKeys.length > 0 &&
    updateKeys.every((key) => DERIVED_CLASSIFICATION_UPDATE_KEYS.has(key))
  );
}

const CLASSIFICATION_LIKE_UPDATE_KEYS = new Set<
  keyof Pick<
    VisualizationConfig,
    | 'classification'
    | 'symbolClassification'
    | 'lineClassification'
    | 'lineThicknessClassification'
    | 'textClassification'
  >
>([
  'classification',
  'symbolClassification',
  'lineClassification',
  'lineThicknessClassification',
  'textClassification'
]);

function isClassificationLikeUpdateKey(
  key: (typeof ORIGIN_TRACKED_UPDATE_KEYS)[number]
): key is
  | 'classification'
  | 'symbolClassification'
  | 'lineClassification'
  | 'lineThicknessClassification'
  | 'textClassification' {
  return CLASSIFICATION_LIKE_UPDATE_KEYS.has(
    key as
      | 'classification'
      | 'symbolClassification'
      | 'lineClassification'
      | 'lineThicknessClassification'
      | 'textClassification'
  );
}

function isPrimitiveConfigUpdateKey(
  key: (typeof ORIGIN_TRACKED_UPDATE_KEYS)[number]
): key is PrimitiveConfigKind {
  return (
    key === 'polygon' || key === 'symbol' || key === 'line' || key === 'text'
  );
}

function isDerivedPrimitiveClassificationUpdate(
  currentPrimitive: PrimitiveConfigMap[PrimitiveConfigKind] | undefined,
  nextPrimitive: PrimitiveConfigMap[PrimitiveConfigKind] | undefined
): boolean {
  if (!currentPrimitive || !nextPrimitive) {
    return false;
  }

  const updateKeys = Object.keys(nextPrimitive).filter((key) => {
    const typedKey = key as keyof typeof nextPrimitive;
    return (
      JSON.stringify(currentPrimitive[typedKey] ?? null) !==
      JSON.stringify(nextPrimitive[typedKey] ?? null)
    );
  });

  if (updateKeys.length !== 1) {
    return false;
  }

  const [onlyKey] = updateKeys;
  if (
    onlyKey === 'classification' &&
    isDerivedClassificationUpdate(
      currentPrimitive.classification,
      nextPrimitive.classification
    )
  ) {
    return true;
  }

  return (
    onlyKey === 'thicknessClassification' &&
    'thicknessClassification' in currentPrimitive &&
    'thicknessClassification' in nextPrimitive &&
    isDerivedClassificationUpdate(
      currentPrimitive.thicknessClassification,
      nextPrimitive.thicknessClassification
    )
  );
}

function touchesVisualizationSemantics(
  visualization: VisualizationConfig,
  updates: Partial<VisualizationConfig>
): boolean {
  return ORIGIN_TRACKED_UPDATE_KEYS.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(updates, key)) {
      return false;
    }

    if (isClassificationLikeUpdateKey(key)) {
      const currentClassification =
        key === 'classification'
          ? visualization.classification
          : key === 'symbolClassification'
            ? visualization.symbolClassification
            : key === 'lineClassification'
              ? visualization.lineClassification
              : key === 'lineThicknessClassification'
                ? visualization.lineThicknessClassification
                : visualization.textClassification;

      const nextClassification = updates[key] as
        | Partial<ClassificationConfig>
        | undefined;

      if (
        isDerivedClassificationUpdate(currentClassification, nextClassification)
      ) {
        return false;
      }
    }

    if (isPrimitiveConfigUpdateKey(key)) {
      const currentPrimitive = visualization[key];
      const nextPrimitive = updates[key] as
        | PrimitiveConfigMap[PrimitiveConfigKind]
        | undefined;

      if (
        isDerivedPrimitiveClassificationUpdate(currentPrimitive, nextPrimitive)
      ) {
        return false;
      }
    }

    return true;
  });
}

function resolveNextVisualizationOrigin(
  visualization: VisualizationConfig,
  updates: Partial<VisualizationConfig>
): VisualizationConfig['origin'] {
  if (Object.prototype.hasOwnProperty.call(updates, 'origin')) {
    return updates.origin;
  }

  const currentMode = getVisualizationOriginMode(visualization);
  if (
    currentMode !== 'auto-suggestion' &&
    currentMode !== 'manual-suggestion'
  ) {
    return visualization.origin;
  }

  if (!touchesVisualizationSemantics(visualization, updates)) {
    return visualization.origin;
  }

  return {
    mode: 'custom',
    ...(visualization.origin?.suggestionKey
      ? { suggestionKey: visualization.origin.suggestionKey }
      : {}),
    ...(visualization.origin?.restoreState
      ? { restoreState: deepClone(visualization.origin.restoreState) }
      : {}),
    ...(visualization.origin?.appliedSuggestionState
      ? {
          appliedSuggestionState: deepClone(
            visualization.origin.appliedSuggestionState
          )
        }
      : {})
  };
}

function resolveDuplicatedVisualizationOrigin(
  origin: VisualizationConfig['origin']
): VisualizationConfig['origin'] {
  if (!origin) {
    return undefined;
  }

  if (
    origin.mode === 'auto-suggestion' ||
    origin.mode === 'manual-suggestion'
  ) {
    return {
      mode: 'custom',
      ...(origin.suggestionKey ? { suggestionKey: origin.suggestionKey } : {})
    };
  }

  return {
    mode: origin.mode,
    ...(origin.suggestionKey ? { suggestionKey: origin.suggestionKey } : {})
  };
}

function buildVisualizationPreset(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): VisualizationPreset {
  const preset: VisualizationPreset = {
    type,
    modes: getDefaultModes(type),
    primitiveFilters: getDefaultPrimitiveFilters(type, dataset),
    style: getDefaultStyle(type),
    mapping: getDefaultMapping(type, dataset),
    classification: getDefaultClassification(type),
    symbols: getDefaultSymbols(type, dataset),
    missingData: getDefaultMissingData()
  };

  const normalizedPreset = withPrimitiveConfigs({
    id: '__preset__',
    name: '__preset__',
    datasetId: dataset.id,
    enabled: true,
    ...preset
  } as VisualizationConfig);

  return {
    ...preset,
    polygon: normalizedPreset.polygon,
    symbol: normalizedPreset.symbol,
    line: normalizedPreset.line,
    text: normalizedPreset.text
  };
}

export function resolveVisualizationPreset(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): VisualizationPreset {
  return buildVisualizationPreset(type, dataset);
}

function getDefaultMissingData(): MissingDataConfig {
  return {
    show: true,
    shape: MissingDataShape.CIRCLE,
    size: 2,
    color: DEFAULT_MISSING_DATA_COLOR,
    pattern: false,
    dashed: false,
    dashedPattern: BasemapDottedPattern.DOTS
  };
}

function createVisualizationStore(): VisualizationStore {
  const state = $state<VisualizationState>({
    visualizations: [],
    activeVisualizationIds: new Set<string>(),
    version: 0
  });

  function updateActiveVisualizationIds(
    updater: (ids: Set<string>) => Set<string>
  ): void {
    state.activeVisualizationIds = updater(
      new Set(state.activeVisualizationIds)
    );
  }

  function getVisualizationById(id: string): VisualizationConfig | undefined {
    return findById(state.visualizations, id);
  }

  function applyVisualizationUpdate(
    id: string,
    resolveUpdates: (
      visualization: VisualizationConfig
    ) => Partial<VisualizationConfig> | null,
    priority: SavePriorityType = SavePriority.DEBOUNCED
  ): void {
    const visualization = getVisualizationById(id);
    if (!visualization) {
      return;
    }

    const updates = resolveUpdates(visualization);
    if (!updates) {
      return;
    }

    const nextOrigin = resolveNextVisualizationOrigin(visualization, updates);

    const nextVisualization = getNormalizedVisualization({
      ...visualization,
      ...updates,
      origin: nextOrigin,
      id
    });

    state.visualizations = updateById(
      state.visualizations,
      id,
      nextVisualization
    );
    incrementVersion(state, priority);
  }

  function createVisualization(
    type: VisualizationType,
    datasetId: string,
    name?: string
  ): VisualizationConfig {
    const dataset = findById(datasetsStore.datasets, datasetId);
    if (!dataset) {
      throw new Error(getDatasetNotFoundError());
    }

    const visualization = getNormalizedVisualization({
      id: crypto.randomUUID(),
      name:
        name ||
        generateUniqueNameWithCounter(
          getDefaultVisualizationName(),
          state.visualizations.map((item) => item.name)
        ),
      datasetId,
      enabled: true,
      ...buildVisualizationPreset(type, dataset)
    });

    state.visualizations.push(visualization);
    state.selectedVisualizationId = visualization.id;
    updateActiveVisualizationIds((ids) => ids.add(visualization.id));
    incrementVersion(state, SavePriority.IMMEDIATE);

    return visualization;
  }

  function updateModes(id: string, modes: Partial<VisualizationModes>): void {
    applyVisualizationUpdate(id, (visualization) => ({
      modes: { ...visualization.modes, ...modes } as VisualizationModes
    }));
  }

  function togglePrimitiveFilter(id: string, primitive: PrimitiveFilter): void {
    applyVisualizationUpdate(id, (visualization) => {
      const currentFilters =
        visualization.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
      const willBeEnabled = !currentFilters.includes(primitive);
      const nextFilters = willBeEnabled
        ? [...currentFilters, primitive]
        : currentFilters.filter((item) => item !== primitive);

      const update: Partial<VisualizationConfig> = {
        primitiveFilters: nextFilters
      };

      switch (primitive) {
        case PrimitiveFilterType.POINT: {
          const symbol = buildSymbolPrimitiveConfig(visualization);
          update.symbol = {
            ...symbol,
            enabled: willBeEnabled,
            opacity:
              willBeEnabled && (symbol.opacity ?? 0) <= 0
                ? VISUALIZATION_DEFAULTS.symbolOpacity / 100
                : symbol.opacity
          };
          break;
        }
        case PrimitiveFilterType.LINE: {
          const line = buildLinePrimitiveConfig(visualization);
          update.line = {
            ...line,
            enabled: willBeEnabled,
            opacity:
              willBeEnabled && (line.opacity ?? 0) <= 0
                ? VISUALIZATION_DEFAULTS.lineOpacity / 100
                : line.opacity
          };
          break;
        }
        case PrimitiveFilterType.POLYGON: {
          const polygon = buildPolygonPrimitiveConfig(visualization);
          update.polygon = {
            ...polygon,
            enabled: willBeEnabled,
            fillOpacity:
              willBeEnabled &&
              polygon.fillMode !== FillMode.NONE &&
              (polygon.fillOpacity ?? 0) <= 0
                ? VISUALIZATION_DEFAULTS.fillOpacity / 100
                : polygon.fillOpacity
          };
          break;
        }
        case PrimitiveFilterType.TEXT: {
          const text = buildTextPrimitiveConfig(visualization);
          update.text = {
            ...text,
            enabled: willBeEnabled,
            opacity:
              willBeEnabled && (text.opacity ?? 0) <= 0
                ? VISUALIZATION_DEFAULTS.textOpacity / 100
                : text.opacity
          };
          break;
        }
      }

      return update;
    });
  }

  function setPrimitiveFilterOrder(id: string, order: PrimitiveFilter[]): void {
    applyVisualizationUpdate(id, () => ({
      primitiveOrder: order
    }));
  }

  function updateSymbols(
    id: string,
    symbolUpdates: Partial<VisualizationConfig['symbols']>
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      if (!visualization.symbols) {
        return null;
      }

      return {
        symbols: {
          ...visualization.symbols,
          ...(symbolUpdates as Partial<VisualizationSymbols>)
        },
        symbol: {
          ...buildSymbolPrimitiveConfig(visualization),
          ...(symbolUpdates?.type ? { shape: symbolUpdates.type } : {}),
          ...(symbolUpdates?.size !== undefined
            ? { size: symbolUpdates.size }
            : {}),
          ...(symbolUpdates?.minSize !== undefined
            ? { minSize: symbolUpdates.minSize }
            : {}),
          ...(symbolUpdates?.maxSize !== undefined
            ? { maxSize: symbolUpdates.maxSize }
            : {}),
          ...(symbolUpdates?.barWidth !== undefined
            ? { barWidth: symbolUpdates.barWidth }
            : {}),
          ...(symbolUpdates?.sizeScale !== undefined
            ? { sizeScale: symbolUpdates.sizeScale }
            : {}),
          ...(symbolUpdates?.opacity !== undefined
            ? { opacity: symbolUpdates.opacity }
            : {})
        }
      };
    });
  }

  function updateMissingData(
    id: string,
    missingData: Partial<MissingDataConfig>
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      if (!visualization.missingData) {
        return null;
      }

      return {
        missingData: { ...visualization.missingData, ...missingData },
        polygon: {
          ...buildPolygonPrimitiveConfig(visualization),
          missingData: {
            ...buildPolygonPrimitiveConfig(visualization).missingData,
            ...missingData
          } as MissingDataConfig
        },
        symbol: {
          ...buildSymbolPrimitiveConfig(visualization),
          missingData: {
            ...buildSymbolPrimitiveConfig(visualization).missingData,
            ...missingData
          } as MissingDataConfig
        },
        line: {
          ...buildLinePrimitiveConfig(visualization),
          missingData: {
            ...buildLinePrimitiveConfig(visualization).missingData,
            ...missingData
          } as MissingDataConfig
        },
        text: {
          ...buildTextPrimitiveConfig(visualization),
          missingData: {
            ...buildTextPrimitiveConfig(visualization).missingData,
            ...missingData
          } as MissingDataConfig
        }
      };
    });
  }

  function updateClassification(
    id: string,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      const existing = visualization.classification ?? {
        method: ClassificationMethod.KMEANS,
        classes: DEFAULT_DISCRETIZATION_CLASS_COUNT
      };

      return {
        ...(options?.preserveOrigin
          ? { origin: deepClone(visualization.origin) }
          : {}),
        classification: { ...existing, ...classification },
        polygon: {
          ...buildPolygonPrimitiveConfig(visualization),
          classification: {
            ...buildPolygonPrimitiveConfig(visualization).classification,
            ...classification
          } as ClassificationConfig
        }
      };
    });
  }

  function updatePrimitiveClassification(
    id: string,
    primitive: PrimitiveFilter,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ): void {
    const targetKey = (
      {
        [PrimitiveFilterType.POINT]: 'symbolClassification',
        [PrimitiveFilterType.LINE]: 'lineClassification',
        [PrimitiveFilterType.TEXT]: 'textClassification',
        [PrimitiveFilterType.POLYGON]: 'classification'
      } as const
    )[primitive];

    applyVisualizationUpdate(id, (visualization) => {
      const fallback = visualization.classification ?? {
        method: ClassificationMethod.KMEANS,
        classes: DEFAULT_DISCRETIZATION_CLASS_COUNT
      };
      const existing =
        (visualization[targetKey] as ClassificationConfig | undefined) ??
        fallback;
      const primitiveConfig = getPrimitive(
        visualization,
        primitive
      ) as PrimitiveConfigMap[PrimitiveConfigKind];
      const primitiveKind = resolvePrimitiveKind(primitive);

      return {
        ...(options?.preserveOrigin
          ? { origin: deepClone(visualization.origin) }
          : {}),
        [targetKey]: { ...existing, ...classification },
        [primitiveKind]: {
          ...primitiveConfig,
          classification: {
            ...primitiveConfig.classification,
            ...classification
          } as ClassificationConfig
        }
      } as Partial<VisualizationConfig>;
    });
  }

  function updateLineThicknessClassification(
    id: string,
    classification: Partial<ClassificationConfig>,
    options?: { preserveOrigin?: boolean }
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      const line = buildLinePrimitiveConfig(visualization);
      const existing = visualization.lineThicknessClassification ??
        line.thicknessClassification ??
        line.classification ??
        visualization.lineClassification ??
        visualization.classification ?? {
          method: ClassificationMethod.KMEANS,
          classes: DEFAULT_DISCRETIZATION_CLASS_COUNT
        };

      return {
        ...(options?.preserveOrigin
          ? { origin: deepClone(visualization.origin) }
          : {}),
        lineThicknessClassification: { ...existing, ...classification },
        line: {
          ...line,
          thicknessClassification: {
            ...line.thicknessClassification,
            ...classification
          } as ClassificationConfig
        }
      } as Partial<VisualizationConfig>;
    });
  }

  function updatePrimitiveStrokeClassification(
    id: string,
    primitive: PrimitiveFilter,
    classification: Partial<ClassificationConfig>
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      const primitiveConfig = getPrimitive(
        visualization,
        primitive
      ) as PrimitiveConfigMap[PrimitiveConfigKind];
      const primitiveKind = resolvePrimitiveKind(primitive);
      const existing =
        (
          primitiveConfig as unknown as {
            strokeClassification?: ClassificationConfig;
          }
        ).strokeClassification ??
        ({
          method: ClassificationMethod.KMEANS,
          classes: DEFAULT_DISCRETIZATION_CLASS_COUNT
        } as ClassificationConfig);

      const merged = {
        ...existing,
        ...classification
      } as ClassificationConfig;

      const nextPrimitive = {
        ...primitiveConfig,
        strokeClassification: merged
      };

      return {
        [primitiveKind]: nextPrimitive
      } as Partial<VisualizationConfig>;
    });
  }

  function updateVisualization(
    id: string,
    updates: Partial<VisualizationConfig>,
    priority?: SavePriorityType
  ): void {
    applyVisualizationUpdate(id, () => updates, priority);
  }

  function renameVisualization(id: string, name: string): void {
    applyVisualizationUpdate(
      id,
      (visualization) => {
        const sanitizedName = sanitizeTextInput(name);
        if (!sanitizedName || sanitizedName === visualization.name) {
          return null;
        }

        return { name: sanitizedName };
      },
      SavePriority.IMMEDIATE
    );
  }

  function applyVisualizationPreset(id: string, type: VisualizationType): void {
    applyVisualizationUpdate(id, (visualization) => {
      const dataset = findById(datasetsStore.datasets, visualization.datasetId);
      if (!dataset) {
        return null;
      }

      const preset = buildVisualizationPreset(type, dataset);

      return {
        ...preset,
        primitiveOrder: undefined,
        dataFilters: undefined
      };
    });
  }

  function duplicateVisualization(
    id: string,
    targetDatasetId?: string
  ): VisualizationConfig | null {
    const original = getVisualizationById(id);
    if (!original) {
      return null;
    }

    const duplicatedName = generateUniqueNameWithCounter(
      original.name,
      state.visualizations.map((item) => item.name)
    );

    const duplicatedVisualization = getNormalizedVisualization({
      ...deepClone(original),
      id: crypto.randomUUID(),
      name: duplicatedName,
      origin: resolveDuplicatedVisualizationOrigin(original.origin),
      ...(targetDatasetId ? { datasetId: targetDatasetId } : {})
    });

    state.visualizations.push(duplicatedVisualization);
    state.selectedVisualizationId = duplicatedVisualization.id;
    updateActiveVisualizationIds((ids) => ids.add(duplicatedVisualization.id));
    incrementVersion(state, SavePriority.IMMEDIATE);

    return duplicatedVisualization;
  }

  function removeVisualization(id: string): void {
    const remainingVisualizations = state.visualizations.filter(
      (visualization) => visualization.id !== id
    );

    updateActiveVisualizationIds((ids) => {
      ids.delete(id);
      return ids;
    });

    if (state.selectedVisualizationId === id) {
      state.selectedVisualizationId = remainingVisualizations[0]?.id;
    }

    state.visualizations = remainingVisualizations;
    incrementVersion(state, SavePriority.IMMEDIATE);
  }

  function createBulkVisualizations(configs: VisualizationConfig[]): void {
    if (configs.length === 0) {
      return;
    }

    configs.forEach((config) => {
      const normalizedConfig = getNormalizedVisualization(config);
      state.visualizations.push(normalizedConfig);
      updateActiveVisualizationIds((ids) => ids.add(normalizedConfig.id));
    });

    incrementVersion(state, SavePriority.IMMEDIATE);
  }

  function removeBulkVisualizations(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }

    const idsSet = new Set(ids);
    const remainingVisualizations = state.visualizations.filter(
      (visualization) => !idsSet.has(visualization.id)
    );

    updateActiveVisualizationIds((activeIds) => {
      ids.forEach((idToRemove) => {
        activeIds.delete(idToRemove);
      });
      return activeIds;
    });

    if (
      state.selectedVisualizationId &&
      idsSet.has(state.selectedVisualizationId)
    ) {
      state.selectedVisualizationId = remainingVisualizations[0]?.id;
    }

    state.visualizations = remainingVisualizations;
    incrementVersion(state, SavePriority.IMMEDIATE);
  }

  function setVisualizationOrder(orderedIds: string[]): void {
    if (orderedIds.length === 0) {
      return;
    }

    const orderedVisualizations: VisualizationConfig[] = [];
    const orderedIdsSet = new Set(orderedIds);

    orderedIds.forEach((id) => {
      const visualization = getVisualizationById(id);
      if (visualization) {
        orderedVisualizations.push(visualization);
      }
    });

    if (orderedVisualizations.length === 0) {
      return;
    }

    const remainingVisualizations = state.visualizations.filter(
      (visualization) => !orderedIdsSet.has(visualization.id)
    );

    state.visualizations = [
      ...orderedVisualizations,
      ...remainingVisualizations
    ];
    incrementVersion(state);
  }

  function toggleVisualization(id: string): void {
    updateActiveVisualizationIds((ids) => {
      if (ids.has(id)) {
        ids.delete(id);
      } else {
        ids.add(id);
      }
      return ids;
    });
    incrementVersion(state);
  }

  function selectVisualization(id: string): void {
    if (!getVisualizationById(id) || state.selectedVisualizationId === id) {
      return;
    }
    state.selectedVisualizationId = id;
    incrementVersion(state);
  }

  function invertPalette(id: string): void {
    applyVisualizationUpdate(id, (visualization) => {
      if (!visualization.classification?.colors) {
        return null;
      }

      const inverted = !(visualization.classification.inverted ?? false);

      return {
        classification: {
          ...visualization.classification,
          colors: [...visualization.classification.colors].reverse(),
          inverted
        }
      };
    });
  }

  function getVisualizationsByDataset(
    datasetId: string
  ): VisualizationConfig[] {
    return state.visualizations.filter(
      (visualization) => visualization.datasetId === datasetId
    );
  }

  function someLineModeStateUsesColumn(
    line: LinePrimitiveConfig | undefined,
    columnName: string
  ): boolean {
    if (!line || !columnName) {
      return false;
    }

    return (
      Object.values(line.colorModeStates ?? {}).some(
        (state) =>
          state?.valueColumn === columnName ||
          state?.categoryColumn === columnName
      ) ||
      Object.values(line.thicknessModeStates ?? {}).some(
        (state) =>
          state?.valueColumn === columnName || state?.sizeColumn === columnName
      )
    );
  }

  function renameLineModeStateColumns(
    line: LinePrimitiveConfig,
    renameColumn: (value?: string) => string | undefined
  ): void {
    if (line.colorModeStates) {
      line.colorModeStates = Object.fromEntries(
        Object.entries(line.colorModeStates).map(([mode, state]) => [
          mode,
          state
            ? {
                ...state,
                valueColumn: renameColumn(state.valueColumn),
                categoryColumn: renameColumn(state.categoryColumn)
              }
            : state
        ])
      ) as NonNullable<LinePrimitiveConfig['colorModeStates']>;
    }

    if (line.thicknessModeStates) {
      line.thicknessModeStates = Object.fromEntries(
        Object.entries(line.thicknessModeStates).map(([mode, state]) => [
          mode,
          state
            ? {
                ...state,
                valueColumn: renameColumn(state.valueColumn),
                sizeColumn: renameColumn(state.sizeColumn)
              }
            : state
        ])
      ) as NonNullable<LinePrimitiveConfig['thicknessModeStates']>;
    }
  }

  function removeLineModeStateColumns(
    line: LinePrimitiveConfig,
    columnName: string,
    clearColumn: (value?: string) => string | undefined
  ): void {
    if (line.colorModeStates) {
      line.colorModeStates = Object.fromEntries(
        Object.entries(line.colorModeStates).map(([mode, state]) => {
          if (!state) {
            return [mode, state];
          }

          const clearsClassification =
            state.valueColumn === columnName ||
            state.categoryColumn === columnName;

          return [
            mode,
            {
              ...state,
              valueColumn: clearColumn(state.valueColumn),
              categoryColumn: clearColumn(state.categoryColumn),
              ...(clearsClassification ? { classification: undefined } : {})
            }
          ];
        })
      ) as NonNullable<LinePrimitiveConfig['colorModeStates']>;
    }

    if (line.thicknessModeStates) {
      line.thicknessModeStates = Object.fromEntries(
        Object.entries(line.thicknessModeStates).map(([mode, state]) => {
          if (!state) {
            return [mode, state];
          }

          return [
            mode,
            {
              ...state,
              valueColumn: clearColumn(state.valueColumn),
              sizeColumn: clearColumn(state.sizeColumn),
              ...(state.valueColumn === columnName
                ? { thicknessClassification: undefined }
                : {})
            }
          ];
        })
      ) as NonNullable<LinePrimitiveConfig['thicknessModeStates']>;
    }
  }

  function getVisualizationsUsingColumn(
    datasetId: string,
    columnName: string
  ): VisualizationConfig[] {
    return state.visualizations.filter((visualization) => {
      if (visualization.datasetId !== datasetId) {
        return false;
      }

      const mapping = visualization.mapping;
      const polygon = buildPolygonPrimitiveConfig(visualization);
      const symbol = buildSymbolPrimitiveConfig(visualization);
      const line = buildLinePrimitiveConfig(visualization);
      const text = buildTextPrimitiveConfig(visualization);

      return (
        mapping.valueColumn === columnName ||
        mapping.categoryColumn === columnName ||
        mapping.sizeColumn === columnName ||
        mapping.colorColumn === columnName ||
        mapping.geometryColumn === columnName ||
        mapping.labelColumn === columnName ||
        mapping.secondaryLabelColumn === columnName ||
        polygon.valueColumn === columnName ||
        polygon.categoryColumn === columnName ||
        symbol.valueColumn === columnName ||
        symbol.categoryColumn === columnName ||
        symbol.sizeColumn === columnName ||
        symbol.fillValueColumn === columnName ||
        symbol.fillCategoryColumn === columnName ||
        line.valueColumn === columnName ||
        line.categoryColumn === columnName ||
        line.sizeColumn === columnName ||
        someLineModeStateUsesColumn(line, columnName) ||
        text.labelColumn === columnName ||
        text.valueColumn === columnName ||
        text.categoryColumn === columnName ||
        text.secondaryLabels.labelColumn === columnName ||
        (visualization.dataFilters ?? []).some(
          (filter) => filter.column === columnName
        )
      );
    });
  }

  function renameDatasetColumnReferences(
    datasetId: string,
    previousName: string,
    nextName: string
  ): void {
    if (!previousName || !nextName || previousName === nextName) {
      return;
    }

    let hasChanges = false;

    state.visualizations = state.visualizations.map((visualization) => {
      if (visualization.datasetId !== datasetId) {
        return visualization;
      }

      let mutated = false;
      const nextMapping = { ...visualization.mapping };
      const nextPolygon = buildPolygonPrimitiveConfig(visualization);
      const nextSymbol = buildSymbolPrimitiveConfig(visualization);
      const nextLine = buildLinePrimitiveConfig(visualization);
      const nextText = buildTextPrimitiveConfig(visualization);
      for (const key of VISUALIZATION_MAPPING_KEYS) {
        if (nextMapping[key as VisualizationMappingKey] === previousName) {
          nextMapping[key as VisualizationMappingKey] = nextName;
          mutated = true;
        }
      }

      const renameColumn = (value?: string): string | undefined => {
        if (value !== previousName) {
          return value;
        }
        mutated = true;
        return nextName;
      };

      nextPolygon.valueColumn = renameColumn(nextPolygon.valueColumn);
      nextPolygon.categoryColumn = renameColumn(nextPolygon.categoryColumn);
      nextSymbol.valueColumn = renameColumn(nextSymbol.valueColumn);
      nextSymbol.categoryColumn = renameColumn(nextSymbol.categoryColumn);
      nextSymbol.sizeColumn = renameColumn(nextSymbol.sizeColumn);
      nextSymbol.fillValueColumn = renameColumn(nextSymbol.fillValueColumn);
      nextSymbol.fillCategoryColumn = renameColumn(
        nextSymbol.fillCategoryColumn
      );
      nextLine.valueColumn = renameColumn(nextLine.valueColumn);
      nextLine.categoryColumn = renameColumn(nextLine.categoryColumn);
      nextLine.sizeColumn = renameColumn(nextLine.sizeColumn);
      renameLineModeStateColumns(nextLine, renameColumn);
      nextText.labelColumn = renameColumn(nextText.labelColumn);
      nextText.valueColumn = renameColumn(nextText.valueColumn);
      nextText.categoryColumn = renameColumn(nextText.categoryColumn);
      nextText.secondaryLabels = {
        ...nextText.secondaryLabels,
        labelColumn: renameColumn(nextText.secondaryLabels.labelColumn)
      };

      const previousDataFilters = visualization.dataFilters ?? [];
      const nextDataFilters = previousDataFilters.map((filter) =>
        filter.column === previousName
          ? { ...filter, column: nextName }
          : filter
      );
      if (
        nextDataFilters.some(
          (filter, index) => filter !== previousDataFilters[index]
        )
      ) {
        mutated = true;
      }

      if (!mutated) {
        return visualization;
      }

      hasChanges = true;
      return getNormalizedVisualization({
        ...visualization,
        polygon: nextPolygon,
        symbol: nextSymbol,
        line: nextLine,
        text: nextText,
        mapping: nextMapping,
        dataFilters: nextDataFilters
      });
    });

    if (hasChanges) {
      incrementVersion(state);
    }
  }

  function removeDatasetColumnReferences(
    datasetId: string,
    columnName: string
  ): void {
    if (!columnName) {
      return;
    }

    let hasChanges = false;

    state.visualizations = state.visualizations.map((visualization) => {
      if (visualization.datasetId !== datasetId) {
        return visualization;
      }

      let mutated = false;
      let shouldClearClassification = false;
      const nextMapping = { ...visualization.mapping };
      const nextPolygon = buildPolygonPrimitiveConfig(visualization);
      const nextSymbol = buildSymbolPrimitiveConfig(visualization);
      const nextLine = buildLinePrimitiveConfig(visualization);
      const nextText = buildTextPrimitiveConfig(visualization);
      for (const key of VISUALIZATION_MAPPING_KEYS) {
        if (nextMapping[key as VisualizationMappingKey] === columnName) {
          nextMapping[key as VisualizationMappingKey] = undefined;
          mutated = true;
          if (CLASSIFICATION_DEPENDENT_MAPPING_KEYS.has(key)) {
            shouldClearClassification = true;
          }
        }
      }

      const clearColumn = (value?: string): string | undefined => {
        if (value !== columnName) {
          return value;
        }
        mutated = true;
        return undefined;
      };

      const clearClassificationForColumn = (
        primitiveValue: string | undefined,
        primitiveCategory: string | undefined,
        primitiveSize?: string
      ): boolean =>
        primitiveValue === columnName ||
        primitiveCategory === columnName ||
        primitiveSize === columnName;

      const hadPolygonClassificationDependency = clearClassificationForColumn(
        nextPolygon.valueColumn,
        nextPolygon.categoryColumn
      );
      nextPolygon.valueColumn = clearColumn(nextPolygon.valueColumn);
      nextPolygon.categoryColumn = clearColumn(nextPolygon.categoryColumn);
      if (hadPolygonClassificationDependency) {
        nextPolygon.classification = undefined;
      }

      const hadSymbolClassificationDependency = clearClassificationForColumn(
        nextSymbol.valueColumn,
        nextSymbol.categoryColumn,
        nextSymbol.sizeColumn
      );
      const hadSymbolFillClassificationDependency =
        clearClassificationForColumn(
          nextSymbol.fillValueColumn,
          nextSymbol.fillCategoryColumn
        );
      nextSymbol.valueColumn = clearColumn(nextSymbol.valueColumn);
      nextSymbol.categoryColumn = clearColumn(nextSymbol.categoryColumn);
      nextSymbol.sizeColumn = clearColumn(nextSymbol.sizeColumn);
      nextSymbol.fillValueColumn = clearColumn(nextSymbol.fillValueColumn);
      nextSymbol.fillCategoryColumn = clearColumn(
        nextSymbol.fillCategoryColumn
      );
      if (hadSymbolClassificationDependency) {
        nextSymbol.classification = undefined;
      }
      if (hadSymbolFillClassificationDependency) {
        nextSymbol.fillClassification = undefined;
      }

      const hadLineColorClassificationDependency =
        nextLine.valueColumn === columnName ||
        nextLine.categoryColumn === columnName;
      const hadLineThicknessClassificationDependency =
        nextLine.valueColumn === columnName;
      nextLine.valueColumn = clearColumn(nextLine.valueColumn);
      nextLine.categoryColumn = clearColumn(nextLine.categoryColumn);
      nextLine.sizeColumn = clearColumn(nextLine.sizeColumn);
      removeLineModeStateColumns(nextLine, columnName, clearColumn);
      if (hadLineColorClassificationDependency) {
        nextLine.classification = undefined;
      }
      if (hadLineThicknessClassificationDependency) {
        nextLine.thicknessClassification = undefined;
      }

      const hadTextClassificationDependency = clearClassificationForColumn(
        nextText.valueColumn,
        nextText.categoryColumn
      );
      nextText.labelColumn = clearColumn(nextText.labelColumn);
      nextText.valueColumn = clearColumn(nextText.valueColumn);
      nextText.categoryColumn = clearColumn(nextText.categoryColumn);
      nextText.secondaryLabels = {
        ...nextText.secondaryLabels,
        labelColumn: clearColumn(nextText.secondaryLabels.labelColumn)
      };
      if (hadTextClassificationDependency) {
        nextText.classification = undefined;
      }

      const previousDataFilters = visualization.dataFilters ?? [];
      const nextDataFilters = previousDataFilters.filter(
        (filter) => filter.column !== columnName
      );
      if (nextDataFilters.length !== previousDataFilters.length) {
        mutated = true;
      }

      if (!mutated) {
        return visualization;
      }

      hasChanges = true;
      return getNormalizedVisualization({
        ...visualization,
        polygon: nextPolygon,
        symbol: nextSymbol,
        line: nextLine,
        lineClassification: hadLineColorClassificationDependency
          ? undefined
          : visualization.lineClassification,
        lineThicknessClassification: hadLineThicknessClassificationDependency
          ? undefined
          : visualization.lineThicknessClassification,
        text: nextText,
        mapping: nextMapping,
        classification: shouldClearClassification
          ? undefined
          : visualization.classification,
        dataFilters: nextDataFilters
      });
    });

    if (hasChanges) {
      incrementVersion(state);
    }
  }

  function addDataFilter(id: string, filter: Omit<VizDataFilter, 'id'>): void {
    applyVisualizationUpdate(id, (viz) => {
      const existing = viz.dataFilters ?? [];
      const newFilter: VizDataFilter = {
        ...filter,
        id: crypto.randomUUID()
      };
      return { dataFilters: [...existing, newFilter] };
    });
  }

  function removeDataFilter(id: string, filterId: string): void {
    applyVisualizationUpdate(id, (viz) => {
      const existing = viz.dataFilters ?? [];
      return { dataFilters: existing.filter((f) => f.id !== filterId) };
    });
  }

  function updateDataFilter(
    id: string,
    filterId: string,
    updates: Partial<Omit<VizDataFilter, 'id'>>
  ): void {
    applyVisualizationUpdate(id, (viz) => {
      const existing = viz.dataFilters ?? [];
      return {
        dataFilters: existing.map((f) =>
          f.id === filterId ? { ...f, ...updates } : f
        )
      };
    });
  }

  function clearDataFilters(id: string): void {
    applyVisualizationUpdate(id, () => ({ dataFilters: [] }));
  }

  function clearDataFiltersForPrimitive(
    id: string,
    primitiveType: PrimitiveFilter
  ): void {
    applyVisualizationUpdate(id, (viz) => ({
      dataFilters: (viz.dataFilters ?? []).filter(
        (f) => f.primitiveType !== primitiveType
      )
    }));
  }

  function clear(): void {
    state.visualizations = [];
    state.selectedVisualizationId = undefined;
    updateActiveVisualizationIds((ids) => {
      ids.clear();
      return ids;
    });
    incrementVersion(state);
  }

  function restoreFromSerialized(
    settings: SerializedVisualizationSettings
  ): void {
    const restoredVisualizations = (settings.visualizations || [])
      .filter((viz: VisualizationConfig) => !viz.facet)
      .map((viz: VisualizationConfig) => getNormalizedVisualization(viz));

    state.visualizations = restoredVisualizations;

    const restoredIds = new Set(restoredVisualizations.map((viz) => viz.id));
    state.selectedVisualizationId = restoredIds.has(
      settings.selectedVisualizationId ?? ''
    )
      ? settings.selectedVisualizationId
      : restoredVisualizations[0]?.id;
    state.activeVisualizationIds = new Set(
      (settings.activeVisualizationIds || []).filter((id) =>
        restoredIds.has(id)
      )
    );
    incrementVersion(state);
  }

  return {
    get version(): number {
      return state.version;
    },
    get visualizations(): VisualizationConfig[] {
      return state.visualizations;
    },
    get selectedVisualization(): VisualizationConfig | undefined {
      if (!state.selectedVisualizationId) {
        return undefined;
      }
      return findById(state.visualizations, state.selectedVisualizationId);
    },
    get activeVisualizations(): VisualizationConfig[] {
      return state.visualizations.filter((visualization) =>
        state.activeVisualizationIds.has(visualization.id)
      );
    },
    createVisualization,
    updateModes,
    togglePrimitiveFilter,
    setPrimitiveFilterOrder,
    updateSymbols,
    updateMissingData,
    updateClassification,
    updatePrimitiveClassification,
    updateLineThicknessClassification,
    updatePrimitiveStrokeClassification,
    updateVisualization,
    renameVisualization,
    applyVisualizationPreset,
    duplicateVisualization,
    removeVisualization,
    createBulkVisualizations,
    removeBulkVisualizations,
    setVisualizationOrder,
    toggleVisualization,
    selectVisualization,
    invertPalette,
    getVisualizationsByDataset,
    getVisualizationsUsingColumn,
    renameDatasetColumnReferences,
    removeDatasetColumnReferences,
    addDataFilter,
    removeDataFilter,
    updateDataFilter,
    clearDataFilters,
    clearDataFiltersForPrimitive,
    clear,
    restoreFromSerialized
  };
}

export const visualizationStore = createVisualizationStore();

persistenceRegistry.register({
  key: 'visualization',
  serialize: () => ({
    visualizations: visualizationStore.visualizations,
    selectedVisualizationId: visualizationStore.selectedVisualization?.id,
    activeVisualizationIds: visualizationStore.activeVisualizations.map(
      (v) => v.id
    )
  }),
  deserialize: (data: unknown) => {
    const settings = data as {
      visualizations?: unknown[];
      selectedVisualizationId?: string;
      activeVisualizationIds?: string[];
    };
    visualizationStore.restoreFromSerialized({
      visualizations: (settings.visualizations ?? []) as Parameters<
        typeof visualizationStore.restoreFromSerialized
      >[0]['visualizations'],
      selectedVisualizationId: settings.selectedVisualizationId,
      activeVisualizationIds: settings.activeVisualizationIds ?? []
    });
  },
  reset: () => visualizationStore.clear(),
  priority: 'debounced'
});
