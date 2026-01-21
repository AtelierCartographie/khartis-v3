import type {
  KhartisProject,
  ProjectHistoryEntry,
  ProjectState
} from '$lib/features/project-management';
import { AutoSaveController } from '$lib/features/project-management';

export const DEFAULT_AUTO_SAVE_INTERVAL = 30000;
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
  autoSave: AutoSaveController;
  initPromise?: Promise<void>;
}

export function getProject(
  container: ProjectStateContainer
): KhartisProject | undefined {
  return container._state.currentProject;
}

export function setProject(
  container: ProjectStateContainer,
  project: KhartisProject | undefined
): void {
  container._state.currentProject = project;
}

export function getProjectName(container: ProjectStateContainer): string {
  return container._state.currentProject?.manifest.name || '';
}

export function isDirty(container: ProjectStateContainer): boolean {
  return container._state.isDirty;
}

export function setDirty(
  container: ProjectStateContainer,
  dirty: boolean
): void {
  container._state.isDirty = dirty;
}

export function getLastSaved(
  container: ProjectStateContainer
): Date | undefined {
  return container._state.lastSaved;
}

export function setLastSaved(
  container: ProjectStateContainer,
  date: Date | undefined
): void {
  container._state.lastSaved = date;
}

export function isAutoSaveEnabled(container: ProjectStateContainer): boolean {
  return container._state.autoSaveEnabled;
}

export function setAutoSaveEnabled(
  container: ProjectStateContainer,
  enabled: boolean
): void {
  container._state.autoSaveEnabled = enabled;
}

export function getAutoSaveInterval(container: ProjectStateContainer): number {
  return container._state.autoSaveInterval;
}

export function setAutoSaveInterval(
  container: ProjectStateContainer,
  interval: number
): void {
  container._state.autoSaveInterval = interval;
}

export function getHistory(
  container: ProjectStateContainer
): ProjectHistoryEntry[] {
  return container._state.history;
}

export function setHistory(
  container: ProjectStateContainer,
  history: ProjectHistoryEntry[]
): void {
  container._state.history = history;
}

export function getHistoryIndex(container: ProjectStateContainer): number {
  return container._state.historyIndex;
}

export function setHistoryIndex(
  container: ProjectStateContainer,
  index: number
): void {
  container._state.historyIndex = index;
}

export function getMaxHistorySize(container: ProjectStateContainer): number {
  return container._state.maxHistorySize;
}

export function isInitialized(container: ProjectStateContainer): boolean {
  return container._state.isInitialized;
}

export function setInitialized(
  container: ProjectStateContainer,
  initialized: boolean
): void {
  container._state.isInitialized = initialized;
}

export function isLoading(container: ProjectStateContainer): boolean {
  return container._state.isLoading;
}

export function setLoading(
  container: ProjectStateContainer,
  loading: boolean
): void {
  container._state.isLoading = loading;
}

export function canUndo(container: ProjectStateContainer): boolean {
  return container._state.historyIndex > 0;
}

export function canRedo(container: ProjectStateContainer): boolean {
  return container._state.historyIndex < container._state.history.length - 1;
}

export function updateProjectManifest(
  container: ProjectStateContainer,
  updates: Partial<KhartisProject['manifest']>
): void {
  if (!container._state.currentProject) {
    return;
  }
  container._state.currentProject.manifest = {
    ...container._state.currentProject.manifest,
    ...updates,
    updatedAt: new Date()
  };
}
