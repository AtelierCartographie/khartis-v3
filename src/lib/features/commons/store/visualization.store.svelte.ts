import type { ProcessedDataset } from '../utils/data-pipeline.utils';
import { datasetsStore } from './datasets.store.svelte';

export enum VisualizationType {
  CHOROPLETH = 'choropleth',
  PROPORTIONAL = 'proportional',
  CATEGORICAL = 'categorical',
  BIVARIATE = 'bivariate',
  COMBINED = 'combined'
}

export enum ClassificationMethod {
  EQUAL_INTERVAL = 'equal_interval',
  QUANTILES = 'quantiles',
  JENKS = 'jenks',
  MANUAL = 'manual',
  STANDARD_DEVIATION = 'standard_deviation'
}

export interface VisualizationConfig {
  id: string;
  name: string;
  type: VisualizationType;
  datasetId: string;
  enabled: boolean;
  style: {
    fillColor?: string | string[];
    fillOpacity?: number;
    strokeColor?: string;
    strokeWidth?: number;
    strokeOpacity?: number;
  };
  mapping: {
    valueColumn?: string;
    categoryColumn?: string;
    sizeColumn?: string;
    colorColumn?: string;
    geometryColumn?: string;
  };
  classification?: {
    method: ClassificationMethod;
    classes: number;
    breaks?: number[];
    colors?: string[];
    labels?: string[];
  };
  symbols?: {
    type: 'circle' | 'square' | 'triangle' | 'diamond';
    minSize: number;
    maxSize: number;
    sizeScale: 'linear' | 'sqrt' | 'log';
  };
}

interface VisualizationState {
  visualizations: VisualizationConfig[];
  selectedVisualizationId?: string;
  activeVisualizationIds: Set<string>;
}

class VisualizationStore {
  private _state = $state<VisualizationState>({
    visualizations: [],
    activeVisualizationIds: new Set()
  });

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
      style: this.getDefaultStyle(type),
      mapping: this.getDefaultMapping(type, dataset),
      classification: this.getDefaultClassification(type),
      symbols:
        type === VisualizationType.PROPORTIONAL
          ? {
              type: 'circle',
              minSize: 5,
              maxSize: 50,
              sizeScale: 'sqrt'
            }
          : undefined
    };

    this._state.visualizations.push(config);
    this._state.selectedVisualizationId = config.id;
    this._state.activeVisualizationIds.add(config.id);

    return config;
  }

  updateVisualization(id: string, updates: Partial<VisualizationConfig>): void {
    const index = this._state.visualizations.findIndex((v) => v.id === id);
    if (index >= 0) {
      this._state.visualizations[index] = {
        ...this._state.visualizations[index],
        ...updates,
        id
      };
    }
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
  }

  toggleVisualization(id: string): void {
    if (this._state.activeVisualizationIds.has(id)) {
      this._state.activeVisualizationIds.delete(id);
    } else {
      this._state.activeVisualizationIds.add(id);
    }
  }

  selectVisualization(id: string): void {
    const viz = this._state.visualizations.find((v) => v.id === id);
    if (viz) {
      this._state.selectedVisualizationId = id;
    }
  }

  getVisualizationsByDataset(datasetId: string): VisualizationConfig[] {
    return this._state.visualizations.filter((v) => v.datasetId === datasetId);
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
    dataset: ProcessedDataset
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

  calculateBreaks(
    datasetId: string,
    columnName: string,
    method: ClassificationMethod,
    classes: number
  ): number[] {
    const values = datasetsStore
      .getColumnValues(datasetId, columnName)
      .filter((v) => typeof v === 'number' && !isNaN(v))
      .sort((a, b) => a - b);

    if (values.length === 0) return [];

    const min = values[0];
    const max = values[values.length - 1];

    switch (method) {
      case ClassificationMethod.EQUAL_INTERVAL:
        return this.equalIntervalBreaks(min, max, classes);

      case ClassificationMethod.QUANTILES:
        return this.quantileBreaks(values, classes);

      case ClassificationMethod.JENKS:
        return this.jenksBreaks(values, classes);

      case ClassificationMethod.STANDARD_DEVIATION:
        return this.standardDeviationBreaks(values, classes);

      default:
        return this.quantileBreaks(values, classes);
    }
  }

  private equalIntervalBreaks(
    min: number,
    max: number,
    classes: number
  ): number[] {
    const interval = (max - min) / classes;
    const breaks = [min];

    for (let i = 1; i < classes; i++) {
      breaks.push(min + interval * i);
    }
    breaks.push(max);

    return breaks;
  }

  private quantileBreaks(values: number[], classes: number): number[] {
    const breaks = [];
    const step = values.length / classes;

    for (let i = 0; i <= classes; i++) {
      const index = Math.min(Math.floor(i * step), values.length - 1);
      breaks.push(values[index]);
    }

    return Array.from(new Set(breaks));
  }

  private jenksBreaks(values: number[], classes: number): number[] {
    return this.quantileBreaks(values, classes);
  }

  private standardDeviationBreaks(values: number[], classes: number): number[] {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const breaks = [Math.min(...values)];
    const halfClasses = Math.floor(classes / 2);

    for (let i = -halfClasses; i <= halfClasses; i++) {
      if (i !== -halfClasses) {
        breaks.push(mean + i * stdDev);
      }
    }
    breaks.push(Math.max(...values));

    return breaks.sort((a, b) => a - b);
  }

  clear(): void {
    this._state.visualizations = [];
    this._state.selectedVisualizationId = undefined;
    this._state.activeVisualizationIds.clear();
  }
}

export const visualizationStore = new VisualizationStore();
