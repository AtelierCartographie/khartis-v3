import {
  ProjectStorageKey,
  projectFiles,
  projectRepository,
  projectStorage
} from '$lib/features/project-management';
import { m } from '$lib/paraglide/messages';
import { dataOrchestratorService } from '../../services/data-orchestrator.service.svelte';
import { downloadFile } from '../../utils/file-export.utils';
import { LogCategory, logger } from '../../utils/logger';
import { showError } from '../../utils/notification.utils.svelte';
import { generateProjectFilename } from '../../utils/string.utils';
import { ProjectValidator } from '../../utils/validation.utils';
import type { ProjectStateContainer } from './project-state.svelte';
import { addToHistory } from './project-history';

export async function saveCurrentProject(
  container: ProjectStateContainer
): Promise<void> {
  if (!container._state.currentProject) {
    return;
  }

  try {
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
    container._state.history = [];
    container._state.historyIndex = -1;

    addToHistory(container, 'Project imported', project);

    await projectStorage.save(ProjectStorageKey.CURRENT, project.id);
    await dataOrchestratorService.onProjectChanged();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : m.error_import_project_title();
    showError(m.error_import_project_title(), message, error);
    throw error;
  }
}

export function markDirty(container: ProjectStateContainer): void {
  container._state.isDirty = true;
  scheduleAutoSave(container);
}

export function scheduleAutoSave(container: ProjectStateContainer): void {
  container.autoSave.updateConfig({
    enabled: container._state.autoSaveEnabled,
    interval: container._state.autoSaveInterval
  });
  container.autoSave.schedule(container._state.isDirty);
}

export function setAutoSave(
  container: ProjectStateContainer,
  enabled: boolean,
  interval?: number
): void {
  container._state.autoSaveEnabled = enabled;

  if (interval) {
    container._state.autoSaveInterval = interval;
  }

  container.autoSave.updateConfig({
    enabled: container._state.autoSaveEnabled,
    interval: container._state.autoSaveInterval
  });

  if (enabled && container._state.isDirty) {
    scheduleAutoSave(container);
  } else if (!enabled) {
    container.autoSave.cancel();
  }
}
