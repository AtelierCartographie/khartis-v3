import { dataPipeline } from '$lib/features/data';
import type { DatasetResult } from '$lib/features/data';
import type { UploadedFile } from './create-project.types';
import { projectStore } from './project.store.svelte';
import { logger, LogCategory } from '../utils/logger';
import { sanitizeTextInput } from '../utils/sanitize.utils';

interface DatasetsState {
  datasets: DatasetResult[];
  selectedDatasetId?: string;
  isProcessing: boolean;
  error?: string;
}

class DatasetsStore {
  private _state = $state<DatasetsState>({
    datasets: [],
    isProcessing: false
  });

  constructor() {
    // DISABLED: Reactive sync causes triple processing
    // DataOrchestrator.onProjectChanged() already handles project file loading
    // This $effect was triggering addFile() for each file when project changes,
    // causing files to be processed multiple times
    // if (typeof window !== 'undefined') {
    //   $effect.root(() => {
    //     $effect(() => {
    //       const sourceFiles = projectStore.currentProject?.data?.sourceFiles;
    //       if (sourceFiles !== undefined) {
    //         void this.syncWithProject();
    //       }
    //     });
    //   });
    // }
  }

  get datasets() {
    return this._state.datasets;
  }

  get selectedDataset() {
    const dataset = this._state.datasets.find(
      (d) => d.id === this._state.selectedDatasetId
    );

    console.log('[datasetsStore] selectedDataset getter accessed', {
      selectedDatasetId: this._state.selectedDatasetId,
      found: !!dataset,
      datasetName: dataset?.name,
      datasetSourceFileId: dataset?.sourceFileId,
      datasetTableName: dataset?.tableName,
      totalDatasets: this._state.datasets.length,
      timestamp: new Date().toISOString()
    });

    return dataset;
  }

  get selectedDatasetId() {
    return this._state.selectedDatasetId;
  }

  get isProcessing() {
    return this._state.isProcessing;
  }

  addProcessedDataset(dataset: DatasetResult): void {
    // Force reactivity by creating a new array
    this._state.datasets = [...this._state.datasets, dataset];
    if (!this._state.selectedDatasetId) {
      this._state.selectedDatasetId = dataset.id;
    }
  }

  get error() {
    return this._state.error;
  }

  async processFiles(files: UploadedFile[]): Promise<void> {
    const startTime = performance.now();
    console.log(
      `[${new Date().toISOString()}] [datasetsStore:processFiles] START`,
      {
        fileCount: files.length
      }
    );

    this._state.isProcessing = true;
    this._state.error = undefined;

    try {
      logger.info('Processing files', LogCategory.DATA, {
        count: files.length,
        files: files.map((f) => ({ name: f.name, hasData: !!f.parsedData }))
      });

      console.log(
        `[${new Date().toISOString()}] [datasetsStore:processFiles] Processing with new dataPipeline...`
      );
      const pipelineStart = performance.now();

      // Process files in parallel using new unified dataPipeline
      const newDatasets = await Promise.all(
        files.map(async (file) => {
          if (!file.content && !file.originalFile) {
            logger.warn(`File ${file.name} has no content or originalFile`, LogCategory.DATA);
            throw new Error(`File ${file.name} has no content or originalFile`);
          }
          // Pass originalFile to avoid re-parsing already processed content
          return dataPipeline.processUploadedFile(file, file.originalFile);
        })
      );

      console.log(
        `[${new Date().toISOString()}] [datasetsStore:processFiles] Pipeline completed`,
        {
          duration: `${(performance.now() - pipelineStart).toFixed(2)}ms`,
          newDatasetsCount: newDatasets.length
        }
      );

      this._state.datasets = [...this._state.datasets, ...newDatasets];

      if (newDatasets.length > 0 && !this._state.selectedDatasetId) {
        this._state.selectedDatasetId = newDatasets[0].id;
      }

      const totalDuration = performance.now() - startTime;
      console.log(
        `[${new Date().toISOString()}] [datasetsStore:processFiles] END`,
        {
          totalDuration: `${totalDuration.toFixed(2)}ms`
        }
      );
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[${new Date().toISOString()}] [datasetsStore:processFiles] ERROR`,
        {
          duration: `${duration.toFixed(2)}ms`,
          error
        }
      );

      this._state.error =
        error instanceof Error ? error.message : 'Processing failed';
      throw error;
    } finally {
      this._state.isProcessing = false;
    }
  }

  async addFile(file: UploadedFile): Promise<void> {
    const startTime = performance.now();
    console.log(`[${new Date().toISOString()}] [datasetsStore:addFile] START`, {
      fileName: file.name,
      fileId: file.id
    });

    this._state.isProcessing = true;
    this._state.error = undefined;

    try {
      if (!file.content) {
        logger.warn(`File ${file.name} has no content`, LogCategory.DATA);
        throw new Error(`File ${file.name} has no content`);
      }

      console.log(
        `[${new Date().toISOString()}] [datasetsStore:addFile] Processing with new dataPipeline...`
      );
      const processStart = performance.now();
      const dataset = await dataPipeline.processUploadedFile(file, file.originalFile);
      console.log(
        `[${new Date().toISOString()}] [datasetsStore:addFile] File processed`,
        {
          duration: `${(performance.now() - processStart).toFixed(2)}ms`,
          hasDataset: !!dataset
        }
      );

      if (dataset) {
        // Check for duplicates by sourceFileId
        const existingDataset = this._state.datasets.find(
          (d) => d.sourceFileId === dataset.sourceFileId
        );

        if (existingDataset) {
          console.warn(`[${new Date().toISOString()}] [datasetsStore:addFile] Dataset with sourceFileId already exists, replacing it`, {
            existingDatasetId: existingDataset.id,
            newDatasetId: dataset.id,
            sourceFileId: dataset.sourceFileId
          });
          // Replace the existing dataset
          this._state.datasets = this._state.datasets.map((d) =>
            d.sourceFileId === dataset.sourceFileId ? dataset : d
          );
          // Update selection if we replaced the selected dataset
          if (this._state.selectedDatasetId === existingDataset.id) {
            this._state.selectedDatasetId = dataset.id;
          }
        } else {
          // Force reactivity by creating a new array
          this._state.datasets = [...this._state.datasets, dataset];
        }

        if (!this._state.selectedDatasetId) {
          this._state.selectedDatasetId = dataset.id;
        }

        console.log(`[${new Date().toISOString()}] [datasetsStore:addFile] Dataset added to store`, {
          datasetId: dataset.id,
          datasetName: dataset.name,
          sourceFileId: dataset.sourceFileId,
          totalDatasets: this._state.datasets.length,
          selectedDatasetId: this._state.selectedDatasetId,
          wasReplacement: !!existingDataset
        });
      }

      const totalDuration = performance.now() - startTime;
      console.log(`[${new Date().toISOString()}] [datasetsStore:addFile] END`, {
        totalDuration: `${totalDuration.toFixed(2)}ms`
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[${new Date().toISOString()}] [datasetsStore:addFile] ERROR`,
        {
          duration: `${duration.toFixed(2)}ms`,
          error
        }
      );

      this._state.error =
        error instanceof Error ? error.message : 'Processing failed';
      throw error;
    } finally {
      this._state.isProcessing = false;
    }
  }

  selectDataset(datasetId: string): void {
    console.log('[datasetsStore] selectDataset called', {
      datasetId,
      currentSelectedId: this._state.selectedDatasetId,
      totalDatasets: this._state.datasets.length
    });

    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    console.log('[datasetsStore] Dataset found?', {
      found: !!dataset,
      datasetName: dataset?.name
    });

    if (dataset) {
      this._state.selectedDatasetId = datasetId;
      console.log('[datasetsStore] Selected dataset updated', {
        newSelectedId: this._state.selectedDatasetId
      });
    }
  }

  removeDataset(datasetId: string): void {
    console.log('[datasetsStore] removeDataset called', {
      datasetId,
      currentSelectedId: this._state.selectedDatasetId,
      totalDatasetsBefore: this._state.datasets.length,
      willUpdateSelection: this._state.selectedDatasetId === datasetId
    });

    const filteredDatasets = this._state.datasets.filter(
      (d) => d.id !== datasetId
    );

    console.log('[datasetsStore] Filtered datasets', {
      totalDatasetsAfter: filteredDatasets.length,
      remainingIds: filteredDatasets.map(d => d.id)
    });

    if (this._state.selectedDatasetId === datasetId) {
      const newSelectedId = filteredDatasets[0]?.id;
      console.log('[datasetsStore] Updating selected dataset', {
        oldId: this._state.selectedDatasetId,
        newId: newSelectedId
      });
      this._state.selectedDatasetId = newSelectedId;
    }

    this._state.datasets = filteredDatasets;

    console.log('[datasetsStore] removeDataset complete', {
      finalSelectedId: this._state.selectedDatasetId,
      finalDatasetCount: this._state.datasets.length
    });
  }

  getAllDatasets(): DatasetResult[] {
    return this._state.datasets;
  }

  getDatasetBySourceFile(sourceFileId: string): DatasetResult | undefined {
    console.log('[datasetsStore] getDatasetBySourceFile called', {
      sourceFileId,
      totalDatasets: this._state.datasets.length,
      allSourceFileIds: this._state.datasets.map(d => d.sourceFileId)
    });

    const dataset = this._state.datasets.find((d) => d.sourceFileId === sourceFileId);
    console.log('[datasetsStore] getDatasetBySourceFile result', {
      found: !!dataset,
      datasetId: dataset?.id,
      datasetName: dataset?.name
    });

    return dataset;
  }

  getDatasetsByType(hasGeometry: boolean): DatasetResult[] {
    return this._state.datasets.filter((d) =>
      hasGeometry ? !!d.geometry : !d.geometry
    );
  }

  getColumnValues(datasetId: string, columnName: string): any[] {
    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    if (!dataset || !dataset.data) return [];

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

  private async syncWithProject(): Promise<void> {
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

  resetDataset(datasetId: string): boolean {
    const datasetIndex = this._state.datasets.findIndex(
      (d) => d.id === datasetId
    );

    if (datasetIndex === -1) {
      logger.warn(`Dataset ${datasetId} not found`, LogCategory.DATA);
      return false;
    }

    const dataset = this._state.datasets[datasetIndex];

    if (!dataset.originalData) {
      logger.warn(
        `Dataset ${datasetId} has no original data to reset`,
        LogCategory.DATA
      );
      return false;
    }

    logger.info(`Resetting dataset ${dataset.name}`, LogCategory.DATA);

    const resetDataset = {
      ...dataset,
      columns: structuredClone(dataset.originalData.columns),
      data: structuredClone(dataset.originalData.data),
      rowCount: dataset.originalData.rowCount,
      metadata: {
        ...dataset.metadata,
        transformations: []
      }
    };

    this._state.datasets = [
      ...this._state.datasets.slice(0, datasetIndex),
      resetDataset,
      ...this._state.datasets.slice(datasetIndex + 1)
    ];

    logger.success(
      `Dataset ${dataset.name} reset to original state`,
      LogCategory.DATA
    );
    return true;
  }

  hasModifications(datasetId: string): boolean {
    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    return dataset
      ? (dataset.metadata.transformations?.length ?? 0) > 0
      : false;
  }

  renameDataset(datasetId: string, newName: string): boolean {
    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    if (!dataset) {
      logger.warn(`Dataset ${datasetId} not found`, LogCategory.DATA);
      return false;
    }

    const sanitizedName = sanitizeTextInput(newName);
    if (!sanitizedName) {
      logger.warn('Cannot rename dataset with empty name', LogCategory.DATA);
      return false;
    }

    dataset.name = sanitizedName;
    logger.info(`Dataset renamed to ${sanitizedName}`, LogCategory.DATA);
    return true;
  }

  clear(): void {
    this._state.datasets = [];
    this._state.selectedDatasetId = undefined;
    this._state.error = undefined;
  }
}

export const datasetsStore = new DatasetsStore();
