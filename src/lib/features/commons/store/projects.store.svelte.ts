import type { SavedProjectMetadata } from '$lib/features/project-management';
import { projectRepository } from '$lib/features/project-management';
import * as m from '$lib/paraglide/messages';
import { sanitizeProjectName } from '../utils/sanitize.utils';
import { ProjectValidator } from '../utils/validation.utils';
import { projectStore } from './project.store.svelte';

interface ProjectsState {
  projects: SavedProjectMetadata[];
  currentProject?: SavedProjectMetadata;
  isLoading: boolean;
  error?: string;
}

function createProjectsStore() {
  const state = $state<ProjectsState>({
    projects: [],
    currentProject: undefined,
    isLoading: false,
    error: undefined
  });

  async function refresh(): Promise<void> {
    state.isLoading = true;
    state.error = undefined;

    try {
      const metadata = await projectRepository.listMetadata();
      const normalized = metadata.map((entry) => ({
        ...entry,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt)
      }));

      state.projects = normalized;

      const currentId = projectStore.currentProject?.id;
      state.currentProject = currentId
        ? state.projects.find((project) => project.id === currentId)
        : undefined;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : m.history_failed_load_projects();
      state.error = message;
    } finally {
      state.isLoading = false;
    }
  }

  function getProjectById(id: string): SavedProjectMetadata | undefined {
    return state.projects.find((project) => project.id === id);
  }

  async function duplicateProject(
    id: string
  ): Promise<SavedProjectMetadata | undefined> {
    const newProjectId = await projectStore.duplicateProject(id);
    await refresh();
    return getProjectById(newProjectId);
  }

  async function updateProject(
    id: string,
    updates: Partial<Pick<SavedProjectMetadata, 'name' | 'description'>>
  ): Promise<SavedProjectMetadata | undefined> {
    const project = await projectRepository.load(id);

    if (!project) {
      throw new Error(m.history_project_not_found());
    }

    if (updates.name !== undefined) {
      const sanitized = sanitizeProjectName(updates.name);
      const validation = ProjectValidator.validateProjectName(sanitized);

      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }

      project.manifest.name = sanitized;
    }

    if (updates.description !== undefined) {
      project.manifest.description = updates.description;
    }

    project.manifest.updatedAt = new Date();
    await projectRepository.save(project);
    await refresh();

    return getProjectById(id);
  }

  async function openProject(id: string): Promise<void> {
    await projectStore.loadProject(id);
    await refresh();
  }

  if (typeof window !== 'undefined') {
    refresh();
  }

  return {
    get projects(): SavedProjectMetadata[] {
      return state.projects;
    },
    get currentProject(): SavedProjectMetadata | undefined {
      return state.currentProject;
    },
    get isLoading(): boolean {
      return state.isLoading;
    },
    get error(): string | undefined {
      return state.error;
    },
    refresh,
    getProjectById,
    duplicateProject,
    updateProject,
    openProject
  };
}

export const projectsStore = createProjectsStore();
