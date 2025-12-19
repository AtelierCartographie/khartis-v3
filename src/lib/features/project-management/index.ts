export { ProjectStorageKey } from './types';
export type {
  AutoSaveConfig,
  KhartisProject,
  LayoutConfig,
  ProjectData,
  ProjectHistoryEntry,
  ProjectManifest,
  ProjectState,
  SavedProjectMetadata,
  VisualizationConfig
} from './types';

export { PROJECT_CONST } from './constants';

export { projectRepository } from './core/persistence';

export { projectStorage } from './core/storage';

export { duplicateProject } from './operations/duplicate';

export { AutoSaveController } from './operations/auto-save';

export const projectFiles = {
  exportProject: async (
    project: Parameters<typeof import('./io/exporter').exportProject>[0]
  ) => {
    const { exportProject } = await import('./io/exporter');
    return exportProject(project);
  },
  createArchive: async (
    project: Parameters<typeof import('./io/exporter').createArchive>[0]
  ) => {
    const { createArchive } = await import('./io/exporter');
    return createArchive(project);
  },
  importProject: async (
    file: Parameters<typeof import('./io/importer').importProject>[0]
  ) => {
    const { importProject } = await import('./io/importer');
    return importProject(file);
  }
};
