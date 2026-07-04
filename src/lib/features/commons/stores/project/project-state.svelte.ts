import type { ProjectState } from '$lib/features/project-management';
import { DEFAULT_DEBOUNCE_INTERVAL } from '$lib/features/project-management/core';

export const DEFAULT_AUTO_SAVE_INTERVAL = DEFAULT_DEBOUNCE_INTERVAL;
export const DEFAULT_MAX_HISTORY_SIZE = 50;

export function createProjectState(): ProjectState {
  return {
    currentProject: undefined,
    isDirty: false,
    lastSaved: undefined,
    autoSaveEnabled: true,
    autoSaveInterval: DEFAULT_AUTO_SAVE_INTERVAL,
    history: [],
    historyIndex: -1,
    maxHistorySize: DEFAULT_MAX_HISTORY_SIZE,
    isInitialized: false,
    isLoading: false
  };
}

export interface ProjectStateContainer {
  _state: ProjectState;
}
