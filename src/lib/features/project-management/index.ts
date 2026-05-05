export { ProjectStorageKey } from './types';
export type {
  KhartisProject,
  ProjectData,
  ProjectHistoryEntry,
  ProjectManifest,
  ProjectState,
  SavedProjectMetadata
} from './types';

export { PROJECT_CONST } from './constants';

export {
  persistenceRegistry,
  SavePriority,
  type SavePriorityType,
  type PersistenceEntry
} from './core/persistence-registry';

export { migrateIfNeeded, type SchemaMigration } from './core/schema-migration';

export { projectRepository } from './services/persistence.service';

export { projectStorage } from './services/storage.service';

export { duplicateProject } from './operations/duplicate';

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
