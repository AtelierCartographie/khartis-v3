export type ProjectTab = 1 | 2 | 3;

export enum FileType {
  CSV = 'csv',
  TSV = 'tsv',
  GEOJSON = 'geojson',
  SHAPEFILE = 'shapefile',
  GEOPACKAGE = 'geopackage',
  KML = 'kml',
  KMZ = 'kmz',
  UNKNOWN = 'unknown'
}

export enum DataSourceType {
  FILE_UPLOAD = 'file_upload',
  PASTE = 'paste',
  URL = 'url'
}

export interface FileValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  fileType: FileType;
  content?: string | ArrayBuffer;
  parsedData?: any;
  status: 'uploading' | 'processing' | 'complete' | 'edit' | 'error';
  errorMessage?: string;
  validation?: FileValidation;
  sourceType: DataSourceType;
  relatedFiles?: string[];
  uploadProgress?: number;
  statistics?: Record<string, any>;
  duplicates?: {
    hasDuplicates: boolean;
    duplicateCount: number;
  };
  deepAnalysis?: any;
  geoMatchResult?: any;
}

export interface ExampleProject {
  id: string;
  title: string;
  subtitle: string;
  description?: string;
  category: ExampleCategory;
  thumbnail?: string;
  dataUrl?: string;
  baseMapId?: string;
  visualizations?: any[];
  tags?: string[];
}

export interface SavedProject {
  id: string;
  title: string;
  subtitle: string;
  createdAt: Date;
  thumbnail?: string;
}

export type ExampleCategory =
  | 'all'
  | 'symbols'
  | 'polygons'
  | 'lines'
  | 'texts'
  | 'hybrids';

export interface CreateProjectState {
  selectedTab: ProjectTab;

  newProject: {
    uploadedFiles: UploadedFile[];
    pastedData: string;
    onlineFileUrl: string;
    projectName: string;
    isLoading: boolean;
    error?: string;
    validationErrors: string[];
  };

  openProject: {
    savedProjects: SavedProject[];
    selectedProjectId?: string;
    importedFile?: UploadedFile;
    isLoading: boolean;
    error?: string;
  };

  tryExample: {
    examples: ExampleProject[];
    selectedExampleId?: string;
    selectedCategory: ExampleCategory;
    isLoading: boolean;
    error?: string;
  };
}
