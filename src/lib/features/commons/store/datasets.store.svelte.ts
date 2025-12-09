import type { DatasetResult } from '$lib/features/data-pipeline';
import { dataPipeline } from '$lib/features/data-pipeline';
import { DuplicateFileError } from '../errors/pipeline.errors';
import { LogCategory, logger } from '../utils/logger';
import { sanitizeTextInput } from '../utils/sanitize.utils';
import type { UploadedFile } from './create-project.types';
import { ProcessingSemaphore } from '../utils/processing-semaphore';
import { projectStore } from './project.store.svelte';

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

  // Semaphore to limit concurrent file processing to prevent memory exhaustion
  private processingSemaphore = new ProcessingSemaphore(2);

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
    this.startProcessing();
    this._state.error = undefined;

    try {
      logger.info(
        `Processing ${files.length} files with semaphore (max 2 concurrent)`,
        LogCategory.STORE
      );

      // Process files with semaphore to limit concurrent operations
      const newDatasets = await Promise.all(
        files.map(async (file) => {
          return this.processingSemaphore.run(async () => {
            logger.debug(
              `Processing file: ${file.name} (active: ${this.processingSemaphore.activeCount}, queued: ${this.processingSemaphore.queuedCount})`,
              LogCategory.STORE
            );

            if (!file.content && !file.originalFile) {
              throw new Error(
                `File ${file.name} has no content or originalFile`
              );
            }

            const dataset = await dataPipeline.processUploadedFile(
              file,
              file.originalFile
            );

            logger.debug(
              `Completed processing: ${file.name}`,
              LogCategory.STORE
            );
            return dataset;
          });
        })
      );

      this._state.datasets = [...this._state.datasets, ...newDatasets];

      if (newDatasets.length > 0 && !this._state.selectedDatasetId) {
        this._state.selectedDatasetId = newDatasets[0].id;
      }

      logger.success(
        `All ${files.length} files processed successfully`,
        LogCategory.STORE
      );
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

    this.startProcessing();
    this._state.error = undefined;
    let addedDataset: DatasetResult | null = null;

    try {
      // Use semaphore for single file processing to maintain consistency
      const dataset = await this.processingSemaphore.run(async () => {
        if (!file.content && !file.originalFile) {
          throw new Error(`File ${file.name} has no content or originalFile`);
        }

        logger.debug(
          `Processing single file: ${file.name} (active: ${this.processingSemaphore.activeCount})`,
          LogCategory.STORE
        );

        return await dataPipeline.processUploadedFile(file, file.originalFile);
      });

      if (dataset) {
        // Check for duplicates by sourceFileId
        const existingDataset = this._state.datasets.find(
          (d) => d.sourceFileId === dataset.sourceFileId
        );

        if (existingDataset) {
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

        const pendingResolvers = this.pendingDatasetResolvers.get(
          dataset.sourceFileId
        );
        if (pendingResolvers?.length) {
          pendingResolvers.forEach((resolve) => resolve(dataset.id));
          this.pendingDatasetResolvers.delete(dataset.sourceFileId);
        }
      }

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
    const dataset = this._state.datasets.find((d) => d.id === datasetId);

    if (dataset) {
      this._state.selectedDatasetId = datasetId;
    }
  }

  removeDataset(datasetId: string): void {
    const filteredDatasets = this._state.datasets.filter(
      (d) => d.id !== datasetId
    );

    if (this._state.selectedDatasetId === datasetId) {
      const newSelectedId = filteredDatasets[0]?.id;
      this._state.selectedDatasetId = newSelectedId;
    }

    this._state.datasets = filteredDatasets;
  }

  updateDataset(
    datasetId: string,
    updates: Partial<Pick<DatasetResult, 'tableName' | 'columns'>>
  ): void {
    const datasetIndex = this._state.datasets.findIndex(
      (d) => d.id === datasetId
    );

    if (datasetIndex === -1) {
      logger.warn('Dataset not found for update', LogCategory.STORE, {
        datasetId
      });
      return;
    }

    const updatedDataset = {
      ...this._state.datasets[datasetIndex],
      ...updates
    };

    this._state.datasets = [
      ...this._state.datasets.slice(0, datasetIndex),
      updatedDataset,
      ...this._state.datasets.slice(datasetIndex + 1)
    ];

    logger.debug('Dataset updated', LogCategory.STORE, {
      datasetId,
      updates: Object.keys(updates)
    });
  }

  getAllDatasets(): DatasetResult[] {
    return this._state.datasets;
  }

  getDatasetBySourceFile(sourceFileId: string): DatasetResult | undefined {
    const dataset = this._state.datasets.find(
      (d) => d.sourceFileId === sourceFileId
    );

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

  async resetDataset(datasetId: string): Promise<boolean> {
    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    if (!dataset) {
      logger.warn('Dataset not found for reset', LogCategory.STORE, {
        datasetId
      });
      return false;
    }

    const sourceFile = projectStore.currentProject?.data?.sourceFiles?.find(
      (f) => f.id === dataset.sourceFileId
    );

    if (!sourceFile) {
      logger.warn('Source file not found for reset', LogCategory.STORE, {
        datasetId,
        sourceFileId: dataset.sourceFileId
      });
      return false;
    }

    if (!sourceFile.content && !sourceFile.originalFile) {
      logger.warn('Source file has no content for reset', LogCategory.STORE, {
        datasetId,
        fileName: sourceFile.name
      });
      return false;
    }

    try {
      this.startProcessing();

      const { duckDBOrchestrator } = await import('$lib/features/duckdb');
      await duckDBOrchestrator.dropTable(dataset.tableName);
      duckDBOrchestrator.clearFilters(dataset.tableName);

      this._state.datasets = this._state.datasets.filter(
        (d) => d.id !== datasetId
      );

      const newDataset = await dataPipeline.processUploadedFile(
        sourceFile,
        sourceFile.originalFile
      );

      const resetDataset = {
        ...newDataset,
        id: datasetId
      };

      this._state.datasets = [...this._state.datasets, resetDataset];

      await duckDBOrchestrator.registerExistingTable(
        resetDataset.tableName,
        resetDataset.sourceFileId,
        resetDataset.name,
        {
          geoDetection: resetDataset.geoDetection
        }
      );

      await projectStore.clearColumnTransformations(sourceFile.id);

      duckDBOrchestrator.bumpDatasetsVersion();

      logger.success('Dataset reset successfully', LogCategory.STORE, {
        datasetId: resetDataset.id,
        tableName: resetDataset.tableName
      });

      return true;
    } catch (error) {
      logger.error('Failed to reset dataset', LogCategory.STORE, error);
      return false;
    } finally {
      this.endProcessing();
    }
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

  renameDatasetColumn(
    datasetId: string,
    oldName: string,
    newName: string
  ): void {
    this._state.datasets = this._state.datasets.map((d) => {
      if (d.id !== datasetId) return d;

      const updatedColumns = d.columns.map((col) =>
        col.name === oldName ? { ...col, name: newName } : col
      );

      const updatedAnalysisColumns = d.analysis?.columns?.map((col) =>
        col.name === oldName ? { ...col, name: newName } : col
      );

      return {
        ...d,
        columns: updatedColumns,
        analysis: d.analysis
          ? { ...d.analysis, columns: updatedAnalysisColumns ?? [] }
          : undefined
      };
    });
  }

  async renameDataset(datasetId: string, newName: string): Promise<boolean> {
    const dataset = this._state.datasets.find((d) => d.id === datasetId);
    if (!dataset) {
      return false;
    }

    const sanitizedName = sanitizeTextInput(newName);
    if (!sanitizedName) {
      return false;
    }

    dataset.name = sanitizedName;

    if (dataset.sourceFileId) {
      await projectStore.renameFile(dataset.sourceFileId, sanitizedName);
    }

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
