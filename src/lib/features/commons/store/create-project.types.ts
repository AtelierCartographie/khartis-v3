import {
  ExampleCategory,
  FileStatus
} from '$lib/features/commons/constants/ui.constants';
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
  ARROW = 'arrow',
  KML = 'kml',
  KMZ = 'kmz',
  GPX = 'gpx',
  ZIP = 'zip',
  UNKNOWN = 'unknown'
}

export enum DataSourceType {
  FILE_UPLOAD = 'file_upload',
  PASTE = 'paste',
  URL = 'url',
  COPY = 'copy'
}

export interface FileValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export type ColumnTransformationType =
  | 'rename'
  | 'drop'
  | 'type_change'
  | 'refine'
  | 'replace';

export const COLUMN_TRANSFORMATION_TYPES = {
  RENAME: 'rename',
  DROP: 'drop',
  TYPE_CHANGE: 'type_change',
  REFINE: 'refine',
  REPLACE: 'replace'
} as const;

export interface ColumnTransformation {
  type: ColumnTransformationType;
  column: string;
  newValue?: string;
  searchValue?: string;
  timestamp: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  fileType: FileType;
  content?: string | ArrayBuffer;
  originalFile?: File; // Keep reference to original File object to avoid re-parsing
  relatedFileObjects?: File[]; // For shapefiles: store all companion File objects (.shx, .dbf, .prj, etc.)
  parsedData?: ParsedData;
  /**
   * Optional normalized GeoJSON content generated during preprocessing
   * so downstream services (DuckDB) can reuse it without re-stringifying.
   */
  preparedGeoJSON?: string;
  status: FileStatus;
  errorMessage?: string;
  validation?: FileValidation;
  sourceType: DataSourceType;
  relatedFiles?: string[];
  relatedFilesData?: Record<string, ArrayBuffer>;
  uploadProgress?: number;
  statistics?: Record<string, unknown>;
  duplicates?: {
    hasDuplicates: boolean;
    duplicateCount: number;
  };
  deepAnalysis?: DataAnalysisResult;
  geoMatchResult?: Record<string, unknown>;
  columnTransformations?: ColumnTransformation[];
  deletedRowIds?: number[];
  joinedBasemap?: string;
  geoColumn?: string;
  gpsMode?: boolean;
  gpsColumns?: { lat: string; lon: string };
  sourceArchive?: string;
  duckdbTableName?: string;
  shapefileBaseName?: string;
  missingShapefileComponents?: string[];
  isVirtualCopy?: boolean;
  originalSourceFileId?: string;
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

export { ExampleCategory, FileStatus };

export interface CreateProjectState {
  selectedTab: ProjectTab;

  newProject: {
    uploadedFiles: UploadedFile[];
    pastedData: string;
    onlineFileUrl: string;
    projectName: string;
    isLoading: boolean;
    isProcessingFiles: boolean;
    processingFileCount: number;
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
