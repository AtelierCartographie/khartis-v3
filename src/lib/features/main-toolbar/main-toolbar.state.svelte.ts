import { globalActions } from '$lib/features/commons/store/global.svelte';
import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { ToolbarStep } from '$lib/features/commons/types/global';

export interface MainToolbarState {
  canNavigateToVisualization: boolean;
  hasValidData: boolean;
  isDataProcessed: boolean;
  isProjectSaved: boolean;
  currentProjectName: string;
}

const DEFAULT_STATE: MainToolbarState = {
  canNavigateToVisualization: false,
  hasValidData: false,
  isDataProcessed: false,
  isProjectSaved: false,
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
