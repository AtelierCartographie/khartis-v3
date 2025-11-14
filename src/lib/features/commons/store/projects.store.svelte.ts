import { sanitizeProjectName } from '../utils/sanitize.utils';
import { ProjectValidator } from '../utils/validation.utils';
import { projectStore } from './project.store.svelte';
import { projectRepository } from '$lib/features/project-management';
import type { SavedProjectMetadata } from '$lib/features/project-management';

interface ProjectsState {
  projects: SavedProjectMetadata[];
  currentProject?: SavedProjectMetadata;
  isLoading: boolean;
  error?: string;
}

class ProjectsStore {
  private _state = $state<ProjectsState>({
    projects: [],
    currentProject: undefined,
    isLoading: false,
    error: undefined
  });

  constructor() {
    if (typeof window !== 'undefined') {
      this.refresh();
    }
  }

  get projects(): SavedProjectMetadata[] {
    return this._state.projects;
  }

  get currentProject(): SavedProjectMetadata | undefined {
    return this._state.currentProject;
  }

  get isLoading(): boolean {
    return this._state.isLoading;
  }

  get error(): string | undefined {
    return this._state.error;
  }

  async refresh(): Promise<void> {
    this._state.isLoading = true;
    this._state.error = undefined;

    try {
      const metadata = await projectRepository.listMetadata();
      const normalized = metadata.map((entry) => ({
        ...entry,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt)
      }));

      this._state.projects = normalized;

      const currentId = projectStore.currentProject?.id;
      this._state.currentProject = currentId
        ? this._state.projects.find((project) => project.id === currentId)
        : undefined;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load projects';
      this._state.error = message;
    } finally {
      this._state.isLoading = false;
    }
  }

  getProjectById(id: string): SavedProjectMetadata | undefined {
    return this._state.projects.find((project) => project.id === id);
  }

  async duplicateProject(
    id: string
  ): Promise<SavedProjectMetadata | undefined> {
    const newProjectId = await projectStore.duplicateProject(id);
    await this.refresh();
    return this.getProjectById(newProjectId);
  }

  async updateProject(
    id: string,
    updates: Partial<Pick<SavedProjectMetadata, 'name' | 'description'>>
  ): Promise<SavedProjectMetadata | undefined> {
    const project = await projectRepository.load(id);

    if (!project) {
      throw new Error('Project not found');
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
    await this.refresh();

    return this.getProjectById(id);
  }

  async openProject(id: string): Promise<void> {
    await projectStore.loadProject(id);
    await this.refresh();
  }
}

export const projectsStore = new ProjectsStore();
