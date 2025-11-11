/**
 * Serialization Types - Centralized type definitions for project serialization
 *
 * These types provide proper typing for serialization/deserialization operations,
 * replacing 'any' types throughout the codebase.
 */

import type { KhartisProject } from '$lib/features/commons/store/project.types';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';

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
 * Serialized project data (files and datasets)
 */
export interface SerializedProjectData {
  sourceFiles?: SerializedUploadedFile[];
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
  uploadProgress?: number;
  parsedData?: unknown;
  statistics?: unknown;
  content?: string | number[]; // string or ArrayBuffer as number[]
  contentType?: 'string' | 'arraybuffer';
}

/**
 * Type guards for serialized data
 */
export function isSerializedProject(data: unknown): data is SerializedProject {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.manifest === 'object' &&
    obj.manifest !== null
  );
}

export function isSerializedUploadedFile(
  data: unknown
): data is SerializedUploadedFile {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.size === 'number' &&
    typeof obj.type === 'string'
  );
}

/**
 * Serializer interface for type-safe serialization
 */
export interface ISerializer<TSource, TSerialized> {
  serialize(source: TSource): TSerialized;
  deserialize(serialized: TSerialized): TSource;
}

/**
 * Project serializer interface
 */
export type ProjectSerializer = ISerializer<KhartisProject, SerializedProject>;

/**
 * File serializer interface
 */
export type FileSerializer = ISerializer<UploadedFile, SerializedUploadedFile>;
