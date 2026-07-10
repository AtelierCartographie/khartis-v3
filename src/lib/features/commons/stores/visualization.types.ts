import type {
  BasemapDottedPattern,
  CategoryShapeMode,
  ColorMode,
  DensityConfig,
  FillMode,
  MissingDataShape,
  ProportionalType,
  ShapeType,
  SizeMode,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode,
  ThicknessMode,
  VisualizationType
} from '$lib/features/commons/constants/visualization.constants';
import type {
  PatternParams,
  PatternPaletteConfig,
  PatternType
} from '../constants/pattern.constants';

export { VisualizationType } from '$lib/features/commons/constants/visualization.constants';

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
  pattern?: PatternPaletteConfig;
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
  patternConfig?: PatternPaletteConfig;
  /**
   * Legacy: older projects stored patternId/patternParams, or an even
   * coarser PatternType. New code writes patternConfig; these are read as
   * fallbacks so older saved projects still render their missing-data
   * pattern.
   */
  patternId?: string;
  patternParams?: PatternParams;
  patternType?: PatternType;
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

export interface VisualizationState {
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

export type PrimitiveConfigMap = {
  polygon: PolygonPrimitiveConfig;
  symbol: SymbolPrimitiveConfig;
  line: LinePrimitiveConfig;
  text: TextPrimitiveConfig;
};
