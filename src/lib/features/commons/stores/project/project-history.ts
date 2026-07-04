import type {
  KhartisProject,
  ProjectHistoryEntry
} from '$lib/features/project-management';
import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
import { deepCloneForStorage } from '$lib/features/commons/utils/clone-for-storage.utils';
import type { ProjectStateContainer } from './project-state.svelte';

function cloneDate(value: unknown): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  return new Date(value as string | number);
}

function cloneFileMetadataForHistory(file: UploadedFile): UploadedFile {
  const {
    content: _content,
    originalFile: _originalFile,
    relatedFileObjects: _relatedFileObjects,
    relatedFilesData: _relatedFilesData,
    parsedData: _parsedData,
    preparedGeoJSON: _preparedGeoJSON,
    ...metadata
  } = file;

  return metadata as UploadedFile;
}

function cloneProjectForHistory(project: KhartisProject): KhartisProject {
  return deepCloneForStorage({
    ...project,
    manifest: {
      ...project.manifest,
      createdAt: cloneDate(project.manifest.createdAt),
      updatedAt: cloneDate(project.manifest.updatedAt)
    },
    data: {
      ...project.data,
      sourceFiles: project.data.sourceFiles.map(cloneFileMetadataForHistory)
    }
  }) as KhartisProject;
}

export function resetHistory(container: ProjectStateContainer): void {
  container._state.history = [];
  container._state.historyIndex = -1;
}

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
    ? cloneProjectForHistory(projectToSnapshot)
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
    container._state.currentProject = cloneProjectForHistory(
      entry.snapshot as KhartisProject
    );
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
    container._state.currentProject = cloneProjectForHistory(
      entry.snapshot as KhartisProject
    );
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
