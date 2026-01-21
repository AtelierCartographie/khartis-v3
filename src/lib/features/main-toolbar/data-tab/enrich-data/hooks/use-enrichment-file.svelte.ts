import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { dataPipeline, isZipDatasetResult } from '$lib/features/data-pipeline';
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
      enrichmentDataset = dataset;
      enrichmentFile = file;

      dataTabActions.setEnrichDataState({
        enrichmentDatasetId: dataset.id,
        isEnrichmentActive: true
      });

      logger.success('Enrichment file loaded', LogCategory.DATA, {
        fileName: file.name,
        rowCount: dataset.rowCount
      });
    } catch (error) {
      logger.error('Failed to load enrichment file', LogCategory.DATA, error);
      uploadError =
        error instanceof Error ? error.message : m.error_loading_default();
    } finally {
      isUploading = false;
    }
  }

  async function handleLoadOnlineFile(): Promise<void> {
    if (!onlineUrlValue.trim()) return;

    isUploading = true;
    uploadError = null;

    try {
      const result = await dataPipeline.processRemoteFile(onlineUrlValue);
      const dataset: DatasetResult = isZipDatasetResult(result)
        ? result.datasets[0]
        : result;
      enrichmentDataset = dataset;
      enrichmentFile = null;
      onlineUrlValue = '';

      dataTabActions.setEnrichDataState({
        enrichmentDatasetId: dataset.id,
        isEnrichmentActive: true
      });
    } catch (error) {
      uploadError =
        error instanceof Error ? error.message : m.error_loading_default();
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
      enrichmentDataset = dataset;
      enrichmentFile = null;
      pastedDataValue = '';

      dataTabActions.setEnrichDataState({
        enrichmentDatasetId: dataset.id,
        isEnrichmentActive: true
      });

      logger.success('Pasted data loaded', LogCategory.DATA, {
        rowCount: dataset.rowCount
      });
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
    enrichmentDataset = null;
    enrichmentFile = null;
    uploadError = null;

    dataTabActions.setEnrichDataState({
      enrichmentDatasetId: undefined,
      enrichmentColumn: undefined,
      targetColumn: undefined,
      isEnrichmentActive: false
    });
  }

  function setPastedDataValue(value: string): void {
    pastedDataValue = value;
  }

  function setOnlineUrlValue(value: string): void {
    onlineUrlValue = value;
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
