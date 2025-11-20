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
  processedData?: Record<string, unknown>;
  joinedData?: Record<string, unknown>;
  basemap?: {
    type: string;
    id: string;
    data?: Record<string, unknown>;
  };
}

export interface VisualizationConfig {
  type:
    | 'choropleth'
    | 'proportional'
    | 'categorical'
    | 'bivariate'
    | 'combined';
  variables?: string[];
  classification?: Record<string, unknown>;
  palette?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

export interface LayoutConfig {
  pageFormat?: string;
  orientation?: 'portrait' | 'landscape';
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  grid?: {
    enabled: boolean;
    size: number;
  };
  elements?: Record<string, unknown>[];
}

export interface KhartisProject {
  id: string;
  manifest: ProjectManifest;
  data: ProjectData;
  visualization?: VisualizationConfig;
  layout?: LayoutConfig;
  resources?: Record<string, unknown>;
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
  METADATA = 'khartis_projects_metadata',
  AUTOSAVE = 'khartis_autosave',
  PREFERENCES = 'khartis_preferences'
}
