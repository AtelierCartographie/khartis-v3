export {
  createProjectState,
  type ProjectStateContainer,
  DEFAULT_AUTO_SAVE_INTERVAL,
  DEFAULT_MAX_HISTORY_SIZE
} from './project-state.svelte';

export {
  createProject,
  loadProject,
  deleteProject,
  duplicateProject,
  listProjects,
  clearProject,
  loadLastProject,
  resetAllStores
} from './project-lifecycle';

export {
  getSourceFileIndex,
  cleanFileForStorage,
  addFilesToProject,
  addVirtualSourceFile,
  removeFileFromProject,
  renameFile
} from './project-files';

export {
  resetHistory,
  addToHistory,
  undo,
  redo,
  canUndo,
  canRedo
} from './project-history';

export {
  saveCurrentProject,
  exportProject,
  importProject,
  markDirty,
  markDirtyAndSave,
  scheduleAutoSave,
  setAutoSave
} from './project-persistence';

export {
  addColumnTransformation,
  clearColumnTransformations,
  addDeletedRows
} from './project-transformations';
