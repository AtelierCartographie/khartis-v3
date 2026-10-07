export {
  createProjectState,
  type ProjectStateContainer
} from './project-state.svelte';

export {
  createProject,
  loadProject,
  deleteProject,
  duplicateProject,
  listProjects,
  clearProject,
  loadLastProject
} from './project-lifecycle';

export {
  addFilesToProject,
  addVirtualSourceFile,
  removeFileFromProject,
  renameFile
} from './project-files';

export {
  saveCurrentProject,
  exportProject,
  importProject,
  markDirty,
  type SaveCurrentProjectOptions
} from './project-persistence';

export {
  addColumnTransformation,
  clearColumnTransformations,
  updateFileJoinedBasemap,
  addDeletedRows
} from './project-transformations';
