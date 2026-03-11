import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import type { SerializedUploadedFile } from '$lib/types/serialization.types';

export interface FileSerializationOptions {
  preserveBinary?: boolean;
}

export function serializeUploadedFile(
  file: UploadedFile,
  options?: FileSerializationOptions
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
    uploadProgress: file.uploadProgress
  } as SerializedUploadedFile;

  if (file.parsedData) {
    serialized.parsedData = file.parsedData;
  }

  if (file.statistics) {
    serialized.statistics = file.statistics;
  }

  if (file.preparedGeoJSON) {
    serialized.preparedGeoJSON = file.preparedGeoJSON;
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

  if (file.content) {
    if (typeof file.content === 'string') {
      serialized.content = file.content;
      serialized.contentType = 'string';
    } else if (file.content instanceof ArrayBuffer) {
      if (options?.preserveBinary) {
        serialized.content = new Uint8Array(file.content);
      } else {
        serialized.content = Array.from(new Uint8Array(file.content));
      }
      serialized.contentType = 'arraybuffer';
    }
  }

  if (file.relatedFilesData) {
    if (options?.preserveBinary) {
      const serializedData: Record<string, Uint8Array> = {};
      for (const [name, buffer] of Object.entries(file.relatedFilesData)) {
        serializedData[name] = new Uint8Array(buffer);
      }
      serialized.relatedFilesData = serializedData;
    } else {
      const serializedData: Record<string, number[]> = {};
      for (const [name, buffer] of Object.entries(file.relatedFilesData)) {
        serializedData[name] = Array.from(new Uint8Array(buffer));
      }
      serialized.relatedFilesData = serializedData;
    }
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
    uploadProgress: data.uploadProgress
  } as UploadedFile;

  if (data.parsedData) {
    file.parsedData = data.parsedData as UploadedFile['parsedData'];
  }

  if (data.statistics) {
    file.statistics = data.statistics as UploadedFile['statistics'];
  }

  if (data.preparedGeoJSON) {
    file.preparedGeoJSON = data.preparedGeoJSON;
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

  if (data.content) {
    if (data.contentType === 'string' && typeof data.content === 'string') {
      file.content = data.content;
    } else if (data.contentType === 'arraybuffer') {
      if (data.content instanceof Uint8Array) {
        file.content = data.content.buffer as ArrayBuffer;
      } else if (Array.isArray(data.content)) {
        file.content = new Uint8Array(data.content).buffer as ArrayBuffer;
      }
    }
  }

  if (data.relatedFilesData) {
    const relatedData: Record<string, ArrayBuffer> = {};
    for (const [name, bytes] of Object.entries(data.relatedFilesData)) {
      if (bytes instanceof Uint8Array) {
        relatedData[name] = bytes.buffer as ArrayBuffer;
      } else {
        relatedData[name] = new Uint8Array(bytes).buffer as ArrayBuffer;
      }
    }
    file.relatedFilesData = relatedData;
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
