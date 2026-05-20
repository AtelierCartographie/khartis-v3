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

import { exportProject, createArchive } from './io/exporter';
import { importProject } from './io/importer';

export const projectFiles = {
  exportProject,
  createArchive,
  importProject
};
