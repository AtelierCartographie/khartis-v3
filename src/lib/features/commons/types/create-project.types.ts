import {
  ExampleCategory,
  FileStatus
} from '$lib/features/commons/constants/ui.constants';
import type { GeometryInfo } from '$lib/features/data-pipeline';

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
  'rename' | 'drop' | 'type_change' | 'refine' | 'calculate' | 'replace';

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

export interface SourceCsvOptions {
  header: boolean;
  decimalSeparator: string;
  thousandsSeparator?: string;
  delimiter?: string;
}

export interface DatasetAttachment {
  sourceFileId: string;
  datasetName: string;
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

  archiveLayerSnapshot?: Uint8Array;
  geometry?: GeometryInfo;
  status: FileStatus;
  errorMessage?: string;
  validation?: FileValidation;
  sourceType: DataSourceType;
  relatedFiles?: string[];
  relatedFilesData?: Record<string, ArrayBuffer>;
  assetRef?: AssetRef;
  companionAssetRefs?: AssetRef[];
  // Parquet copy of the table after an enrichment join: the enrichment file
  // itself is not kept, so reloads read this instead of assetRef.
  enrichmentSnapshot?: AssetRef;
  // File each column an enrichment join added came from, by column name.
  joinedColumnOrigins?: Record<string, string>;
  // Set on a table once it enriched a geo file of the project: the table is
  // then a source of that file rather than a dataset of its own.
  attachedTo?: DatasetAttachment;
  uploadProgress?: number;
  rowCount?: number;
  columnCount?: number;
  statistics?: Record<string, unknown>;
  columnTransformations?: ColumnTransformation[];
  deletedRowIds?: number[];
  // Read options chosen in the CSV options modal, replayed on reload.
  csvOptions?: SourceCsvOptions;
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
  categories: ExampleCategory[];
  thumbnail?: string;
  archiveUrl: string;
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
