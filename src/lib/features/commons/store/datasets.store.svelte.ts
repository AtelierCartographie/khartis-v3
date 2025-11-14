import { dataPipeline } from '$lib/features/data';
import type { DatasetResult } from '$lib/features/data';
import type { UploadedFile } from './create-project.types';
import { logger, LogCategory } from '../utils/logger';
import { sanitizeTextInput } from '../utils/sanitize.utils';
import { DuplicateFileError } from '../errors/pipeline.errors';

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

  private activeOperations = 0;

  private pendingDatasetResolvers = new Map<
    string,
    Array<(datasetId: string) => void>
  >();

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

    logger.debug('Selected dataset accessed', LogCategory.STORE, {
      selectedDatasetId: this._state.selectedDatasetId,
      found: !!dataset,
      datasetName: dataset?.name,
      datasetSourceFileId: dataset?.sourceFileId,
      datasetTableName: dataset?.tableName,
      totalDatasets: this._state.datasets.length
    });

    return dataset;
  }

  get selectedDatasetId() {
    return this._state.selectedDatasetId;
  }

  get isProcessing() {
    return this._state.isProcessing;
  }

  private startProcessing(): void {
    this.activeOperations++;
    this._state.isProcessing = true;
  }

  private endProcessing(): void {
    this.activeOperations = Math.max(0, this.activeOperations - 1);
    if (this.activeOperations === 0) {
      this._state.isProcessing = false;
    }
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
    const endTiming = logger.startTiming(
      'Process files in store',
      LogCategory.STORE
    );

    logger.info('Processing files in store', LogCategory.STORE, {
      fileCount: files.length
    });

    this.startProcessing();
    this._state.error = undefined;

    try {
      logger.info('Processing files via dataPipeline', LogCategory.DATA, {
        count: files.length,
        files: files.map((f) => ({ name: f.name, hasData: !!f.parsedData }))
      });

      const pipelineStart = performance.now();
      const newDatasets = await Promise.all(
        files.map(async (file) => {
          if (!file.content && !file.originalFile) {
            logger.warn(
              `File ${file.name} has no content or originalFile`,
              LogCategory.DATA
            );
            throw new Error(`File ${file.name} has no content or originalFile`);
          }
          return dataPipeline.processUploadedFile(file, file.originalFile);
        })
      );

      const pipelineDuration = performance.now() - pipelineStart;
      logger.success('Pipeline processing complete', LogCategory.DATA, {
        duration: `${pipelineDuration.toFixed(2)}ms`,
        newDatasetsCount: newDatasets.length
      });

      this._state.datasets = [...this._state.datasets, ...newDatasets];

      if (newDatasets.length > 0 && !this._state.selectedDatasetId) {
        this._state.selectedDatasetId = newDatasets[0].id;
      }

      endTiming();
      logger.success('Files processing complete in store', LogCategory.STORE);
    } catch (error) {
      logger.error('Files processing failed', LogCategory.STORE, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this._state.error =
        error instanceof Error ? error.message : 'Processing failed';
      throw error;
    } finally {
      this.endProcessing();
    }
  }

  async addFile(file: UploadedFile): Promise<DatasetResult | null> {
    const startTime = performance.now();
    logger.debug(`[${new Date().toISOString()}] [datasetsStore:addFile] START`, {
      fileName: file.name,
      fileId: file.id
    });

    this.startProcessing();
    this._state.error = undefined;
    let addedDataset: DatasetResult | null = null;

    try {
      if (!file.content) {
        logger.warn(`File ${file.name} has no content`, LogCategory.DATA);
        throw new Error(`File ${file.name} has no content`);
      }

      logger.debug(
        `[${new Date().toISOString()}] [datasetsStore:addFile] Processing with new dataPipeline...`
      );
      const processStart = performance.now();
      const dataset = await dataPipeline.processUploadedFile(
        file,
        file.originalFile
      );
      logger.debug(
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
          logger.warn(
            `[${new Date().toISOString()}] [datasetsStore:addFile] Dataset with sourceFileId already exists, replacing it`,
            {
              existingDatasetId: existingDataset.id,
              newDatasetId: dataset.id,
              sourceFileId: dataset.sourceFileId
            }
          );

          // Replace the existing dataset
          this._state.datasets = this._state.datasets.map((d) =>
            d.sourceFileId === dataset.sourceFileId ? dataset : d
          );
          // Update selection if we replaced the selected dataset
          if (this._state.selectedDatasetId === existingDataset.id) {
            this._state.selectedDatasetId = dataset.id;
          }

          addedDataset = dataset;
          // Throw non-fatal error to show warning toast (won't trigger rollback)
          throw new DuplicateFileError(
            `Le fichier "${file.name}" existe déjà et a été remplacé`,
            file.name,
            {
              existingDatasetId: existingDataset.id,
              newDatasetId: dataset.id
            }
          );
        } else {
          // Force reactivity by creating a new array
          this._state.datasets = [...this._state.datasets, dataset];
        }

        if (!this._state.selectedDatasetId) {
          this._state.selectedDatasetId = dataset.id;
        }

        addedDataset = dataset;

        logger.debug(
          `[${new Date().toISOString()}] [datasetsStore:addFile] Dataset added to store`,
          {
            datasetId: dataset.id,
            datasetName: dataset.name,
            sourceFileId: dataset.sourceFileId,
            totalDatasets: this._state.datasets.length,
            selectedDatasetId: this._state.selectedDatasetId,
            wasReplacement: !!existingDataset
          }
        );

        const pendingResolvers = this.pendingDatasetResolvers.get(
          dataset.sourceFileId
        );
        if (pendingResolvers?.length) {
          pendingResolvers.forEach((resolve) => resolve(dataset.id));
          this.pendingDatasetResolvers.delete(dataset.sourceFileId);
        }
      }

      const totalDuration = performance.now() - startTime;
      logger.debug(`[${new Date().toISOString()}] [datasetsStore:addFile] END`, {
        totalDuration: `${totalDuration.toFixed(2)}ms`
      });

      return addedDataset;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error(
        `Failed to add file to datasets store (duration: ${duration.toFixed(2)}ms)`,
        LogCategory.DATA,
        error
      );

      this._state.error =
        error instanceof Error ? error.message : 'Processing failed';
      throw error;
    } finally {
      this.endProcessing();
    }
  }

  selectDataset(datasetId: string): void {
    logger.debug('[datasetsStore] selectDataset called', {
      datasetId,
      currentSelectedId: this._state.selectedDatasetId,
      totalDatasets: this._state.datasets.length
    });

    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    logger.debug('[datasetsStore] Dataset found?', {
      found: !!dataset,
      datasetName: dataset?.name
    });

    if (dataset) {
      this._state.selectedDatasetId = datasetId;
      logger.debug('[datasetsStore] Selected dataset updated', {
        newSelectedId: this._state.selectedDatasetId
      });
    }
  }

  removeDataset(datasetId: string): void {
    logger.debug('[datasetsStore] removeDataset called', {
      datasetId,
      currentSelectedId: this._state.selectedDatasetId,
      totalDatasetsBefore: this._state.datasets.length,
      willUpdateSelection: this._state.selectedDatasetId === datasetId
    });

    const filteredDatasets = this._state.datasets.filter(
      (d) => d.id !== datasetId
    );

    logger.debug('[datasetsStore] Filtered datasets', {
      totalDatasetsAfter: filteredDatasets.length,
      remainingIds: filteredDatasets.map((d) => d.id)
    });

    if (this._state.selectedDatasetId === datasetId) {
      const newSelectedId = filteredDatasets[0]?.id;
      logger.debug('[datasetsStore] Updating selected dataset', {
        oldId: this._state.selectedDatasetId,
        newId: newSelectedId
      });
      this._state.selectedDatasetId = newSelectedId;
    }

    this._state.datasets = filteredDatasets;

    logger.debug('[datasetsStore] removeDataset complete', {
      finalSelectedId: this._state.selectedDatasetId,
      finalDatasetCount: this._state.datasets.length
    });
  }

  getAllDatasets(): DatasetResult[] {
    return this._state.datasets;
  }

  getDatasetBySourceFile(sourceFileId: string): DatasetResult | undefined {
    logger.debug('[datasetsStore] getDatasetBySourceFile called', {
      sourceFileId,
      totalDatasets: this._state.datasets.length,
      allSourceFileIds: this._state.datasets.map((d) => d.sourceFileId)
    });

    const dataset = this._state.datasets.find(
      (d) => d.sourceFileId === sourceFileId
    );
    logger.debug('[datasetsStore] getDatasetBySourceFile result', {
      found: !!dataset,
      datasetId: dataset?.id,
      datasetName: dataset?.name
    });

    return dataset;
  }

  waitForDatasetBySourceFile(sourceFileId: string): Promise<string> {
    const existing = this.getDatasetBySourceFile(sourceFileId);
    if (existing) {
      return Promise.resolve(existing.id);
    }

    return new Promise((resolve) => {
      const resolvers = this.pendingDatasetResolvers.get(sourceFileId) ?? [];
      resolvers.push(resolve);
      this.pendingDatasetResolvers.set(sourceFileId, resolvers);
    });
  }

  getDatasetsByType(hasGeometry: boolean): DatasetResult[] {
    return this._state.datasets.filter((d) =>
      hasGeometry ? !!d.geometry : !d.geometry
    );
  }

  getColumnValues(datasetId: string, columnName: string): unknown[] {
    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    if (!dataset || !dataset.data) return [];

    return dataset.data.map((row) => row[columnName]);
  }

  getUniqueValues(datasetId: string, columnName: string): unknown[] {
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

  recordTransformation(datasetId: string, description: string): void {
    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    if (!dataset) {
      logger.warn(
        `Cannot record transformation, dataset ${datasetId} not found`,
        LogCategory.DATA
      );
      return;
    }

    const entry = `${new Date().toISOString()} - ${description}`;
    const updatedTransformations = [
      ...(dataset.metadata.transformations ?? []),
      entry
    ];

    this._state.datasets = this._state.datasets.map((d) =>
      d.id === datasetId
        ? {
            ...d,
            metadata: {
              ...d.metadata,
              transformations: updatedTransformations
            }
          }
        : d
    );
  }

  updateDatasetRowCount(datasetId: string, rowCount: number): void {
    this._state.datasets = this._state.datasets.map((d) =>
      d.id === datasetId
        ? {
            ...d,
            rowCount,
            metadata: {
              ...d.metadata
            }
          }
        : d
    );
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

  updateDatasetTableName(datasetId: string, tableName: string): void {
    this._state.datasets = this._state.datasets.map((dataset) =>
      dataset.id === datasetId ? { ...dataset, tableName } : dataset
    );
  }

  clear(): void {
    this._state.datasets = [];
    this._state.selectedDatasetId = undefined;
    this._state.error = undefined;
  }
}

export const datasetsStore = new DatasetsStore();
