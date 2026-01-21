import type {
  KhartisProject,
  ProjectHistoryEntry
} from '$lib/features/project-management';
import { bigIntReplacer } from '$lib/features/commons/utils/clone.utils';
import type { ProjectStateContainer } from './project-state.svelte';

export function addToHistory(
  container: ProjectStateContainer,
  action: string,
  snapshot?: KhartisProject
): void {
  if (container._state.historyIndex < container._state.history.length - 1) {
    container._state.history = container._state.history.slice(
      0,
      container._state.historyIndex + 1
    );
  }

  const projectToSnapshot = snapshot || container._state.currentProject;
  const clonedSnapshot = projectToSnapshot
    ? (JSON.parse(
        JSON.stringify(projectToSnapshot, bigIntReplacer)
      ) as KhartisProject)
    : undefined;

  const entry: ProjectHistoryEntry = {
    timestamp: new Date(),
    action,
    snapshot: clonedSnapshot
  };

  container._state.history.push(entry);
  container._state.historyIndex++;

  if (container._state.history.length > container._state.maxHistorySize) {
    container._state.history.shift();
    container._state.historyIndex--;
  }
}

export function undo(container: ProjectStateContainer): boolean {
  if (container._state.historyIndex <= 0) {
    return false;
  }

  container._state.historyIndex--;
  const entry = container._state.history[container._state.historyIndex];

  if (entry.snapshot) {
    container._state.currentProject = JSON.parse(
      JSON.stringify(entry.snapshot, bigIntReplacer)
    ) as KhartisProject;
    return true;
  }
  return false;
}

export function redo(container: ProjectStateContainer): boolean {
  if (container._state.historyIndex >= container._state.history.length - 1) {
    return false;
  }

  container._state.historyIndex++;
  const entry = container._state.history[container._state.historyIndex];

  if (entry.snapshot) {
    container._state.currentProject = JSON.parse(
      JSON.stringify(entry.snapshot, bigIntReplacer)
    ) as KhartisProject;
    return true;
  }
  return false;
}

export function canUndo(container: ProjectStateContainer): boolean {
  return container._state.historyIndex > 0;
}

export function canRedo(container: ProjectStateContainer): boolean {
  return container._state.historyIndex < container._state.history.length - 1;
}
