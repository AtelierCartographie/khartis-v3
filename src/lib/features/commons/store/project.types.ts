import type { UploadedFile } from './create-project.types';

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
  processedData?: any;
  joinedData?: any;
  basemap?: {
    type: string;
    id: string;
    data?: any;
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
  classification?: any;
  palette?: any;
  parameters?: Record<string, any>;
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
  elements?: any[];
}

export interface KhartisProject {
  id: string;
  manifest: ProjectManifest;
  data: ProjectData;
  visualization?: VisualizationConfig;
  layout?: LayoutConfig;
  resources?: Record<string, any>;
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
