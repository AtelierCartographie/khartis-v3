import type { ProcessedDataset } from '../utils/data-pipeline.utils';
import {
  createDataPipeline,
  processUploadedFile
} from '../utils/data-pipeline.utils';
import type { UploadedFile } from './create-project.types';
import { projectStore } from './project.store.svelte';
import { logger, LogCategory } from '../utils/logger';

interface DatasetsState {
  datasets: ProcessedDataset[];
  selectedDatasetId?: string;
  isProcessing: boolean;
  error?: string;
}

class DatasetsStore {
  private _state = $state<DatasetsState>({
    datasets: [],
    isProcessing: false
  });

  get datasets() {
    return this._state.datasets;
  }

  get selectedDataset() {
    return this._state.datasets.find(
      (d) => d.id === this._state.selectedDatasetId
    );
  }

  get selectedDatasetId() {
    return this._state.selectedDatasetId;
  }

  get isProcessing() {
    return this._state.isProcessing;
  }

  addProcessedDataset(dataset: ProcessedDataset): void {
    this._state.datasets.push(dataset);
    if (!this._state.selectedDatasetId) {
      this._state.selectedDatasetId = dataset.id;
    }
  }

  get error() {
    return this._state.error;
  }

  async processFiles(files: UploadedFile[]): Promise<void> {
    this._state.isProcessing = true;
    this._state.error = undefined;

    try {
      logger.info('Processing files', LogCategory.DATA, {
        count: files.length,
        files: files.map(f => ({ name: f.name, hasData: !!f.parsedData }))
      });

      const filesCopy = files.map(file => {
        if (!file.parsedData) {
          logger.warn(`File ${file.name} has no parsedData`, LogCategory.DATA);
        }

        const cleanFile = {
          id: file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          fileType: file.fileType,
          status: file.status,
          uploadProgress: file.uploadProgress,
          errorMessage: file.errorMessage,
          validation: file.validation,
          parsedData: file.parsedData ? JSON.parse(JSON.stringify(file.parsedData)) : [],
          content: file.content,
          duplicates: file.duplicates,
          statistics: file.statistics,
          sourceType: file.sourceType
        };

        return cleanFile;
      });


      const newDatasets = await createDataPipeline(filesCopy);

      this._state.datasets = [...this._state.datasets, ...newDatasets];

      if (newDatasets.length > 0 && !this._state.selectedDatasetId) {
        this._state.selectedDatasetId = newDatasets[0].id;
      }
    } catch (error) {
      this._state.error =
        error instanceof Error ? error.message : 'Processing failed';
      throw error;
    } finally {
      this._state.isProcessing = false;
    }
  }

  async addFile(file: UploadedFile): Promise<void> {
    this._state.isProcessing = true;
    this._state.error = undefined;

    try {

      const fileCopy = {
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        fileType: file.fileType,
        status: file.status,
        uploadProgress: file.uploadProgress,
        errorMessage: file.errorMessage,
        validation: file.validation,
        parsedData: file.parsedData ? JSON.parse(JSON.stringify(file.parsedData)) : [],
        content: file.content,
        duplicates: file.duplicates,
        statistics: file.statistics,
        sourceType: file.sourceType
      };


      const dataset = await processUploadedFile(fileCopy);

      if (dataset) {
        this._state.datasets.push(dataset);

        if (!this._state.selectedDatasetId) {
          this._state.selectedDatasetId = dataset.id;
        }
      }
    } catch (error) {
      this._state.error =
        error instanceof Error ? error.message : 'Processing failed';
      throw error;
    } finally {
      this._state.isProcessing = false;
    }
  }

  selectDataset(datasetId: string): void {
    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    if (dataset) {
      this._state.selectedDatasetId = datasetId;
    }
  }

  removeDataset(datasetId: string): void {
    this._state.datasets = this._state.datasets.filter(
      (d) => d.id !== datasetId
    );

    if (this._state.selectedDatasetId === datasetId) {
      this._state.selectedDatasetId = this._state.datasets[0]?.id;
    }
  }

  getDatasetBySourceFile(sourceFileId: string): ProcessedDataset | undefined {
    return this._state.datasets.find((d) => d.sourceFileId === sourceFileId);
  }

  getDatasetsByType(hasGeometry: boolean): ProcessedDataset[] {
    return this._state.datasets.filter((d) =>
      hasGeometry ? !!d.geometry : !d.geometry
    );
  }

  getColumnValues(datasetId: string, columnName: string): any[] {
    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    if (!dataset) return [];

    return dataset.data.map((row) => row[columnName]);
  }

  getUniqueValues(datasetId: string, columnName: string): any[] {
    const values = this.getColumnValues(datasetId, columnName);
    return Array.from(new Set(values));
  }

  getColumnStatistics(datasetId: string, columnName: string) {
    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    if (!dataset) return null;

    const column = dataset.columns.find((c) => c.name === columnName);
    if (!column) return null;

    const values = this.getColumnValues(datasetId, columnName);
    const nonNullValues = values.filter((v) => v !== null && v !== undefined);

    if (column.type === 'number') {
      const numbers = nonNullValues.map(Number).filter((n) => !isNaN(n));
      return {
        min: Math.min(...numbers),
        max: Math.max(...numbers),
        mean: numbers.reduce((a, b) => a + b, 0) / numbers.length,
        median: this.calculateMedian(numbers),
        count: numbers.length,
        nullCount: values.length - numbers.length
      };
    }

    return {
      uniqueCount: new Set(nonNullValues).size,
      count: nonNullValues.length,
      nullCount: values.length - nonNullValues.length
    };
  }

  private calculateMedian(numbers: number[]): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  async syncWithProject(): Promise<void> {
    const currentProject = projectStore.currentProject;
    if (!currentProject?.data?.sourceFiles) {
      this.clear();
      return;
    }

    const currentFileIds = new Set(
      currentProject.data.sourceFiles.map((f) => f.id)
    );
    const existingFileIds = new Set(
      this._state.datasets.map((d) => d.sourceFileId)
    );

    const toRemove = this._state.datasets.filter(
      (d) => !currentFileIds.has(d.sourceFileId)
    );
    toRemove.forEach((d) => this.removeDataset(d.id));

    const toAdd = currentProject.data.sourceFiles.filter(
      (f) => !existingFileIds.has(f.id)
    );
    for (const file of toAdd) {
      await this.addFile(file);
    }
  }

  clear(): void {
    this._state.datasets = [];
    this._state.selectedDatasetId = undefined;
    this._state.error = undefined;
  }
}

export const datasetsStore = new DatasetsStore();
