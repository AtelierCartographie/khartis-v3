import type {
  KhartisProject,
  SavedProjectMetadata
} from '$lib/features/project-management';
import {
  ProjectStorageKey,
  duplicateProject as duplicateProjectEntity,
  projectRepository,
  projectStorage,
  persistenceRegistry
} from '$lib/features/project-management';
import { m } from '$lib/paraglide/messages';
import { dataOrchestratorService } from '../../services/data-orchestrator.service.svelte';
import { LogCategory, logger } from '../../utils/logger';
import { showError } from '../../utils/notification.utils.svelte';
import { sanitizeProjectName } from '../../utils/sanitize.utils';
import { ProjectValidator } from '../../utils/validation.utils';
import type { UploadedFile } from '../create-project.types';
import type { ProjectStateContainer } from './project-state.svelte';
import { cleanFileForStorage } from './project-files';
import { addToHistory, resetHistory } from './project-history';
import { saveCurrentProject } from './project-persistence';
import { globalActions } from '../global.svelte';
import { dataTabStore } from '$lib/features/main-toolbar/data-tab/data-tab.store.svelte';
import { dataToolsStore } from '$lib/features/main-toolbar/data-tab/data-tools.store.svelte';

export function resetAllStores(): void {
  persistenceRegistry.resetAll();
  globalActions.resetNavigationState();
  dataTabStore.reset();
  dataToolsStore.reset();
}

export async function createProject(
  container: ProjectStateContainer,
  name: string,
  files: UploadedFile[]
): Promise<void> {
  if (container._state.currentProject) {
    await saveCurrentProject(container);
  }

  const nameValidation = ProjectValidator.validateProjectName(name);
  if (!nameValidation.isValid) {
    throw new Error(nameValidation.errors.join(', '));
  }

  const sanitizedName = sanitizeProjectName(name);
  const cleanedFiles = files.map(cleanFileForStorage);

  resetAllStores();

  const project: KhartisProject = {
    id: crypto.randomUUID(),
    manifest: {
      version: '3.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      name: sanitizedName,
      format: 'kh'
    },
    data: {
      sourceFiles: cleanedFiles
    }
  };

  container._state.currentProject = project;
  container._state.isDirty = false;
  container._state.lastSaved = new Date();

  addToHistory(container, 'Project created', project);

  await saveCurrentProject(container);
  await projectStorage.save(ProjectStorageKey.CURRENT, project.id);
  await dataOrchestratorService.onProjectChanged();
}

export async function loadProject(
  container: ProjectStateContainer,
  id: string
): Promise<void> {
  if (container._state.currentProject && container._state.isDirty) {
    await saveCurrentProject(container);
  }

  const project = await projectRepository.load(id);

  if (project) {
    container._state.currentProject = project;
    container._state.isDirty = false;
    container._state.lastSaved = new Date();
    resetHistory(container);

    addToHistory(container, 'Project loaded', project);

    await projectStorage.save(ProjectStorageKey.CURRENT, project.id);
    await dataOrchestratorService.onProjectChanged();
  }
}

export async function deleteProject(
  container: ProjectStateContainer,
  id: string
): Promise<void> {
  try {
    await projectRepository.remove(id);

    if (container._state.currentProject?.id === id) {
      container._state.currentProject = undefined;
      resetAllStores();
      await projectStorage.remove(ProjectStorageKey.CURRENT);
      await dataOrchestratorService.onProjectChanged();
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : m.error_delete_project_title();
    showError(m.error_delete_project_title(), message, error);
    throw error;
  }
}

export async function duplicateProject(
  container: ProjectStateContainer,
  id: string,
  newName?: string
): Promise<string> {
  try {
    const originalProject = await projectRepository.load(id);

    if (!originalProject) {
      throw new Error('Project not found');
    }

    const projects = await listProjects();
    const capacityCheck = ProjectValidator.validateStorageCapacity(
      projects.length
    );
    if (!capacityCheck.isValid) {
      throw new Error(capacityCheck.errors.join(', '));
    }

    const duplicationSuffix =
      typeof m.project_duplicate_suffix === 'function'
        ? m.project_duplicate_suffix()
        : '(copy)';
    const duplicatedName =
      newName || `${originalProject.manifest.name} ${duplicationSuffix}`;
    const nameValidation = ProjectValidator.validateProjectName(duplicatedName);
    if (!nameValidation.isValid) {
      throw new Error(nameValidation.errors.join(', '));
    }

    const duplicatedProject = duplicateProjectEntity(
      originalProject,
      sanitizeProjectName(duplicatedName)
    );

    await projectRepository.save(duplicatedProject);

    return duplicatedProject.id;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : m.error_duplicate_project_title();
    showError(m.error_duplicate_project_title(), message, error);
    throw error;
  }
}

export async function listProjects(): Promise<SavedProjectMetadata[]> {
  const projects = await projectRepository.listMetadata();

  const storageCheck = ProjectValidator.validateStorageCapacity(
    projects.length
  );
  if (storageCheck.warnings.length > 0) {
    storageCheck.warnings.forEach((warning) => {
      logger.warn(
        `[ProjectStore:listProjects] ${warning}`,
        LogCategory.PROJECT,
        {
          projectCount: projects.length
        }
      );
    });
  }

  return projects;
}

export async function clearProject(
  container: ProjectStateContainer
): Promise<void> {
  container._state.currentProject = undefined;
  container._state.isDirty = false;
  container._state.lastSaved = undefined;
  resetHistory(container);

  resetAllStores();

  await projectStorage.remove(ProjectStorageKey.CURRENT);
}

export async function loadLastProject(
  container: ProjectStateContainer
): Promise<void> {
  const lastProjectId = await projectStorage.load<string>(
    ProjectStorageKey.CURRENT
  );

  if (lastProjectId) {
    try {
      await loadProject(container, lastProjectId);
    } catch (error) {
      logger.error('Failed to load last project', LogCategory.PROJECT, error);
    }
  }
}
