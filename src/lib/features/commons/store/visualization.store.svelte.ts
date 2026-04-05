import type {
  DatasetResult,
  ProcessedDataset
} from '$lib/features/data-pipeline';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import {
  FillMode,
  MissingDataShape,
  ProportionalType,
  ShapeType,
  StrokeMode,
  SymbolMode,
  VISUALIZATION_DEFAULTS
} from '$lib/features/main-toolbar/constants';
import { deepClone } from '../utils/clone.utils';
import {
  generateDuplicateName,
  generateUniqueNameWithCounter
} from '../utils/naming.utils';
import { datasetsStore } from './datasets.store.svelte';
import { findById, updateById } from '../utils/array-helpers';
import {
  DEFAULT_STROKE_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_STYLE_OPACITY,
  DEFAULT_STROKE_WIDTH
} from '../constants/colors.constants';
import { COLUMN_TYPE_GEOMETRY } from '../constants/data.constants';

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
  POLYGON = 'polygon'
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
  | PrimitiveFilterType.POLYGON;

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
  | 'equals'
  | 'not_equals'
  | 'between';

export interface VizDataFilter {
  id: string;
  column: string;
  operator: VizFilterOperator;
  value: string;
  secondaryValue?: string;
  primitiveType?: PrimitiveFilter;
}

export interface VisualizationConfig {
  id: string;
  name: string;
  type: VisualizationType;
  datasetId: string;
  enabled: boolean;
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
  yearFilter?: YearFilter;
  dataFilters?: VizDataFilter[];
}

interface VisualizationState {
  visualizations: VisualizationConfig[];
  selectedVisualizationId?: string;
  activeVisualizationIds: Set<string>;
  version: number;
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
  getVisualizationsUsingColumn: (columnName: string) => VisualizationConfig[];
  setYearFilter: (id: string, filter: YearFilter | null) => void;
  addDataFilter: (id: string, filter: Omit<VizDataFilter, 'id'>) => void;
  removeDataFilter: (id: string, filterId: string) => void;
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

function incrementVersion(state: VisualizationState): void {
  state.version++;
  persistenceRegistry.notifyChange('visualization');
}

function getDefaultStyle(
  type: VisualizationType
): VisualizationConfig['style'] {
  const textOverlayDefaults: VisualizationConfig['style'] = {
    labelOpacity: DEFAULT_LABEL_OPACITY,
    textOpacity: DEFAULT_TEXT_OPACITY
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
    (column) => column.type === COLUMN_TYPE_NUMBER
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
    type: ShapeType.POINT,
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

function getDefaultPrimitiveFilters(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): PrimitiveFilter[] {
  const geometryType =
    typeof dataset.geometry === 'string'
      ? dataset.geometry
      : dataset.geometry?.type;
  const normalizedGeometryType = geometryType?.toLowerCase() ?? '';

  if (normalizedGeometryType.includes('polygon')) {
    if (
      type === VisualizationType.PROPORTIONAL ||
      type === VisualizationType.BIVARIATE
    ) {
      return [PrimitiveFilterType.POINT, PrimitiveFilterType.LINE];
    }

    return [PrimitiveFilterType.POLYGON, PrimitiveFilterType.LINE];
  }

  if (normalizedGeometryType.includes('line')) {
    return [PrimitiveFilterType.LINE];
  }

  if (normalizedGeometryType.includes('point')) {
    return [PrimitiveFilterType.POINT];
  }

  return [...ALL_PRIMITIVE_FILTERS];
}

function buildVisualizationPreset(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): Pick<
  VisualizationConfig,
  | 'type'
  | 'modes'
  | 'primitiveFilters'
  | 'style'
  | 'mapping'
  | 'classification'
  | 'symbols'
  | 'missingData'
> {
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

    state.visualizations = updateById(state.visualizations, id, {
      ...updates,
      id
    });
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

    const visualization: VisualizationConfig = {
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
    };

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

      if (nextFilters.length === 0) {
        return {};
      }

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

    const duplicatedName = generateDuplicateName(
      original.name,
      state.visualizations.map((item) => item.name)
    );

    const duplicatedVisualization: VisualizationConfig = {
      ...deepClone(original),
      id: crypto.randomUUID(),
      name: duplicatedName,
      ...(targetDatasetId ? { datasetId: targetDatasetId } : {})
    };

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
      state.visualizations.push(config);
      updateActiveVisualizationIds((ids) => ids.add(config.id));
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
    columnName: string
  ): VisualizationConfig[] {
    return state.visualizations.filter((visualization) => {
      const mapping = visualization.mapping;
      return (
        mapping.valueColumn === columnName ||
        mapping.categoryColumn === columnName ||
        mapping.sizeColumn === columnName ||
        mapping.colorColumn === columnName
      );
    });
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
    // Migrate old polygon vizzes: add LINE to primitiveFilters if only POLYGON was set
    const restoredVisualizations = (settings.visualizations || [])
      .filter((viz: VisualizationConfig) => !viz.facet)
      .map((viz: VisualizationConfig) => {
        if (
          viz.primitiveFilters &&
          viz.primitiveFilters.length === 1 &&
          viz.primitiveFilters[0] === PrimitiveFilterType.POLYGON
        ) {
          return {
            ...viz,
            primitiveFilters: [
              PrimitiveFilterType.POLYGON,
              PrimitiveFilterType.LINE
            ]
          };
        }
        return viz;
      });

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
    setYearFilter,
    addDataFilter,
    removeDataFilter,
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
