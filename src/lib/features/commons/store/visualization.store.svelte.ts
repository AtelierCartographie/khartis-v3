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
import { generateDuplicateName } from '../utils/naming.utils';
import { datasetsStore } from './datasets.store.svelte';

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

export interface VisualizationModes {
  symbol: SymbolMode;
  fill: FillMode;
  stroke: StrokeMode;
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
  shape: MissingDataShape;
  size: number;
  color: string;
  pattern?: boolean;
}

export interface VisualizationConfig {
  id: string;
  name: string;
  type: VisualizationType;
  datasetId: string;
  enabled: boolean;
  modes?: VisualizationModes;
  style: {
    fillColor?: string | string[];
    fillOpacity?: number;
    strokeColor?: string;
    strokeWidth?: number;
    strokeOpacity?: number;
    strokeDashed?: boolean;
  };
  mapping: {
    valueColumn?: string;
    categoryColumn?: string;
    sizeColumn?: string;
    colorColumn?: string;
    geometryColumn?: string;
  };
  classification?: ClassificationConfig;
  symbols?: {
    type: ShapeType;
    size?: number;
    minSize: number;
    maxSize: number;
    sizeScale: 'linear' | 'sqrt' | 'log';
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
    return this._state.visualizations.find(
      (v) => v.id === this._state.selectedVisualizationId
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
    const dataset = datasetsStore.datasets.find((d) => d.id === datasetId);
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    const config: VisualizationConfig = {
      id: crypto.randomUUID(),
      name: name || `${type} - ${dataset.name}`,
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
    this._state.visualizations = this._state.visualizations.map((v) =>
      v.id === id
        ? { ...v, modes: { ...v.modes, ...modes } as VisualizationModes }
        : v
    );
    this.incrementVersion();
  }

  updateSymbols(
    id: string,
    symbols: Partial<VisualizationConfig['symbols']>
  ): void {
    this._state.visualizations = this._state.visualizations.map((v) =>
      v.id === id && v.symbols
        ? { ...v, symbols: { ...v.symbols, ...symbols } }
        : v
    );
    this.incrementVersion();
  }

  updateMissingData(id: string, missingData: Partial<MissingDataConfig>): void {
    this._state.visualizations = this._state.visualizations.map((v) =>
      v.id === id && v.missingData
        ? { ...v, missingData: { ...v.missingData, ...missingData } }
        : v
    );
    this.incrementVersion();
  }

  updateClassification(
    id: string,
    classification: Partial<ClassificationConfig>
  ): void {
    this._state.visualizations = this._state.visualizations.map((v) =>
      v.id === id && v.classification
        ? { ...v, classification: { ...v.classification, ...classification } }
        : v
    );
    this.incrementVersion();
  }

  updateVisualization(id: string, updates: Partial<VisualizationConfig>): void {
    this._state.visualizations = this._state.visualizations.map((v) =>
      v.id === id ? { ...v, ...updates, id } : v
    );
    this.incrementVersion();
  }

  duplicateVisualization(id: string): VisualizationConfig | null {
    const original = this._state.visualizations.find((v) => v.id === id);
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

  toggleVisualization(id: string): void {
    if (this._state.activeVisualizationIds.has(id)) {
      this._state.activeVisualizationIds.delete(id);
    } else {
      this._state.activeVisualizationIds.add(id);
    }
    this.incrementVersion();
  }

  selectVisualization(id: string): void {
    const viz = this._state.visualizations.find((v) => v.id === id);
    if (viz) {
      this._state.selectedVisualizationId = id;
    }
  }

  invertPalette(id: string): void {
    this._state.visualizations = this._state.visualizations.map((v) => {
      if (v.id === id && v.classification?.colors) {
        return {
          ...v,
          classification: {
            ...v.classification,
            colors: [...v.classification.colors].reverse()
          }
        };
      }
      return v;
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
          fillOpacity: 0.8,
          strokeColor: '#ffffff',
          strokeWidth: 1,
          strokeOpacity: 1
        };

      case VisualizationType.PROPORTIONAL:
        return {
          fillColor: '#3b82f6',
          fillOpacity: 0.6,
          strokeColor: '#ffffff',
          strokeWidth: 2,
          strokeOpacity: 1
        };

      case VisualizationType.CATEGORICAL:
        return {
          fillOpacity: 0.8,
          strokeColor: '#ffffff',
          strokeWidth: 1,
          strokeOpacity: 1
        };

      default:
        return {
          fillColor: '#3b82f6',
          fillOpacity: 0.7,
          strokeColor: '#ffffff',
          strokeWidth: 1,
          strokeOpacity: 1
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
        sizeScale: 'sqrt',
        opacity: 0.8
      };
    }
    return {
      type: ShapeType.POINT,
      size: 12,
      minSize: 5,
      maxSize: 50,
      sizeScale: 'linear',
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
