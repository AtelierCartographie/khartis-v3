import {
  dataTabActions,
  dataTabState
} from '$lib/features/commons/stores/data-tab.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type {
  DatasetResult,
  EnrichedColumn
} from '$lib/features/data-pipeline';
import {
  ColumnType,
  dataPipeline,
  isZipDatasetResult
} from '$lib/features/data-pipeline';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import type { DuckDBDataset } from '$lib/features/duckdb/types';
import * as m from '$lib/paraglide/messages';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { FileValidator } from '$lib/features/commons/utils/file-validator.utils';

export interface UseEnrichmentFileReturn {
  readonly enrichmentFile: File | null;
  readonly enrichmentDataset: DatasetResult | null;
  readonly isUploading: boolean;
  readonly uploadError: string | null;
  readonly pastedDataValue: string;
  readonly onlineUrlValue: string;
  handleFileUpload: (files: readonly File[]) => Promise<void>;
  handlePasteData: () => Promise<void>;
  handleLoadOnlineFile: () => Promise<void>;
  handleRemoveFile: () => void;
  setPastedDataValue: (value: string) => void;
  setOnlineUrlValue: (value: string) => void;
}

let enrichmentFile = $state<File | null>(null);
let enrichmentDataset = $state<DatasetResult | null>(null);
let isUploading = $state(false);
let uploadError = $state<string | null>(null);
let pastedDataValue = $state('');
let onlineUrlValue = $state('');

export function useEnrichmentFile(): UseEnrichmentFileReturn {
  function validateOnlineUrl(url: string): string | null {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      return m.error_url_required();
    }

    const validation = FileValidator.validateURL(trimmedUrl);
    if (!validation.isValid) {
      return m.error_url_invalid({ urls: trimmedUrl });
    }

    return null;
  }

  function toUserFriendlyOnlineLoadError(error: unknown): string {
    if (!(error instanceof Error)) {
      return m.error_loading_default();
    }

    const normalizedMessage = error.message.toLowerCase();
    const isNetworkError =
      normalizedMessage.includes('networkerror') ||
      normalizedMessage.includes("failed to execute 'send'") ||
      normalizedMessage.includes('failed to load') ||
      normalizedMessage.includes('cors');

    if (isNetworkError) {
      return m.error_loading_default();
    }

    return error.message;
  }

  function toColumnType(typeSimple: unknown): ColumnType {
    switch (typeSimple) {
      case 'numeric':
        return ColumnType.NUMBER;
      case 'boolean':
        return ColumnType.BOOLEAN;
      case 'date':
        return ColumnType.DATE;
      case 'geometry':
        return ColumnType.GEOMETRY;
      default:
        return ColumnType.TEXT;
    }
  }

  function toEnrichedColumn(
    column: DuckDBDataset['columns'][number],
    rowCount: number
  ): EnrichedColumn {
    const type = toColumnType(column.type_simple);
    return {
      name: column.name,
      type,
      stats: {
        name: column.name,
        type,
        count: column.count ?? rowCount,
        nulls: column.nulls ?? 0,
        uniques: column.uniques ?? 0,
        min: column.min,
        max: column.max
      }
    };
  }

  function toDatasetResult(dataset: DuckDBDataset): DatasetResult {
    return {
      id: dataset.id,
      name: dataset.name,
      sourceFileId: dataset.sourceFileId,
      tableName: dataset.tableName,
      columns: dataset.columns.map((column) =>
        toEnrichedColumn(column, dataset.rowCount)
      ),
      rowCount: dataset.rowCount,
      metadata: {
        processedAt: dataset.metadata.processedAt,
        fileType: String(dataset.metadata.fileType),
        parserUsed: 'duckdb'
      },
      geoDetection: dataset.geoDetection,
      joinedBasemap: dataset.joinedBasemap,
      geoColumn: dataset.geoColumn
    };
  }

  function findRuntimeDataset(datasetId: string): DatasetResult | null {
    const storedDataset =
      datasetsStore.datasets.find((dataset) => dataset.id === datasetId) ??
      null;
    if (storedDataset) {
      return storedDataset;
    }

    const duckDataset =
      duckDBOrchestrator.getDataset(datasetId) ??
      duckDBOrchestrator.getDatasetBySourceFile(datasetId);

    return duckDataset ? toDatasetResult(duckDataset) : null;
  }

  async function cleanupEnrichmentTable(
    dataset: DatasetResult | null
  ): Promise<void> {
    if (!dataset?.tableName || !Duck) return;

    const isTrackedByDatasetsStore = datasetsStore.datasets.some(
      (trackedDataset) => trackedDataset.tableName === dataset.tableName
    );

    if (isTrackedByDatasetsStore) {
      return;
    }

    try {
      await Duck.dropTable(dataset.tableName);
    } catch (error) {
      logger.error(
        'Failed to cleanup enrichment table',
        LogCategory.DATA,
        error
      );
    }
  }

  async function replaceEnrichmentDataset(
    dataset: DatasetResult,
    file: File | null
  ): Promise<void> {
    const previousDataset = enrichmentDataset;

    enrichmentDataset = dataset;
    enrichmentFile = file;

    dataTabActions.setEnrichDataState({
      enrichmentDatasetId: dataset.id,
      enrichmentColumn: undefined,
      targetColumn: undefined,
      isEnrichmentActive: true
    });

    await cleanupEnrichmentTable(previousDataset);
  }

  async function handleFileUpload(files: readonly File[]): Promise<void> {
    if (!files || files.length === 0) return;

    const file = files[0];
    const ext = file.name.toLowerCase().split('.').pop();

    if (!['csv', 'tsv', 'txt'].includes(ext || '')) {
      uploadError = m.error_upload_unsupported_format();
      return;
    }

    isUploading = true;
    uploadError = null;

    try {
      const result = await dataPipeline.processFile(file);
      const dataset: DatasetResult = isZipDatasetResult(result)
        ? result.datasets[0]
        : result;
      await replaceEnrichmentDataset(dataset, file);
    } catch (error) {
      logger.error('Failed to load enrichment file', LogCategory.DATA, error);
      uploadError =
        error instanceof Error ? error.message : m.error_loading_default();
    } finally {
      isUploading = false;
    }
  }

  async function handleLoadOnlineFile(): Promise<void> {
    const validationError = validateOnlineUrl(onlineUrlValue);
    if (validationError) {
      uploadError = validationError;
      return;
    }

    isUploading = true;
    uploadError = null;

    try {
      const result = await dataPipeline.processRemoteFile(onlineUrlValue);
      const dataset: DatasetResult = isZipDatasetResult(result)
        ? result.datasets[0]
        : result;
      await replaceEnrichmentDataset(dataset, null);
      onlineUrlValue = '';
    } catch (error) {
      logger.error(
        'Failed to load online enrichment file',
        LogCategory.DATA,
        error
      );
      uploadError = toUserFriendlyOnlineLoadError(error);
    } finally {
      isUploading = false;
    }
  }

  async function handlePasteData(): Promise<void> {
    if (!pastedDataValue.trim()) return;

    isUploading = true;
    uploadError = null;

    try {
      const result = await dataPipeline.processPastedData(pastedDataValue);
      const dataset: DatasetResult = isZipDatasetResult(result)
        ? result.datasets[0]
        : result;
      await replaceEnrichmentDataset(dataset, null);
      pastedDataValue = '';
    } catch (error) {
      logger.error('Failed to load pasted data', LogCategory.DATA, error);
      uploadError =
        error instanceof Error
          ? error.message
          : m.error_pasted_data_invalid_message();
    } finally {
      isUploading = false;
    }
  }

  function handleRemoveFile(): void {
    const previousDataset = enrichmentDataset;
    enrichmentDataset = null;
    enrichmentFile = null;
    uploadError = null;
    pastedDataValue = '';
    onlineUrlValue = '';

    dataTabActions.setEnrichDataState({
      enrichmentDatasetId: undefined,
      enrichmentColumn: undefined,
      targetColumn: undefined,
      isEnrichmentActive: false
    });

    void cleanupEnrichmentTable(previousDataset);
  }

  function setPastedDataValue(value: string): void {
    pastedDataValue = value;
  }

  function setOnlineUrlValue(value: string): void {
    onlineUrlValue = value;
    if (uploadError) {
      uploadError = null;
    }
  }

  $effect(() => {
    const persistedDatasetId = dataTabState.enrichData.enrichmentDatasetId;
    if (!persistedDatasetId || enrichmentDataset?.id === persistedDatasetId) {
      return;
    }

    const restoredDataset = findRuntimeDataset(persistedDatasetId);
    if (!restoredDataset) {
      return;
    }

    enrichmentDataset = restoredDataset;
    enrichmentFile = null;
  });

  return {
    get enrichmentFile() {
      return enrichmentFile;
    },
    get enrichmentDataset() {
      return enrichmentDataset;
    },
    get isUploading() {
      return isUploading;
    },
    get uploadError() {
      return uploadError;
    },
    get pastedDataValue() {
      return pastedDataValue;
    },
    get onlineUrlValue() {
      return onlineUrlValue;
    },
    handleFileUpload,
    handlePasteData,
    handleLoadOnlineFile,
    handleRemoveFile,
    setPastedDataValue,
    setOnlineUrlValue
  };
}
