import type {
  KhartisProject,
  SavedProjectMetadata
} from '$lib/features/project-management';
import {
  ProjectStorageKey,
  PROJECT_CONST,
  duplicateProject as duplicateProjectEntity,
  projectRepository,
  projectStorage
} from '$lib/features/project-management';
import { m } from '$lib/paraglide/messages';
import { dataOrchestratorService } from '../../services/data-orchestrator.service.svelte';
import { analyticsService } from '../../services/analytics.service';
import { DataValidationError } from '../../pipeline.errors';
import { LogCategory, logger } from '../../utils/logger';
import { showError } from '../../utils/notification.utils.svelte';
import { sanitizeProjectName } from '../../utils/sanitize.utils';
import { ProjectValidator } from '../../utils/validation.utils';
import type { UploadedFile } from '../../types/create-project.types';
import type { ProjectStateContainer } from './project-state.svelte';
import { cleanFileForStorage } from './project-files';
import { addToHistory, resetHistory } from './project-history';
import { saveCurrentProject } from './project-persistence';
import {
  beginProjectRuntime,
  resetProjectRuntimeState
} from './project-runtime.svelte';

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
    throw new DataValidationError(nameValidation.errors.join(', '), 'name', {
      errors: nameValidation.errors
    });
  }

  const sanitizedName = sanitizeProjectName(name);
  const cleanedFiles = files.map(cleanFileForStorage);

  const project: KhartisProject = {
    id: crypto.randomUUID(),
    manifest: {
      version: PROJECT_CONST.SCHEMA_VERSION,
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
  beginProjectRuntime(project.id);
  resetProjectRuntimeState();
  container._state.isDirty = false;
  container._state.lastSaved = new Date();

  addToHistory(container, m.history_project_created(), project);

  await saveCurrentProject(container);
  await projectStorage.save(ProjectStorageKey.CURRENT, project.id);
  await dataOrchestratorService.onProjectChanged();
  analyticsService.trackProjectCreated(files);
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
    beginProjectRuntime(project.id);
    resetProjectRuntimeState({ resetPersistence: false });
    container._state.isDirty = false;
    container._state.lastSaved = new Date();
    resetHistory(container);

    addToHistory(container, m.history_project_loaded(), project);

    await projectStorage.save(ProjectStorageKey.CURRENT, project.id);
    await dataOrchestratorService.onProjectChanged();
    analyticsService.trackProjectOpened('local_storage');
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
      beginProjectRuntime(null);
      resetProjectRuntimeState();
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
      throw new DataValidationError(
        m.history_project_not_found(),
        'projectId',
        { projectId: id }
      );
    }

    const projects = await listProjects();
    const capacityCheck = ProjectValidator.validateStorageCapacity(
      projects.length
    );
    if (!capacityCheck.isValid) {
      throw new DataValidationError(
        capacityCheck.errors.join(', '),
        'projectCapacity',
        {
          errors: capacityCheck.errors,
          projectCount: projects.length
        }
      );
    }

    const duplicationSuffix = m.project_duplicate_suffix();
    const duplicatedName =
      newName || `${originalProject.manifest.name} ${duplicationSuffix}`;
    const nameValidation = ProjectValidator.validateProjectName(duplicatedName);
    if (!nameValidation.isValid) {
      throw new DataValidationError(nameValidation.errors.join(', '), 'name', {
        errors: nameValidation.errors
      });
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

  return projects;
}

export async function clearProject(
  container: ProjectStateContainer
): Promise<void> {
  container._state.currentProject = undefined;
  beginProjectRuntime(null);
  container._state.isDirty = false;
  container._state.lastSaved = undefined;
  resetHistory(container);

  resetProjectRuntimeState();

  await projectStorage.remove(ProjectStorageKey.CURRENT);
  await dataOrchestratorService.onProjectChanged();
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
