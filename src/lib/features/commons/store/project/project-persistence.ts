import {
  ProjectStorageKey,
  projectFiles,
  projectRepository,
  projectStorage,
  persistenceRegistry,
  SavePriority,
  type SavePriorityType
} from '$lib/features/project-management';
import { deserializeUploadedFile } from '$lib/features/project-management/core/serializer';
import type {
  SerializedProjectData,
  SerializedUploadedFile
} from '$lib/types/serialization.types';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { m } from '$lib/paraglide/messages';
import { dataOrchestratorService } from '../../services/data-orchestrator.service.svelte';
import { dataTabState } from '../data-tab.store.svelte';
import { datasetsStore } from '../datasets.store.svelte';
import { downloadFile } from '../../utils/file-export.utils';
import { LogCategory, logger } from '../../utils/logger';
import { showError } from '../../utils/notification.utils.svelte';
import { resolvePersistedJoinState } from '../../utils/persisted-join-state.utils';
import { generateProjectFilename } from '../../utils/string.utils';
import { ProjectValidator } from '../../utils/validation.utils';
import type { UploadedFile } from '../create-project.types';
import type { ProjectStateContainer } from './project-state.svelte';
import { addToHistory, resetHistory } from './project-history';

function syncGeoInfoToSourceFiles(container: ProjectStateContainer): void {
  const files = container._state.currentProject?.data?.sourceFiles;
  if (!files) return;
  const selectedSourceFileId = datasetsStore.selectedDataset?.sourceFileId;
  const selectedBasemapId =
    dataTabState.basemapJoin.selectedBasemap ||
    container._state.currentProject?.data?.basemap?.id;
  const selectedGpsColumns =
    dataTabState.geolocation.latitudeColumn &&
    dataTabState.geolocation.longitudeColumn
      ? {
          lat: dataTabState.geolocation.latitudeColumn,
          lon: dataTabState.geolocation.longitudeColumn
        }
      : undefined;

  for (const file of files) {
    const dataset = datasetsStore.datasets.find(
      (d) => d.sourceFileId === file.id
    );
    const duckDataset = dataset?.id
      ? duckDBOrchestrator.getDataset(dataset.id)
      : null;
    Object.assign(
      file,
      resolvePersistedJoinState({
        file,
        duckDataset,
        selectedBasemapId,
        linkedGeoColumn: dataTabState.geolocation.linkedVariableName,
        selectedGpsColumns,
        isSelectedSourceFile: file.id === selectedSourceFileId
      })
    );
  }
}

function hasStoredStatistics(file: UploadedFile | undefined): boolean {
  return Boolean(file?.statistics && Object.keys(file.statistics).length > 0);
}

function hasStoredParsedRows(file: UploadedFile | undefined): boolean {
  return Boolean(
    Array.isArray(file?.parsedData) &&
    file.parsedData.some(
      (row) => row && typeof row === 'object' && Object.keys(row).length > 0
    )
  );
}

function mergePersistedSourceFile(
  currentFile: UploadedFile,
  persistedFile?: UploadedFile
): UploadedFile {
  if (!persistedFile) {
    return currentFile;
  }

  return {
    ...currentFile,
    assetRef: currentFile.assetRef ?? persistedFile.assetRef,
    companionAssetRefs:
      currentFile.companionAssetRefs ?? persistedFile.companionAssetRefs,
    deepAnalysis: currentFile.deepAnalysis ?? persistedFile.deepAnalysis,
    sourceArchive: currentFile.sourceArchive ?? persistedFile.sourceArchive,
    datasetId: currentFile.datasetId ?? persistedFile.datasetId,
    duckdbTableName:
      currentFile.duckdbTableName ?? persistedFile.duckdbTableName,
    statistics: hasStoredStatistics(currentFile)
      ? currentFile.statistics
      : persistedFile.statistics,
    parsedData: hasStoredParsedRows(currentFile)
      ? currentFile.parsedData
      : persistedFile.parsedData
  };
}

async function mergePersistedSourceFiles(
  container: ProjectStateContainer
): Promise<void> {
  const currentProject = container._state.currentProject;
  const currentFiles = currentProject?.data?.sourceFiles;

  if (!currentProject?.id || !currentFiles || currentFiles.length === 0) {
    return;
  }

  const persistedProject = await projectRepository.loadSerialized(
    currentProject.id
  );
  const persistedFiles = (
    persistedProject?.data as SerializedProjectData | undefined
  )?.sourceFiles?.map((file: SerializedUploadedFile) =>
    deserializeUploadedFile(file)
  );
  if (!persistedFiles?.length) {
    return;
  }

  const persistedById = new Map(
    persistedFiles.map((file) => [file.id, file] as const)
  );

  currentProject.data.sourceFiles = currentFiles.map((file) =>
    mergePersistedSourceFile(file, persistedById.get(file.id))
  );
}

export async function saveCurrentProject(
  container: ProjectStateContainer
): Promise<void> {
  if (!container._state.currentProject) {
    return;
  }

  try {
    syncGeoInfoToSourceFiles(container);
    await mergePersistedSourceFiles(container);

    const projectValidation = ProjectValidator.validateProjectSize(
      container._state.currentProject
    );
    if (!projectValidation.isValid) {
      throw new Error(projectValidation.errors.join(', '));
    }

    if (projectValidation.warnings.length > 0) {
      projectValidation.warnings.forEach((warning) => {
        logger.warn(
          `[ProjectStore:saveCurrentProject] ${warning}`,
          LogCategory.PROJECT,
          {
            projectId: container._state.currentProject?.id
          }
        );
      });
    }
    container._state.currentProject.manifest.updatedAt = new Date();

    await projectRepository.save(container._state.currentProject);
    persistenceRegistry.markClean();
    container._state.isDirty = false;
    container._state.lastSaved = new Date();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : m.error_save_project_title();
    logger.error(
      'Failed to save project to IndexedDB',
      LogCategory.PROJECT,
      error
    );
    showError(m.error_save_project_title(), message, error);
    throw error;
  }
}

export async function exportProject(
  container: ProjectStateContainer,
  customName?: string
): Promise<void> {
  if (!container._state.currentProject) {
    return;
  }

  try {
    const blob = await projectFiles.createArchive(
      container._state.currentProject
    );

    const projectName =
      customName || container._state.currentProject.manifest.name;
    const filename = generateProjectFilename(projectName);

    downloadFile(blob, filename);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : m.error_export_project_title();
    showError(m.error_export_project_title(), message, error);
    throw error;
  }
}

export async function importProject(
  container: ProjectStateContainer,
  file: File
): Promise<void> {
  if (container._state.currentProject && container._state.isDirty) {
    await saveCurrentProject(container);
  }

  try {
    const project = await projectFiles.importProject(file);

    container._state.currentProject = project;
    container._state.isDirty = false;
    container._state.lastSaved = new Date();
    resetHistory(container);

    addToHistory(container, m.history_project_imported(), project);

    await projectStorage.save(ProjectStorageKey.CURRENT, project.id);
    await dataOrchestratorService.onProjectChanged();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : m.error_import_project_title();
    showError(m.error_import_project_title(), message, error);
    throw error;
  }
}

export function markDirty(
  container: ProjectStateContainer,
  priority: SavePriorityType = SavePriority.DEBOUNCED
): void {
  container._state.isDirty = true;
  persistenceRegistry.notifyChange('project', priority);
}

export async function markDirtyAndSave(
  container: ProjectStateContainer
): Promise<void> {
  markDirty(container, SavePriority.IMMEDIATE);
  await persistenceRegistry.flush();
}
