import type { AssetRef } from '$lib/features/commons/types/create-project.types';
import type { DataAnalysisResult } from '$lib/features/commons/utils/deep-validator.utils';
import type { FileFormatEnum } from '../types';

export interface CsvImportOptions {
  header: boolean;
  decimalSeparator: string;
  thousandsSeparator?: string;
  delimiter?: string;
}

export interface DatasetMetadata {
  processedAt: Date;
  fileType: string;
  parserUsed: string;
  processingDuration?: number;
  transformations?: string[];
  geoDuckTableReady?: boolean;
  csvOptions?: CsvImportOptions;
}

export type FileFormat = `${FileFormatEnum}`;

export interface UploadedFilePayload {
  id: string;
  name: string;
  size: number;
  type: string;
  datasetId?: string;
  content?: string | ArrayBuffer;
  parsedData?: unknown;
  fileType?: string;
  deepAnalysis?: DataAnalysisResult;
  preparedGeoJSON?: string;
  relatedFileObjects?: File[];
  relatedFilesData?: Record<string, ArrayBuffer | number[]>;
  assetRef?: AssetRef;
  companionAssetRefs?: AssetRef[];
}

export type FileInfo = Pick<File, 'name' | 'size' | 'type'>;

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
