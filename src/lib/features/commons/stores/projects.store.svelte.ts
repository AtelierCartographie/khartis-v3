import type { SavedProjectMetadata } from '$lib/features/project-management';
import { projectRepository } from '$lib/features/project-management';
import * as m from '$lib/paraglide/messages';
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
    id: string,
    newName?: string
  ): Promise<SavedProjectMetadata | undefined> {
    const newProjectId = await projectStore.duplicateProject(id, newName);
    await refresh();
    return getProjectById(newProjectId);
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
    openProject
  };
}

export const projectsStore = createProjectsStore();
