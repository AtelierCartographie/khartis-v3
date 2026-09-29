import type { ProjectState } from '$lib/features/project-management';
import { DEFAULT_DEBOUNCE_INTERVAL } from '$lib/features/project-management/core';

export const DEFAULT_AUTO_SAVE_INTERVAL = DEFAULT_DEBOUNCE_INTERVAL;

export function createProjectState(): ProjectState {
  return {
    currentProject: undefined,
    isDirty: false,
    lastSaved: undefined,
    autoSaveEnabled: true,
    autoSaveInterval: DEFAULT_AUTO_SAVE_INTERVAL,
    isInitialized: false,
    isLoading: false
  };
}

export interface ProjectStateContainer {
  _state: ProjectState;
}
