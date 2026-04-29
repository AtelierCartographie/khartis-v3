import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import type { SerializedUploadedFile } from '$lib/types/serialization.types';

export interface FileSerializationOptions {
  preserveBinary?: boolean;
}

function shouldPersistParsedData(file: UploadedFile): boolean {
  return Array.isArray(file.parsedData);
}

export function serializeUploadedFile(
  file: UploadedFile,
  _options?: FileSerializationOptions
): SerializedUploadedFile {
  const serialized = {
    id: file.id,
    name: file.name,
    size: file.size,
    type: file.type,
    fileType: file.fileType,
    status: file.status,
    errorMessage: file.errorMessage,
    validation: file.validation,
    sourceType: file.sourceType,
    relatedFiles: file.relatedFiles,
    assetRef: file.assetRef,
    companionAssetRefs: file.companionAssetRefs,
    uploadProgress: file.uploadProgress
  } as SerializedUploadedFile;

  if (shouldPersistParsedData(file)) {
    serialized.parsedData = file.parsedData;
  }

  if (file.statistics) {
    serialized.statistics = file.statistics;
  }

  if (file.duplicates) {
    serialized.duplicates = file.duplicates;
  }

  if (file.deepAnalysis) {
    serialized.deepAnalysis = file.deepAnalysis;
  }

  if (file.geoMatchResult) {
    serialized.geoMatchResult = file.geoMatchResult;
  }

  if (file.columnTransformations && file.columnTransformations.length > 0) {
    serialized.columnTransformations = file.columnTransformations;
  }

  if (file.deletedRowIds && file.deletedRowIds.length > 0) {
    serialized.deletedRowIds = file.deletedRowIds;
  }

  if (file.sourceArchive) {
    serialized.sourceArchive = file.sourceArchive;
  }

  if (file.duckdbTableName) {
    serialized.duckdbTableName = file.duckdbTableName;
  }

  if (file.datasetId) {
    serialized.datasetId = file.datasetId;
  }

  return serialized;
}

export function deserializeUploadedFile(
  data: SerializedUploadedFile
): UploadedFile {
  const file = {
    id: data.id,
    name: data.name,
    size: data.size,
    type: data.type,
    fileType: data.fileType as UploadedFile['fileType'],
    status: data.status as UploadedFile['status'],
    errorMessage: data.errorMessage,
    validation: data.validation as UploadedFile['validation'],
    sourceType: data.sourceType as UploadedFile['sourceType'],
    relatedFiles: data.relatedFiles,
    assetRef: data.assetRef,
    companionAssetRefs: data.companionAssetRefs,
    uploadProgress: data.uploadProgress
  } as UploadedFile;

  if (data.parsedData) {
    file.parsedData = data.parsedData as UploadedFile['parsedData'];
  }

  if (data.statistics) {
    file.statistics = data.statistics as UploadedFile['statistics'];
  }

  if (data.duplicates) {
    file.duplicates = data.duplicates;
  }

  if (data.deepAnalysis) {
    file.deepAnalysis = data.deepAnalysis;
  }

  if (data.geoMatchResult) {
    file.geoMatchResult = data.geoMatchResult;
  }

  if (data.columnTransformations) {
    file.columnTransformations = data.columnTransformations;
  }

  if (data.deletedRowIds) {
    file.deletedRowIds = data.deletedRowIds;
  }

  if (data.joinedBasemap) {
    file.joinedBasemap = data.joinedBasemap;
  }
  if (data.geoColumn) {
    file.geoColumn = data.geoColumn;
  }
  if (data.gpsMode) {
    file.gpsMode = data.gpsMode;
  }
  if (data.gpsColumns) {
    file.gpsColumns = data.gpsColumns;
  }
  if (data.joinCorrections) {
    file.joinCorrections = data.joinCorrections;
  }
  if (data.sourceArchive) {
    file.sourceArchive = data.sourceArchive;
  }
  if (data.duckdbTableName) {
    file.duckdbTableName = data.duckdbTableName;
  }
  if (data.datasetId) {
    file.datasetId = data.datasetId;
  }

  return file as UploadedFile;
}
