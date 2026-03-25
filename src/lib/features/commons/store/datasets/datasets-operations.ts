import type { DatasetResult } from '$lib/features/data-pipeline';
import { dataPipeline, isZipDatasetResult } from '$lib/features/data-pipeline';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import type { UploadedFile } from '../create-project.types';
import { DataSourceType, FileType } from '../create-project.types';
import { FileStatus } from '../../constants/ui.constants';
import type { DatasetsState } from './datasets-state.svelte';
import { startProcessing, endProcessing } from './datasets-state.svelte';
import { LogCategory, logger } from '../../utils/logger';
import * as m from '$lib/paraglide/messages';
import { projectStore } from '../project.store.svelte';

export async function resetDataset(
  state: DatasetsState,
  datasetId: string
): Promise<boolean> {
  const dataset = state.datasets.find((d) => d.id === datasetId);
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

  if (sourceFile.isVirtualCopy) {
    logger.warn('Cannot reset a duplicated dataset', LogCategory.STORE, {
      datasetId
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
    startProcessing();

    await duckDBOrchestrator.dropTable(dataset.tableName);
    duckDBOrchestrator.clearFilters(dataset.tableName);

    state.datasets = state.datasets.filter((d) => d.id !== datasetId);

    const result = await dataPipeline.processUploadedFile(
      sourceFile,
      sourceFile.originalFile
    );

    const newDataset: DatasetResult = isZipDatasetResult(result)
      ? result.datasets[0]
      : result;

    const resetDatasetResult: DatasetResult = {
      ...newDataset,
      id: datasetId
    };

    state.datasets = [...state.datasets, resetDatasetResult];

    await duckDBOrchestrator.registerExistingTable(
      resetDatasetResult.tableName,
      resetDatasetResult.sourceFileId,
      resetDatasetResult.name,
      {
        geoDetection: resetDatasetResult.geoDetection
      }
    );

    await projectStore.clearColumnTransformations(sourceFile.id);

    duckDBOrchestrator.bumpDatasetsVersion();

    return true;
  } catch (error) {
    logger.error('Failed to reset dataset', LogCategory.STORE, error);
    return false;
  } finally {
    endProcessing();
  }
}

export async function duplicateDataset(
  state: DatasetsState,
  datasetId: string
): Promise<string | null> {
  const dataset = state.datasets.find((d) => d.id === datasetId);
  if (!dataset) {
    logger.warn('Dataset not found for duplication', LogCategory.STORE, {
      datasetId
    });
    return null;
  }

  try {
    startProcessing();

    const newId = crypto.randomUUID();
    const newTableName = `dataset_${newId.replace(/-/g, '_')}`;
    const copyName = `${dataset.name}${m.copy_suffix()}`;

    await Duck.query(
      `CREATE TABLE "${escapeIdentifier(newTableName)}" AS SELECT * FROM "${escapeIdentifier(dataset.tableName)}"`
    );

    const originalFile = projectStore.currentProject?.data?.sourceFiles?.find(
      (f) => f.id === dataset.sourceFileId
    );

    const virtualFileId = crypto.randomUUID();
    const virtualFile: UploadedFile = {
      id: virtualFileId,
      name: copyName,
      size: originalFile?.size ?? 0,
      type: originalFile?.type ?? 'application/octet-stream',
      fileType: originalFile?.fileType ?? FileType.UNKNOWN,
      status: FileStatus.COMPLETE,
      sourceType: DataSourceType.COPY,
      isVirtualCopy: true,
      originalSourceFileId: dataset.sourceFileId
    };

    projectStore.addVirtualSourceFile(virtualFile);

    const newDataset: DatasetResult = {
      ...dataset,
      id: newId,
      name: copyName,
      tableName: newTableName,
      sourceFileId: virtualFileId,
      columns: [...dataset.columns],
      metadata: {
        ...dataset.metadata,
        processedAt: new Date(),
        transformations: []
      }
    };

    state.datasets = [...state.datasets, newDataset];

    await duckDBOrchestrator.registerExistingTable(
      newTableName,
      newDataset.sourceFileId,
      copyName,
      {
        geoDetection: newDataset.geoDetection
      }
    );

    logger.success('Dataset duplicated successfully', LogCategory.STORE, {
      originalId: datasetId,
      newId,
      newTableName,
      virtualFileId
    });

    return newId;
  } catch (error) {
    logger.error('Failed to duplicate dataset', LogCategory.STORE, error);
    return null;
  } finally {
    endProcessing();
  }
}
