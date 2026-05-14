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
  | 'calculate'
  | 'replace';

export const COLUMN_TRANSFORMATION_TYPES = {
  RENAME: 'rename',
  DROP: 'drop',
  TYPE_CHANGE: 'type_change',
  REFINE: 'refine',
  CALCULATE: 'calculate',
  REPLACE: 'replace'
} as const;

export interface ColumnTransformation {
  type: ColumnTransformationType;
  column: string;
  newValue?: string;
  searchValue?: string;
  timestamp: string;
}

export type AssetKind = 'primary' | 'companion';

export interface AssetRef {
  assetId: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: AssetKind;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  fileType: FileType;
  content?: string | ArrayBuffer;
  originalFile?: File;
  relatedFileObjects?: File[];
  parsedData?: ParsedData;

  preparedGeoJSON?: string;
  status: FileStatus;
  errorMessage?: string;
  validation?: FileValidation;
  sourceType: DataSourceType;
  relatedFiles?: string[];
  relatedFilesData?: Record<string, ArrayBuffer>;
  assetRef?: AssetRef;
  companionAssetRefs?: AssetRef[];
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
  joinCorrections?: Record<string, string>;
  sourceArchive?: string;
  duckdbTableName?: string;
  shapefileBaseName?: string;
  missingShapefileComponents?: string[];
  isVirtualCopy?: boolean;
  originalSourceFileId?: string;

  datasetId?: string;
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
  referenceBasemapId?: string;
  visualizations?: ExampleVisualizationPreset[];
  tags?: string[];
}

export type ExampleVisualizationPreset =
  | {
      type: 'choropleth';
      variable: string;
      classification?: string;
      classes?: number;
      palette?: string;
    }
  | {
      type: 'proportional';
      variable: string;
      symbol?: string;
      minSize?: number;
      maxSize?: number;
      color?: string;
    }
  | {
      type: 'simple';
      fillColor?: string;
      strokeColor?: string;
      strokeWidth?: number;
    }
  | {
      type: 'bivariate';
      variable1: string;
      variable2: string;
      palette?: string;
    }
  | {
      type: 'flow';
      variable: string;
      curved?: boolean;
    };

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
    warning?: string;
    validationErrors: string[];
  };

  tryExample: {
    examples: ExampleProject[];
    selectedExampleId?: string;
    selectedCategory: ExampleCategory;
    isLoading: boolean;
    error?: string;
  };
}
