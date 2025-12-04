/**
 * Serialization Types - Centralized type definitions for project serialization
 *
 * These types provide proper typing for serialization/deserialization operations,
 * replacing 'any' types throughout the codebase.
 */

import type {
  ColumnTransformation,
  UploadedFile
} from '$lib/features/commons/store/create-project.types';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

/**
 * Serialized project data structure (JSON-safe)
 * All Date objects are converted to ISO strings
 */
export interface SerializedProject {
  id: string;
  manifest: {
    version: string;
    createdAt: string; // ISO date string
    updatedAt: string; // ISO date string
    name: string;
    description?: string;
  };
  data?: SerializedProjectData;
  visualization?: unknown; // TODO: Type visualization state
  layout?: unknown; // TODO: Type layout state
  resources?: unknown; // TODO: Type resources
}

/**
 * Custom basemap attribute for serialization
 */
export interface SerializedBasemapAttribute {
  raw: string;
  id: string;
  variant: string;
  normalized: string;
  basemap: string;
  basemap_count: number;
}

/**
 * Serialized project data (files and datasets)
 */
export interface SerializedProjectData {
  sourceFiles?: SerializedUploadedFile[];
  customBasemaps?: {
    metadata: BasemapMetadata[];
    attributes: SerializedBasemapAttribute[];
  };
  [key: string]: unknown;
}

/**
 * Serialized uploaded file structure
 * ArrayBuffer content is converted to number array for JSON serialization
 */
export interface SerializedUploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  fileType: string;
  status: 'uploading' | 'processing' | 'complete' | 'error' | 'edit';
  errorMessage?: string;
  validation?: unknown;
  sourceType?: string;
  relatedFiles?: string[];
  relatedFilesData?: Record<string, number[]>;
  uploadProgress?: number;
  parsedData?: unknown;
  statistics?: unknown;
  preparedGeoJSON?: string;
  duplicates?: UploadedFile['duplicates'];
  deepAnalysis?: UploadedFile['deepAnalysis'];
  geoMatchResult?: UploadedFile['geoMatchResult'];
  columnTransformations?: ColumnTransformation[];
  deletedRowIds?: number[];
  content?: string | number[]; // string or ArrayBuffer as number[]
  contentType?: 'string' | 'arraybuffer';
  // Join state persistence
  joinedBasemap?: string;
  geoColumn?: string;
  gpsMode?: boolean;
  gpsColumns?: { lat: string; lon: string };
}
