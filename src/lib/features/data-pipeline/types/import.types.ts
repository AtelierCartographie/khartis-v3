import type { AssetRef } from '$lib/features/commons/types/create-project.types';
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
  csvOptions?: CsvImportOptions;
}

export type FileFormat = `${FileFormatEnum}`;

export interface UploadedFilePayload {
  id: string;
  name: string;
  size: number;
  type: string;
  datasetId?: string;
  fileType?: string;
  relatedFileObjects?: File[];
  assetRef?: AssetRef;
  companionAssetRefs?: AssetRef[];
  csvOptions?: CsvImportOptions;
}

export type FileInfo = Pick<File, 'name' | 'size' | 'type'>;
