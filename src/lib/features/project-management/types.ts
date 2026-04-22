import type { UploadedFile } from '$lib/features/commons/store/create-project.types';

export interface ProjectManifest {
  version: string;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  author?: string;
  description?: string;
  format: 'kh' | 'khartis';
}

export interface ProjectData {
  sourceFiles: UploadedFile[];
  basemap?: {
    type: string;
    id: string;
    data?: Record<string, unknown>;
  };
}

export interface KhartisProject {
  id: string;
  manifest: ProjectManifest;
  data: ProjectData;
}

export interface ProjectState {
  currentProject?: KhartisProject;
  isDirty: boolean;
  lastSaved?: Date;
  autoSaveEnabled: boolean;
  autoSaveInterval: number;
  history: ProjectHistoryEntry[];
  historyIndex: number;
  maxHistorySize: number;
  isInitialized: boolean;
  isLoading: boolean;
}

export interface ProjectHistoryEntry {
  timestamp: Date;
  action: string;
  description?: string;
  snapshot?: Partial<KhartisProject>;
}

export interface SavedProjectMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  size: number;
}

export enum ProjectStorageKey {
  CURRENT = 'khartis_current_project',
  METADATA = 'khartis_projects_metadata'
}
