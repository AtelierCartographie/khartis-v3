import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import { createProjectState } from '$lib/features/commons/store/create-project.store.svelte';
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

export function getDerivedToolbarState() {
  const hasProject = !!projectStore.currentProject;
  const hasFiles = createProjectState.newProject.uploadedFiles.some(
    (f) => f.status === FileStatus.COMPLETE
  );
  const projectName = projectStore.currentProject?.manifest.name || '';

  return {
    hasProject,
    hasFiles,
    projectName,
    canVisualize: hasProject && hasFiles
  };
}

export const mainToolbarActions = {
  updateToolbarState(): void {
    const hasProject = !!projectStore.currentProject;
    const hasValidFiles =
      (projectStore.currentProject?.data?.sourceFiles?.length ?? 0) > 0;

    mainToolbarState.hasValidData = hasValidFiles;
    mainToolbarState.isProjectSaved = !projectStore.isDirty;
    mainToolbarState.currentProjectName =
      projectStore.currentProject?.manifest.name || '';
    mainToolbarState.canNavigateToVisualization = hasProject && hasValidFiles;
  },

  navigateToVisualization(): void {
    if (projectStore.isDirty) {
      void projectStore.saveCurrentProject();
    }

    const derived = getDerivedToolbarState();
    if (derived.canVisualize) {
      globalActions.setNavigationState(ToolbarStep.Visualizations);
    }
  },

  navigateToData(): void {
    globalActions.setNavigationState(ToolbarStep.Data);
  },

  navigateToStyling(): void {
    const derived = getDerivedToolbarState();
    if (derived.hasProject) {
      globalActions.setNavigationState(ToolbarStep.Styling);
    }
  },

  checkDataCompleteness(): {
    isComplete: boolean;
    missingSteps: string[];
  } {
    const missingSteps = [];

    if (!projectStore.currentProject) {
      missingSteps.push('Create or load a project');
    }

    const derived = getDerivedToolbarState();
    if (!derived.hasFiles) {
      missingSteps.push('Import data files');
    }

    const files = projectStore.currentProject?.data?.sourceFiles || [];
    const hasErrors = files.some((f) => f.status === FileStatus.ERROR);
    if (hasErrors) {
      missingSteps.push('Fix file errors');
    }

    return {
      isComplete: missingSteps.length === 0,
      missingSteps
    };
  },

  reset(): void {
    Object.assign(mainToolbarState, DEFAULT_STATE);
  }
};
