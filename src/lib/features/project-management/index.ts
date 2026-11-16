export { ProjectStorageKey } from './types';
export type {
  KhartisProject,
  ListedProjectMetadata,
  ProjectData,
  ProjectState,
  SavedProjectMetadata
} from './types';

export { PROJECT_CONST } from './constants';

export { projectRepository } from './services/persistence.service';

export { projectStorage } from './services/storage.service';

export {
  readBrowserStorageStatus,
  type BrowserStorageStatus
} from './services/storage-quota.service';

export {
  persistTableSnapshot,
  sweepStorageGarbage
} from './services/asset-store.service';

export { persistCustomBasemapSource } from './services/custom-basemap-source.service';
export { restoreCustomBasemapTables } from './services/custom-basemap-restore.service';

export { duplicateProject } from './operations/duplicate';

import { createArchive } from './io/exporter';
import { importProject } from './io/importer';

export const projectFiles = {
  createArchive,
  importProject
};
