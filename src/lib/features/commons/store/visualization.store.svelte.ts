import type {
  DatasetResult,
  ProcessedDataset
} from '$lib/features/data-pipeline';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import {
  DEFAULT_COLORS,
  type DensityConfig,
  FillMode,
  MissingDataShape,
  ProportionalType,
  ShapeType,
  StrokeMode,
  SymbolMode,
  VISUALIZATION_DEFAULTS,
  availableShapesForSymbolMode
} from '$lib/features/main-toolbar/constants';
import { deepClone } from '../utils/clone.utils';
import { generateUniqueNameWithCounter } from '../utils/naming.utils';
import { datasetsStore } from './datasets.store.svelte';
import { findById, updateById } from '../utils/array-helpers';
import {
  DEFAULT_STROKE_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_STYLE_OPACITY,
  DEFAULT_STROKE_WIDTH
} from '../constants/colors.constants';
import { COLUMN_TYPE_GEOMETRY } from '../constants/data.constants';
import { isLikelyCoordinateColumn } from '../utils/geo-detector.utils';

export enum VisualizationType {
  CHOROPLETH = 'choropleth',
  PROPORTIONAL = 'proportional',
  CATEGORICAL = 'categorical',
  BIVARIATE = 'bivariate'
}

export enum ClassificationMethod {
  EQUAL_INTERVAL = 'equal_interval',
  QUANTILES = 'quantiles',
  JENKS = 'jenks',
  MANUAL = 'manual',
  STANDARD_DEVIATION = 'standard_deviation',
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
  thickness?: import('$lib/features/main-toolbar/constants').ThicknessMode;
  color?: import('$lib/features/main-toolbar/constants').ColorMode;
  size?: import('$lib/features/main-toolbar/constants').SizeMode;
  proportionalType?: ProportionalType;
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
  breakpointValue?: number | null;
  patternId?: string;
  patternParams?: PatternParams;
}

export interface MissingDataConfig {
  show: boolean;
  enabled?: boolean;
  shape: MissingDataShape;
  size: number;
  color: string;
  opacity?: number;
  pattern?: boolean;
  label?: string;
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

export interface VisualizationOrigin {
  mode: VisualizationOriginMode;
  suggestionKey?: string;
}

export const ALL_PRIMITIVE_FILTERS: PrimitiveFilter[] = [
  PrimitiveFilterType.POINT,
  PrimitiveFilterType.LINE,
  PrimitiveFilterType.POLYGON
];

export interface YearFilter {
  column: string;
  value: number | string;
}

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
  modes?: VisualizationModes;
  primitiveFilters?: PrimitiveFilter[];
  primitiveOrder?: PrimitiveFilter[];
  style: {
    fillColor?: string | string[];
    fillColorB?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWidth?: number;
    strokeOpacity?: number;
    strokeDashed?: boolean;
    lineWidth?: number;
    lineMaxWidth?: number;
    lineColor?: string | string[];
    lineOpacity?: number;
    lineDashed?: boolean;
    textColor?: string | string[];
    textOpacity?: number;
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
    labelSize?: number;
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
  symbols?: {
    type: ShapeType;
    size?: number;
    minSize: number;
    maxSize: number;
    sizeScale: ScaleType;
    opacity?: number;
  };
  missingData?: MissingDataConfig;
  density?: DensityConfig;
  yearFilter?: YearFilter;
  dataFilters?: VizDataFilter[];
}

export type VisualizationPreset = Pick<
  VisualizationConfig,
  | 'type'
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
    classification: Partial<ClassificationConfig>
  ) => void;
  updateVisualization: (
    id: string,
    updates: Partial<VisualizationConfig>
  ) => void;
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
  setYearFilter: (id: string, filter: YearFilter | null) => void;
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

const DEFAULT_VISUALIZATION_NAME = 'Visualisation';
const DATASET_NOT_FOUND_ERROR = 'Dataset not found';

const COLUMN_TYPE_NUMBER = 'number';
const COLUMN_TYPE_STRING = 'string';

const DEFAULT_SYMBOL_SIZE = 12;
const DEFAULT_SYMBOL_MIN_SIZE = 5;
const DEFAULT_SYMBOL_MAX_SIZE = VISUALIZATION_DEFAULTS.symbolMaxSize;
const DEFAULT_SYMBOL_OPACITY = 0.8;
const DEFAULT_LABEL_OPACITY = 0;
const DEFAULT_TEXT_OPACITY = 0;

const DEFAULT_MISSING_DATA_COLOR = '#c6c6c6';
const DEFAULT_QUANTILES_CLASS_COUNT = 5;

const DEFAULT_CHOROPLETH_COLORS = [
  '#eff3ff',
  '#bdd7e7',
  '#6baed6',
  '#3182bd',
  '#08519c'
];

export const DEFAULT_CATEGORICAL_COLORS = [
  '#e41a1c',
  '#377eb8',
  '#4daf4a',
  '#984ea3',
  '#ff7f00',
  '#ffff33',
  '#a65628',
  '#f781bf'
];

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

function incrementVersion(state: VisualizationState): void {
  state.version++;
  persistenceRegistry.notifyChange('visualization');
}

function getDefaultStyle(
  type: VisualizationType
): VisualizationConfig['style'] {
  const textOverlayDefaults: VisualizationConfig['style'] = {
    labelColor: DEFAULT_COLORS.label,
    labelOpacity: DEFAULT_LABEL_OPACITY,
    labelCollisionDetection: true,
    textColor: DEFAULT_COLORS.text,
    textOpacity: DEFAULT_TEXT_OPACITY,
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
        fillColor: DEFAULT_FILL_COLOR,
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
  const numericColumns = dataset.columns.filter(
    (column) =>
      column.type === COLUMN_TYPE_NUMBER &&
      !isLikelyCoordinateColumn(column.name)
  );
  const stringColumns = dataset.columns.filter(
    (column) => column.type === COLUMN_TYPE_STRING
  );
  const geometryColumn = dataset.columns.find(
    (column) => column.type === COLUMN_TYPE_GEOMETRY
  );

  const mapping: VisualizationConfig['mapping'] = {
    geometryColumn: geometryColumn?.name
  };

  switch (type) {
    case VisualizationType.CHOROPLETH:
      mapping.valueColumn = numericColumns[0]?.name;
      break;

    case VisualizationType.PROPORTIONAL:
      mapping.sizeColumn = numericColumns[0]?.name;
      break;

    case VisualizationType.CATEGORICAL:
      mapping.categoryColumn = stringColumns[0]?.name;
      break;

    case VisualizationType.BIVARIATE:
      mapping.sizeColumn = numericColumns[0]?.name;
      mapping.valueColumn = numericColumns[1]?.name;
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
      method: ClassificationMethod.QUANTILES,
      classes: DEFAULT_QUANTILES_CLASS_COUNT,
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
      ? Math.max(
          6,
          Math.min(
            VISUALIZATION_DEFAULTS.symbolMaxSize,
            Math.round(140 / Math.sqrt(Math.max(rowCount, 1)))
          )
        )
      : DEFAULT_SYMBOL_MAX_SIZE;
  const minSize = isPolygonGeometry
    ? Math.max(1, Math.min(4, Math.round(densityAdjustedMaxSize / 4)))
    : DEFAULT_SYMBOL_MIN_SIZE;

  return {
    type: ShapeType.CIRCLE,
    size: DEFAULT_SYMBOL_SIZE,
    minSize,
    maxSize: densityAdjustedMaxSize,
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
  const normalizedGeometryType = geometryType?.toLowerCase() ?? '';

  if (normalizedGeometryType.includes('polygon')) {
    return 'polygon';
  }

  if (normalizedGeometryType.includes('line')) {
    return 'line';
  }

  if (normalizedGeometryType.includes('point')) {
    return 'point';
  }

  return 'unknown';
}

export function resolveAllowedPrimitiveFilters(
  _type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): PrimitiveFilter[] {
  switch (resolveGeometryFamilyFromDataset(dataset)) {
    case 'polygon':
      return [PrimitiveFilterType.POINT, PrimitiveFilterType.POLYGON];

    case 'line':
      return [PrimitiveFilterType.LINE];

    case 'point':
      return [PrimitiveFilterType.POINT];

    default:
      return [...ALL_PRIMITIVE_FILTERS];
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
      return [...ALL_PRIMITIVE_FILTERS];
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
    style.textSize = style.labelSize ?? style.textSize;
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
  const allowedShapes = availableShapesForSymbolMode(symbolMode);
  const currentShape = visualization.symbols?.type;
  const normalizedShape =
    currentShape && allowedShapes.includes(currentShape)
      ? currentShape
      : (allowedShapes[0] ?? ShapeType.CIRCLE);
  const normalizedSymbols = visualization.symbols
    ? { ...visualization.symbols, type: normalizedShape }
    : visualization.symbols;

  return {
    ...visualization,
    style: normalizeLegacyLabelStyle(visualization),
    symbols: normalizedSymbols,
    primitiveFilters: sanitizePrimitiveFilters(
      visualization.primitiveFilters,
      allowedFilters,
      defaultFilters
    ),
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
  'modes',
  'primitiveFilters',
  'style',
  'mapping',
  'classification',
  'symbols',
  'missingData',
  'yearFilter',
  'dataFilters'
] as const;

function touchesVisualizationSemantics(
  updates: Partial<VisualizationConfig>
): boolean {
  return ORIGIN_TRACKED_UPDATE_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(updates, key)
  );
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

  if (!touchesVisualizationSemantics(updates)) {
    return visualization.origin;
  }

  return { mode: 'custom' };
}

function buildVisualizationPreset(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): VisualizationPreset {
  return {
    type,
    modes: getDefaultModes(type),
    primitiveFilters: getDefaultPrimitiveFilters(type, dataset),
    style: getDefaultStyle(type),
    mapping: getDefaultMapping(type, dataset),
    classification: getDefaultClassification(type),
    symbols: getDefaultSymbols(type, dataset),
    missingData: getDefaultMissingData()
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
    pattern: false
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
    ) => Partial<VisualizationConfig> | null
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
    incrementVersion(state);
  }

  function createVisualization(
    type: VisualizationType,
    datasetId: string,
    name?: string
  ): VisualizationConfig {
    const dataset = findById(datasetsStore.datasets, datasetId);
    if (!dataset) {
      throw new Error(DATASET_NOT_FOUND_ERROR);
    }

    const visualization = getNormalizedVisualization({
      id: crypto.randomUUID(),
      name:
        name ||
        generateUniqueNameWithCounter(
          DEFAULT_VISUALIZATION_NAME,
          state.visualizations.map((item) => item.name)
        ),
      datasetId,
      enabled: true,
      ...buildVisualizationPreset(type, dataset)
    });

    state.visualizations.push(visualization);
    state.selectedVisualizationId = visualization.id;
    updateActiveVisualizationIds((ids) => ids.add(visualization.id));
    incrementVersion(state);

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
      const nextFilters = currentFilters.includes(primitive)
        ? currentFilters.filter((item) => item !== primitive)
        : [...currentFilters, primitive];

      return {
        primitiveFilters: nextFilters
      };
    });
  }

  function setPrimitiveFilterOrder(id: string, order: PrimitiveFilter[]): void {
    applyVisualizationUpdate(id, () => ({
      primitiveOrder: order
    }));
  }

  function updateSymbols(
    id: string,
    symbols: Partial<VisualizationConfig['symbols']>
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      if (!visualization.symbols) {
        return null;
      }

      return {
        symbols: {
          ...visualization.symbols,
          ...(symbols as Partial<VisualizationSymbols>)
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
        missingData: { ...visualization.missingData, ...missingData }
      };
    });
  }

  function updateClassification(
    id: string,
    classification: Partial<ClassificationConfig>
  ): void {
    applyVisualizationUpdate(id, (visualization) => {
      const existing = visualization.classification ?? {
        method: ClassificationMethod.QUANTILES,
        classes: DEFAULT_QUANTILES_CLASS_COUNT
      };

      return {
        classification: { ...existing, ...classification }
      };
    });
  }

  function updateVisualization(
    id: string,
    updates: Partial<VisualizationConfig>
  ): void {
    applyVisualizationUpdate(id, () => updates);
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
      ...(targetDatasetId ? { datasetId: targetDatasetId } : {})
    });

    state.visualizations.push(duplicatedVisualization);
    state.selectedVisualizationId = duplicatedVisualization.id;
    updateActiveVisualizationIds((ids) => ids.add(duplicatedVisualization.id));
    incrementVersion(state);

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
    incrementVersion(state);
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

    incrementVersion(state);
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
    incrementVersion(state);
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

  function getVisualizationsUsingColumn(
    datasetId: string,
    columnName: string
  ): VisualizationConfig[] {
    return state.visualizations.filter((visualization) => {
      if (visualization.datasetId !== datasetId) {
        return false;
      }

      const mapping = visualization.mapping;
      return (
        mapping.valueColumn === columnName ||
        mapping.categoryColumn === columnName ||
        mapping.sizeColumn === columnName ||
        mapping.colorColumn === columnName ||
        mapping.geometryColumn === columnName ||
        mapping.labelColumn === columnName ||
        mapping.secondaryLabelColumn === columnName ||
        visualization.yearFilter?.column === columnName ||
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
      for (const key of VISUALIZATION_MAPPING_KEYS) {
        if (nextMapping[key as VisualizationMappingKey] === previousName) {
          nextMapping[key as VisualizationMappingKey] = nextName;
          mutated = true;
        }
      }

      const nextYearFilter =
        visualization.yearFilter?.column === previousName
          ? { ...visualization.yearFilter, column: nextName }
          : visualization.yearFilter;
      if (nextYearFilter !== visualization.yearFilter) {
        mutated = true;
      }

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
        mapping: nextMapping,
        yearFilter: nextYearFilter,
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
      for (const key of VISUALIZATION_MAPPING_KEYS) {
        if (nextMapping[key as VisualizationMappingKey] === columnName) {
          nextMapping[key as VisualizationMappingKey] = undefined;
          mutated = true;
          if (CLASSIFICATION_DEPENDENT_MAPPING_KEYS.has(key)) {
            shouldClearClassification = true;
          }
        }
      }

      const nextYearFilter =
        visualization.yearFilter?.column === columnName
          ? undefined
          : visualization.yearFilter;
      if (nextYearFilter !== visualization.yearFilter) {
        mutated = true;
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
        mapping: nextMapping,
        classification: shouldClearClassification
          ? undefined
          : visualization.classification,
        yearFilter: nextYearFilter,
        dataFilters: nextDataFilters
      });
    });

    if (hasChanges) {
      incrementVersion(state);
    }
  }

  function setYearFilter(id: string, filter: YearFilter | null): void {
    applyVisualizationUpdate(id, () => ({ yearFilter: filter ?? undefined }));
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
    updateVisualization,
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
    setYearFilter,
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
