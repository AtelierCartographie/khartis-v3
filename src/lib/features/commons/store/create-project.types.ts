import type { ParsedData } from '$lib/types/data';
import type { DataAnalysisResult } from '../utils/deep-validator.utils';

export type ProjectTab = 1 | 2 | 3;

export enum FileType {
  CSV = 'csv',
  TSV = 'tsv',
  GEOJSON = 'geojson',
  SHAPEFILE = 'shapefile',
  GEOPACKAGE = 'geopackage',
  GEOPARQUET = 'geoparquet',
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
  originalFile?: File; // Keep reference to original File object to avoid re-parsing
  parsedData?: ParsedData;
  /**
   * Optional normalized GeoJSON content generated during preprocessing
   * so downstream services (DuckDB) can reuse it without re-stringifying.
   */
  preparedGeoJSON?: string;
  status: 'uploading' | 'processing' | 'complete' | 'edit' | 'error';
  errorMessage?: string;
  validation?: FileValidation;
  sourceType: DataSourceType;
  relatedFiles?: string[];
  uploadProgress?: number;
  statistics?: Record<string, unknown>;
  duplicates?: {
    hasDuplicates: boolean;
    duplicateCount: number;
  };
  deepAnalysis?: DataAnalysisResult;
  geoMatchResult?: Record<string, unknown>;
  // Cached dataset snapshots are no longer persisted – the pipeline reloads from DuckDB
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
  visualizations?: Record<string, unknown>[];
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
