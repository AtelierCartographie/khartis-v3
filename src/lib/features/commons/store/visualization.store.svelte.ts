import type {
  DatasetResult,
  ProcessedDataset
} from '$lib/features/data-pipeline';
import {
  FillMode,
  MissingDataShape,
  ShapeType,
  StrokeMode,
  SymbolMode
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
  STANDARD_DEVIATION = 'standard_deviation'
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
}

export interface ClassificationConfig {
  method: ClassificationMethod;
  classes: number;
  numClasses?: number;
  breaks?: number[];
  colors?: string[];
  labels?: string[];
  breakpointValue?: number | null;
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

export interface VisualizationConfig {
  id: string;
  name: string;
  type: VisualizationType;
  datasetId: string;
  enabled: boolean;
  modes?: VisualizationModes;
  primitiveFilters?: PrimitiveFilter[];
  style: {
    fillColor?: string | string[];
    fillOpacity?: number;
    strokeColor?: string;
    strokeWidth?: number;
    strokeOpacity?: number;
    strokeDashed?: boolean;
    // Line properties
    lineWidth?: number;
    lineMaxWidth?: number;
    lineColor?: string | string[];
    lineOpacity?: number;
    lineDashed?: boolean;
    // Text properties
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
    // Label properties
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
}

interface VisualizationState {
  visualizations: VisualizationConfig[];
  selectedVisualizationId?: string;
  activeVisualizationIds: Set<string>;
  version: number;
}

class VisualizationStore {
  private _state = $state<VisualizationState>({
    visualizations: [],
    activeVisualizationIds: new Set(),
    version: 0
  });

  get version() {
    return this._state.version;
  }

  private incrementVersion() {
    this._state.version++;
  }

  get visualizations() {
    return this._state.visualizations;
  }

  get selectedVisualization() {
    if (!this._state.selectedVisualizationId) return undefined;
    return findById(
      this._state.visualizations,
      this._state.selectedVisualizationId
    );
  }

  get activeVisualizations() {
    return this._state.visualizations.filter((v) =>
      this._state.activeVisualizationIds.has(v.id)
    );
  }

  createVisualization(
    type: VisualizationType,
    datasetId: string,
    name?: string
  ): VisualizationConfig {
    const dataset = findById(datasetsStore.datasets, datasetId);
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    const config: VisualizationConfig = {
      id: crypto.randomUUID(),
      name:
        name ||
        generateUniqueNameWithCounter(
          'Visualisation',
          this._state.visualizations.map((v) => v.name)
        ),
      type,
      datasetId,
      enabled: true,
      modes: this.getDefaultModes(type),
      style: this.getDefaultStyle(type),
      mapping: this.getDefaultMapping(type, dataset),
      classification: this.getDefaultClassification(type),
      symbols: this.getDefaultSymbols(type),
      missingData: this.getDefaultMissingData()
    };

    this._state.visualizations.push(config);
    this._state.selectedVisualizationId = config.id;
    this._state.activeVisualizationIds.add(config.id);
    this.incrementVersion();

    return config;
  }

  updateModes(id: string, modes: Partial<VisualizationModes>): void {
    const viz = findById(this._state.visualizations, id);
    if (!viz) return;
    this._state.visualizations = updateById(this._state.visualizations, id, {
      modes: { ...viz.modes, ...modes } as VisualizationModes
    });
    this.incrementVersion();
  }

  togglePrimitiveFilter(id: string, primitive: PrimitiveFilter): void {
    const viz = findById(this._state.visualizations, id);
    if (!viz) return;
    const current = viz.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
    const updated = current.includes(primitive)
      ? current.filter((p) => p !== primitive)
      : [...current, primitive];
    this._state.visualizations = updateById(this._state.visualizations, id, {
      primitiveFilters: updated.length > 0 ? updated : current
    });
    this.incrementVersion();
  }

  updateSymbols(
    id: string,
    symbols: Partial<VisualizationConfig['symbols']>
  ): void {
    const viz = findById(this._state.visualizations, id);
    if (!viz?.symbols) return;
    this._state.visualizations = updateById(this._state.visualizations, id, {
      symbols: { ...viz.symbols, ...symbols }
    });
    this.incrementVersion();
  }

  updateMissingData(id: string, missingData: Partial<MissingDataConfig>): void {
    const viz = findById(this._state.visualizations, id);
    if (!viz?.missingData) return;
    this._state.visualizations = updateById(this._state.visualizations, id, {
      missingData: { ...viz.missingData, ...missingData }
    });
    this.incrementVersion();
  }

  updateClassification(
    id: string,
    classification: Partial<ClassificationConfig>
  ): void {
    const viz = findById(this._state.visualizations, id);
    if (!viz?.classification) return;
    this._state.visualizations = updateById(this._state.visualizations, id, {
      classification: { ...viz.classification, ...classification }
    });
    this.incrementVersion();
  }

  updateVisualization(id: string, updates: Partial<VisualizationConfig>): void {
    if (!findById(this._state.visualizations, id)) return;
    this._state.visualizations = updateById(this._state.visualizations, id, {
      ...updates,
      id
    });
    this.incrementVersion();
  }

  duplicateVisualization(id: string): VisualizationConfig | null {
    const original = findById(this._state.visualizations, id);
    if (!original) {
      return null;
    }

    const existingNames = this._state.visualizations.map((v) => v.name);
    const duplicatedName = generateDuplicateName(original.name, existingNames);

    const duplicate: VisualizationConfig = {
      ...deepClone(original),
      id: crypto.randomUUID(),
      name: duplicatedName
    };

    this._state.visualizations.push(duplicate);
    this._state.selectedVisualizationId = duplicate.id;
    this._state.activeVisualizationIds.add(duplicate.id);
    this.incrementVersion();

    return duplicate;
  }

  removeVisualization(id: string): void {
    const filteredVisualizations = this._state.visualizations.filter(
      (v) => v.id !== id
    );

    this._state.activeVisualizationIds.delete(id);

    if (this._state.selectedVisualizationId === id) {
      this._state.selectedVisualizationId = filteredVisualizations[0]?.id;
    }

    this._state.visualizations = filteredVisualizations;
    this.incrementVersion();
  }

  createBulkVisualizations(configs: VisualizationConfig[]): void {
    if (configs.length === 0) {
      return;
    }

    configs.forEach((config) => {
      this._state.visualizations.push(config);
      this._state.activeVisualizationIds.add(config.id);
    });

    this.incrementVersion();
  }

  removeBulkVisualizations(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }

    const idsSet = new Set(ids);
    const filteredVisualizations = this._state.visualizations.filter(
      (v) => !idsSet.has(v.id)
    );

    ids.forEach((id) => {
      this._state.activeVisualizationIds.delete(id);
    });

    if (
      this._state.selectedVisualizationId &&
      idsSet.has(this._state.selectedVisualizationId)
    ) {
      this._state.selectedVisualizationId = filteredVisualizations[0]?.id;
    }

    this._state.visualizations = filteredVisualizations;
    this.incrementVersion();
  }

  toggleVisualization(id: string): void {
    if (this._state.activeVisualizationIds.has(id)) {
      this._state.activeVisualizationIds.delete(id);
    } else {
      this._state.activeVisualizationIds.add(id);
    }
    this.incrementVersion();
  }

  selectVisualization(id: string): void {
    const viz = findById(this._state.visualizations, id);
    if (viz) {
      this._state.selectedVisualizationId = id;
    }
  }

  invertPalette(id: string): void {
    const viz = findById(this._state.visualizations, id);
    if (!viz?.classification?.colors) return;
    this._state.visualizations = updateById(this._state.visualizations, id, {
      classification: {
        ...viz.classification,
        colors: [...viz.classification.colors].reverse()
      }
    });
    this.incrementVersion();
  }

  getVisualizationsByDataset(datasetId: string): VisualizationConfig[] {
    return this._state.visualizations.filter((v) => v.datasetId === datasetId);
  }

  getVisualizationsUsingColumn(columnName: string): VisualizationConfig[] {
    return this._state.visualizations.filter((viz) => {
      const mapping = viz.mapping;
      return (
        mapping?.valueColumn === columnName ||
        mapping?.categoryColumn === columnName ||
        mapping?.sizeColumn === columnName ||
        mapping?.colorColumn === columnName
      );
    });
  }

  private getDefaultStyle(type: VisualizationType) {
    switch (type) {
      case VisualizationType.CHOROPLETH:
        return {
          fillOpacity: DEFAULT_STYLE_OPACITY.FILL_HIGH,
          strokeColor: DEFAULT_STROKE_COLOR,
          strokeWidth: DEFAULT_STROKE_WIDTH.THIN,
          strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
        };

      case VisualizationType.PROPORTIONAL:
        return {
          fillColor: DEFAULT_FILL_COLOR,
          fillOpacity: DEFAULT_STYLE_OPACITY.FILL_LOW,
          strokeColor: DEFAULT_STROKE_COLOR,
          strokeWidth: DEFAULT_STROKE_WIDTH.MEDIUM,
          strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
        };

      case VisualizationType.CATEGORICAL:
        return {
          fillOpacity: DEFAULT_STYLE_OPACITY.FILL_HIGH,
          strokeColor: DEFAULT_STROKE_COLOR,
          strokeWidth: DEFAULT_STROKE_WIDTH.THIN,
          strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
        };

      default:
        return {
          fillColor: DEFAULT_FILL_COLOR,
          fillOpacity: DEFAULT_STYLE_OPACITY.FILL,
          strokeColor: DEFAULT_STROKE_COLOR,
          strokeWidth: DEFAULT_STROKE_WIDTH.THIN,
          strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
        };
    }
  }

  private getDefaultMapping(
    type: VisualizationType,
    dataset: ProcessedDataset | DatasetResult
  ) {
    const numericColumns = dataset.columns.filter((c) => c.type === 'number');
    const stringColumns = dataset.columns.filter((c) => c.type === 'string');
    const geometryColumn = dataset.columns.find((c) => c.type === 'geometry');

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
        mapping.valueColumn = numericColumns[0]?.name;
        mapping.colorColumn = numericColumns[1]?.name;
        break;
    }

    return mapping;
  }

  private getDefaultClassification(type: VisualizationType) {
    if (
      type === VisualizationType.CHOROPLETH ||
      type === VisualizationType.BIVARIATE
    ) {
      return {
        method: ClassificationMethod.QUANTILES,
        classes: 5,
        colors: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c']
      };
    }

    if (type === VisualizationType.CATEGORICAL) {
      return {
        method: ClassificationMethod.MANUAL,
        classes: 0,
        colors: [
          '#e41a1c',
          '#377eb8',
          '#4daf4a',
          '#984ea3',
          '#ff7f00',
          '#ffff33',
          '#a65628',
          '#f781bf'
        ]
      };
    }

    return undefined;
  }

  private getDefaultModes(type: VisualizationType): VisualizationModes {
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
      default:
        return {
          symbol: SymbolMode.UNIQUE,
          fill: FillMode.UNIQUE,
          stroke: StrokeMode.NONE
        };
    }
  }

  private getDefaultSymbols(
    type: VisualizationType
  ): VisualizationConfig['symbols'] | undefined {
    if (type === VisualizationType.PROPORTIONAL) {
      return {
        type: ShapeType.POINT,
        size: 12,
        minSize: 5,
        maxSize: 50,
        sizeScale: ScaleType.SQRT,
        opacity: 0.8
      };
    }
    return {
      type: ShapeType.POINT,
      size: 12,
      minSize: 5,
      maxSize: 50,
      sizeScale: ScaleType.LINEAR,
      opacity: 0.8
    };
  }

  private getDefaultMissingData(): MissingDataConfig {
    return {
      show: true,
      shape: MissingDataShape.CIRCLE,
      size: 2,
      color: '#c6c6c6',
      pattern: false
    };
  }

  clear(): void {
    this._state.visualizations = [];
    this._state.selectedVisualizationId = undefined;
    this._state.activeVisualizationIds.clear();
    this.incrementVersion();
  }

  restoreFromSerialized(settings: {
    visualizations: VisualizationConfig[];
    selectedVisualizationId?: string;
    activeVisualizationIds: string[];
  }): void {
    this._state.visualizations = settings.visualizations || [];
    this._state.selectedVisualizationId = settings.selectedVisualizationId;
    this._state.activeVisualizationIds = new Set(
      settings.activeVisualizationIds || []
    );
    this.incrementVersion();
  }
}

export const visualizationStore = new VisualizationStore();
