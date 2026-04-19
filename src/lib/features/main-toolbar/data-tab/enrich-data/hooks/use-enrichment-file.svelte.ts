import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { FileValidator } from '$lib/features/commons/utils/file-validator.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { dataPipeline, isZipDatasetResult } from '$lib/features/data-pipeline';
import { Duck } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';

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

export function useEnrichmentFile(): UseEnrichmentFileReturn {
  let enrichmentFile = $state<File | null>(null);
  let enrichmentDataset = $state<DatasetResult | null>(null);
  let isUploading = $state(false);
  let uploadError = $state<string | null>(null);
  let pastedDataValue = $state('');
  let onlineUrlValue = $state('');

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
      logger.warn(
        'Failed to cleanup enrichment temporary table',
        LogCategory.DATA,
        { tableName: dataset.tableName, error }
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
