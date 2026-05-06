import { globalActions } from '$lib/features/commons/stores/global.svelte';
import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
import { ToolbarStep } from '$lib/features/commons/types/global';
import type { MainToolbarState } from '../types';
export type { MainToolbarState } from '../types';

const DEFAULT_STATE: MainToolbarState = {
  canNavigateToVisualization: false,
  hasValidData: false,
  currentProjectName: ''
};

export const mainToolbarState = $state<MainToolbarState>({ ...DEFAULT_STATE });

export const mainToolbarActions = {
  async navigateToVisualization(): Promise<void> {
    if (projectStore.isDirty) {
      await projectStore.saveCurrentProject();
    }

    const hasProject = !!projectStore.currentProject;
    const sourceFiles = projectStore.currentProject?.data?.sourceFiles || [];
    const hasFiles = sourceFiles.length > 0;
    if (hasProject && hasFiles) {
      globalActions.setNavigationState(ToolbarStep.Visualizations);
    }
  }
};
